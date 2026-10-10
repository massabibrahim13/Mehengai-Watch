"""Explanation layer: facts are correct, guardrails catch bad LLM text, template always passes.
No network calls — the LLM itself is not tested here, only what we do with its output."""
import numpy as np
import pandas as pd
import pytest

from mehngai.config import load_settings
from mehngai.explain import __main__ as explain_main
from mehngai.explain.facts import biggest_since, build_facts, unit_phrase
from mehngai.explain.guardrails import allowed_numbers, check, numbers_in, template
from mehngai.explain.llm import LLMError

CFG = load_settings()["explain"]
SUGAR = {"item_id": "sugar", "name": "Sugar (refined)", "unit": "1 kg", "price_type": "market"}


def sugar_series() -> pd.Series:
    """Sugar flat at ~Rs 100 for a year (±0.5%), then +10% in the last week."""
    idx = pd.date_range("2023-01-05", periods=60, freq="W-THU")
    prices = 100 * np.exp(np.cumsum(np.random.default_rng(0).normal(0, 0.005, 60)))
    prices[-1] = prices[-2] * 1.10
    return pd.Series(prices, index=idx)


@pytest.fixture
def facts():
    s = sugar_series()
    return build_facts(SUGAR, s.index[-1], s, "extreme", 52)


# --- facts ---

def test_facts_basics(facts):
    assert facts["direction"] == "up"
    assert facts["change_pct"] == 10.0
    assert facts["unit"] == "per kg"
    assert facts["how_unusual"] == "extreme"
    assert facts["times_typical_change"] > 10            # typical weekly move is ~0.4%
    assert facts["biggest_weekly_rise_since"].startswith("the start of our data")


@pytest.mark.parametrize("unit, phrase", [("1 kg", "per kg"), ("1 dozen", "per dozen"),
                                          ("20 kg bag", "per 20 kg bag"), ("1 kg pouch", "per 1 kg pouch")])
def test_unit_phrase(unit, phrase):
    assert unit_phrase(unit) == phrase


def test_facts_use_no_future_data():
    s = sugar_series()
    week = s.index[-10]
    before = build_facts(SUGAR, week, s, "watch", 52)
    future = s.copy()
    future.iloc[-9:] *= 5
    assert build_facts(SUGAR, week, future, "watch", 52) == before


def test_biggest_since_finds_last_bigger_move():
    idx = pd.date_range("2024-01-04", periods=5, freq="W-THU")
    pct = pd.Series([np.nan, 12.0, -3.0, 2.0, 8.0], index=idx)
    assert biggest_since(pct, 4, 8.0) == "Jan 2024"         # the +12% in week 2 was bigger


# --- guardrails ---

def test_good_text_passes(facts):
    text = (f"The price of sugar (refined) rose {facts['change_pct']}% this week to "
            f"Rs {facts['price_this_week_rs']:,.2f} per kg, an extreme move.")
    assert check(text, facts, CFG["banned_phrases"], CFG["max_words"]) == []


@pytest.mark.parametrize("bad, problem", [
    ("Sugar rose 10% to Rs 999 per kg, an extreme move.", "numbers not in the facts"),
    ("Sugar rose 10% due to rising demand, an extreme move.", "banned phrases"),
    ("Sugar rose 10% as hoarders held back stock.", "banned phrases"),
    ("Sugar rose 10% ahead of Ramazan, an extreme move.", "Ramazan"),
    ("Sugar fell 10% this week, an extreme move.", "price went up"),
    ("Sugar rose 10% " + "and kept going " * 20, "too long"),
])
def test_bad_text_is_caught(facts, bad, problem):
    problems = check(bad, facts, CFG["banned_phrases"], CFG["max_words"])
    assert any(problem in p for p in problems), problems


def test_number_parsing():
    assert numbers_in("Rs 2,586.37 per 20 kg bag, up 42.3%, 8, 9") == [2586.37, 20, 42.3, 8, 9]
    assert {42.3, 42.0} <= allowed_numbers({"change_pct": 42.3})   # 1- and 0-decimal rounding OK


def test_template_always_passes(facts):
    fall = {k: v for k, v in facts.items() if k != "biggest_weekly_rise_since"}
    fall.update(direction="down", biggest_weekly_fall_since="Mar 2023", weeks_since_previous_report=2)
    no_ratio = {**facts, "how_unusual": "notable", "times_typical_change": None}
    for f in (facts, fall, no_ratio):
        text = template(f)
        assert check(text, f, CFG["banned_phrases"], CFG["max_words"]) == [], text


# --- retry and fallback (LLM replaced by a fake) ---

def test_retry_then_fallback(facts, monkeypatch):
    answers = iter(["Sugar rose 10% because of hoarding.", "Sugar rose 11% to Rs 1 per kg."])
    monkeypatch.setattr(explain_main, "generate", lambda prompt, cfg: next(answers))
    monkeypatch.setattr(explain_main.time, "sleep", lambda s: None)
    text, source, attempts = explain_main.explain(facts, CFG)
    assert (source, attempts) == ("template", 2) and text == template(facts)


def test_second_try_can_succeed(facts, monkeypatch):
    good = f"The price of sugar (refined) rose {facts['change_pct']}% this week, an extreme move."
    answers = iter(["Sugar rose 10% due to demand.", good])
    monkeypatch.setattr(explain_main, "generate", lambda prompt, cfg: next(answers))
    monkeypatch.setattr(explain_main.time, "sleep", lambda s: None)
    assert explain_main.explain(facts, CFG) == (good, "llm", 2)


def test_llm_down_uses_template(facts, monkeypatch):
    def down(prompt, cfg):
        raise LLMError("HTTP 500")
    monkeypatch.setattr(explain_main, "generate", down)
    assert explain_main.explain(facts, CFG) == (template(facts), "template", 0)
