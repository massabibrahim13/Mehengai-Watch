"""Price agent: the data tools are exact, the guardrail catches bad answers, the loop falls back safely.
No network calls: the model is replaced by a scripted fake, and LangSmith tracing is off in tests."""
import json
import os
import shutil
import subprocess

os.environ["LANGSMITH_TRACING"] = "false"   # before the agent loads .env: fake test runs must not reach LangSmith

import pandas as pd  # noqa: E402
import pytest  # noqa: E402

from mehngai.agent import agent, tools  # noqa: E402
from mehngai.explain.llm import LLMError

CFG = agent.settings()


@pytest.fixture(scope="module")
def d():
    return tools.data()


# ── tools ──

def test_overview_matches_the_database(d):
    o = tools.item_overview("sugar")
    s = d.series[("sugar", "National")]
    assert o["price_rs"] == round(s.iat[-1], 2) and o["previous_price_rs"] == round(s.iat[-2], 2)
    assert o["latest_week"] == agent.label(d.latest)
    assert o["change_vs_previous_report_pct"] == round((s.iat[-1] / s.iat[-2] - 1) * 100, 1)


def test_times_typical_matches_the_weekly_alert(d):
    for u in d.summary["unusual"]:
        o = tools.item_overview(u["item_id"])
        assert o["flagged_this_week"]["how_unusual"] == u["severity_word"]
        assert f"{o['this_move_times_typical']} times" in u["explanation"] or u["explanation_source"] == "llm"


def test_city_overview_compares_with_national(d):
    o = tools.item_overview("sugar", city="lahore")              # case doesn't matter
    assert o["place"] == "Lahore" and "vs_national_average_pct" in o


def test_compare_cities(d):
    c = tools.compare_cities("wheat_flour")
    prices = [r["price_rs"] for r in c["cities_cheapest_first"]]
    assert prices == sorted(prices) and len(prices) == len(d.cities)
    assert c["gap_dearest_minus_cheapest_rs"] == round(c["dearest"]["price_rs"] - c["cheapest"]["price_rs"], 2)


def test_history_over_a_period(d):
    h = tools.price_history("tomatoes", "1 year")
    s = d.series[("tomatoes", "National")]
    s = s[s.index >= d.latest - pd.Timedelta(weeks=52)]
    assert h["from_price_rs"] == round(s.iat[0], 2) and h["to_price_rs"] == round(s.iat[-1], 2)
    assert h["highest"]["price_rs"] == round(s.max(), 2) and h["to_week"] == agent.label(d.latest)


def test_long_history_is_summarised_by_year():
    assert "average_price_by_year" in tools.price_history("sugar", "since 2019")
    assert "average_price_by_month" in tools.price_history("sugar", "2 years")


def test_bad_arguments_come_back_as_errors():
    assert "error" in tools.item_overview("iphone")
    assert "error" in tools.item_overview("sugar", city="Dubai")
    assert "error" in tools.price_history("sugar", "10 years")
    assert "error" in agent.run_tool({"name": "item_overview", "args": {"colour": "red"}})
    assert "error" in agent.run_tool({"name": "delete_everything", "args": {}})


def test_this_week_is_the_latest_report(d):
    assert tools.this_week()["week"] == d.summary["week_label"]


def test_declarations_list_every_tool():
    assert {t["name"] for t in tools.declarations()} == set(tools.TOOLS)


# ── guardrail ──

def test_numbers_from_the_tools_pass():
    o = tools.item_overview("sugar")
    text = f"Sugar costs **Rs {o['price_rs']:,.2f} {o['unit']}** in the week ending {o['latest_week']}."
    assert agent.check(text, [o], "sugar price?", CFG) == []


def test_invented_number_is_caught():
    o = tools.item_overview("sugar")
    problems = agent.check("Sugar costs Rs 999.99 per kg.", [o], "sugar price?", CFG)
    assert any("not in the tool results" in p for p in problems)


def test_causes_are_caught_but_quoted_headlines_are_not():
    news = {"headlines": [{"title": "Prices rise due to costly food", "source": "Dawn", "date": "1 Oct 2026",
                           "link": "https://example.com"}]}
    assert agent.check("Possibly related: 'Prices rise due to costly food' (Dawn).", [news], "why?", CFG) == []
    assert any("cause" in p for p in agent.check("Prices rose due to hoarding.", [news], "why?", CFG))


def test_too_long_is_caught():
    assert any("too long" in p for p in agent.check("word " * 300, [], "q", CFG))


# ── the loop, with a scripted model ──

def model_says(*turns):
    """Fake call_model: each turn is a text answer (str) or a tool call (dict: name, args)."""
    script, finals = iter(turns), []

    def fake(system, contents, cfg, final=False):
        finals.append(final)
        turn = next(script)
        if isinstance(turn, Exception):
            raise turn
        part = {"text": turn} if isinstance(turn, str) else {"functionCall": turn}
        return {"content": {"role": "model", "parts": [part]}, "thinking": "", "finish_reason": "STOP",
                "usage_metadata": {}}
    return fake, finals


def test_tool_call_then_grounded_answer(monkeypatch):
    o = tools.item_overview("sugar")
    good = f"Sugar is **Rs {o['price_rs']:,.2f} {o['unit']}** (week ending {o['latest_week']})."
    fake, _ = model_says({"name": "item_overview", "args": {"item_id": "sugar"}}, good)
    monkeypatch.setattr(agent, "call_model", fake)
    reply = agent.ask("how much is sugar?")
    assert (reply.text, reply.source, reply.model_turns) == (good, "agent", 2)
    assert reply.tool_calls == [{"name": "item_overview", "args": {"item_id": "sugar"}}]


def test_bad_answer_is_rewritten(monkeypatch):
    o = tools.item_overview("sugar")
    good = f"Sugar is Rs {o['price_rs']:,.2f} {o['unit']}."
    fake, _ = model_says({"name": "item_overview", "args": {"item_id": "sugar"}}, "Sugar is Rs 999.99.", good)
    monkeypatch.setattr(agent, "call_model", fake)
    reply = agent.ask("how much is sugar?")
    assert (reply.text, reply.source) == (good, "agent, rewritten")


def test_twice_bad_falls_back_to_rules(monkeypatch):
    fake, _ = model_says({"name": "item_overview", "args": {"item_id": "sugar"}}, "Rs 999.99.", "Still Rs 999.99.")
    monkeypatch.setattr(agent, "call_model", fake)
    reply = agent.ask("price of sugar")
    assert reply.source == "rules" and reply.text == agent.rules_answer("price of sugar") and reply.problems


def test_ai_down_falls_back_to_rules(monkeypatch):
    fake, _ = model_says(LLMError("HTTP 503"))
    monkeypatch.setattr(agent, "call_model", fake)
    reply = agent.ask("price of sugar")
    assert reply.source == "rules" and "AI unavailable" in reply.problems[0]


def test_last_turn_must_answer(monkeypatch):
    look = {"name": "this_week", "args": {}}
    fake, finals = model_says(look, look, look, "Prices were mostly steady this week.")
    monkeypatch.setattr(agent, "call_model", fake)
    agent.ask("what happened this week?")
    assert finals == [False, False, False, True]          # max_steps = 4: tools are switched off on the last turn


def test_brief_fills_every_placeholder():
    text = agent.brief(CFG)
    assert "{" not in text and "pulse_gram" in text and str(CFG["max_words"]) in text
    assert agent.label(pd.Timestamp(tools.data().latest)) in text


# ── the website's Worker runs the same guardrail (worker/src/guard.ts) ──

def node_version() -> tuple[int, ...] | None:
    node = shutil.which("node")
    if not node:
        return None
    out = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip().lstrip("v")
    return tuple(int(x) for x in out.split(".")[:2])


@pytest.mark.skipif(not node_version() or node_version() < (22, 6), reason="needs Node 22.6+ (runs TypeScript)")
def test_worker_guardrail_gives_the_same_verdicts():
    o, h = tools.item_overview("sugar"), tools.price_history("tomatoes", "1 year")
    news = {"headlines": [{"title": "Prices rise due to costly food", "source": "Dawn", "date": "1 Oct 2026",
                           "link": "https://example.com"}]}
    good = f"Sugar is **Rs {o['price_rs']:,.2f} {o['unit']}** in the week ending {o['latest_week']}, about " \
           f"{round(o['change_vs_a_year_ago_pct'])}% on a year ago."
    cases = [
        (good, [o], "sugar?"),
        ("Sugar is Rs 999.99 per kg.", [o], "sugar?"),                               # invented number
        (f"Tomatoes peaked at Rs {h['highest']['price_rs']:,.2f} in 2026.", [h], "tomatoes?"),
        ("Prices rose because of hoarding.", [o], "why?"),                            # cause + blame
        ("Possibly related: 'Prices rise due to costly food' (Dawn).", [news], "why?"),  # quoted headline: fine
        ("Chana daal rose 9.4 times; 51 items in 17 cities since Sep 2019.", [tools.item_overview("pulse_gram")], "q"),
        ("Tea (Lipton 190 g) is not in the results.", [], "tea?"),                    # item names/units allowed
        ("word " * 260, [], "q"),                                                     # too long
        ("The price was 2,946.72 and 3,443.12 in two cities.", [tools.compare_cities("wheat_flour")], "aata?"),
        ("Up 7 percent since 2021.", [o], "since 2021?"),                             # 2021 from the question, 7 invented
    ]
    setup = {"banned_phrases": CFG["banned_phrases"], "max_words": CFG["max_words"], "guard_context": agent.guard_context()}
    payload = json.dumps({"setup": setup, "cases": [{"text": t, "results": r, "question": q} for t, r, q in cases]},
                         ensure_ascii=False)
    run = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "worker/test/guard_cli.mjs"],
                         input=payload, capture_output=True, text=True, encoding="utf-8", cwd=agent.PROJECT_ROOT)
    assert run.returncode == 0, run.stderr
    kind = lambda problems: sorted(p.split(":")[0].split(" (")[0] for p in problems)
    for (text, results, question), ts in zip(cases, json.loads(run.stdout)):
        assert kind(ts) == kind(agent.check(text, results, question, CFG)), text[:60]
