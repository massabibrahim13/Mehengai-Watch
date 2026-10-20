"""Price agent: the data tools are exact, the guardrail catches bad answers, the loop falls back safely.
No network calls: the model is replaced by a scripted fake, and LangSmith tracing is off in tests."""
import os

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
    h = tools.price_history("tomatoes", start="2024-01-01", end="2024-12-31")
    s = d.series[("tomatoes", "National")]["2024-01-01":"2024-12-31"]
    assert h["from_price_rs"] == round(s.iat[0], 2) and h["to_price_rs"] == round(s.iat[-1], 2)
    assert h["highest"]["price_rs"] == round(s.max(), 2) and len(h["average_price_by_month"]) == 12


def test_long_history_is_summarised_by_year():
    h = tools.price_history("sugar", start="2019")
    assert "average_price_by_year" in h


def test_bad_arguments_come_back_as_errors():
    assert "error" in tools.item_overview("iphone")
    assert "error" in tools.item_overview("sugar", city="Dubai")
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
