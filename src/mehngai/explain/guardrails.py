"""Stage 6c — Guardrails: check the LLM's text before anyone sees it, and a template fallback.

Checks (any failure → regenerate once → if still failing, use the template):
  1. Every number in the text appears in the facts (rounding to 1 or 0 decimals is tolerated).
  2. No banned phrase: no causes we weren't given ("due to", "because"…), no accusations ("hoarding"…).
  3. Ramazan/Eid only mentioned if the facts say it's Ramazan season.
  4. Direction words match the facts (no "rose" for a fall).
  5. Short: at most `max_words` words.
  6. Complete: this week's price and the % change are both in the text.
"""
from __future__ import annotations

import json
import re

# 2,586.37 / 2586.37 / 22 / 4.4 — thousands commas allowed, list commas ("8, 9") are not swallowed.
NUMBER = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?")
RISE_WORDS = re.compile(r"\b(rose|rise[sn]?|jump(ed|s)?|increase[ds]?|climb(ed|s)?|surge[ds]?|spike[ds]?)\b", re.I)
FALL_WORDS = re.compile(r"\b(fell|fall(s|en)?|drop(ped|s)?|decrease[ds]?|decline[ds]?|plunge[ds]?|slump(ed|s)?)\b", re.I)
RAMAZAN_WORDS = re.compile(r"ramazan|ramadan|ramzan|\beid\b", re.I)


def numbers_in(text: str) -> list[float]:
    return [float(n.replace(",", "")) for n in NUMBER.findall(text)]


def allowed_numbers(facts: dict) -> set[float]:
    """Every number in the facts, plus its 1- and 0-decimal roundings."""
    allowed = set()
    for n in numbers_in(json.dumps(facts, ensure_ascii=False)):
        allowed |= {round(n, 2), round(n, 1), float(round(n))}
    return allowed


def check(text: str, facts: dict, banned_phrases: list[str], max_words: int) -> list[str]:
    """Return a list of problems with the text (empty list = passes)."""
    problems = []
    allowed = allowed_numbers(facts)
    invented = [n for n in numbers_in(text) if round(n, 2) not in allowed]
    if invented:
        problems.append(f"numbers not in the facts: {invented}")
    low = text.lower()
    hits = [p for p in banned_phrases if p in low]
    if hits:
        problems.append(f"banned phrases (cause/accusation): {hits}")
    if RAMAZAN_WORDS.search(text) and not facts.get("ramazan_period"):
        problems.append("mentions Ramazan/Eid but it isn't Ramazan season")
    wrong_way = FALL_WORDS if facts["direction"] == "up" else RISE_WORDS
    # "biggest weekly rise since …" is fine for a rise; only flag verbs of the opposite direction
    if wrong_way.search(text):
        problems.append(f"says '{wrong_way.search(text).group(0)}' but the price went {facts['direction']}")
    if len(text.split()) > max_words:
        problems.append(f"too long ({len(text.split())} words > {max_words})")
    # the two numbers a reader needs most must be there (the backup model sometimes leaves the % change out)
    if round(facts["price_this_week_rs"], 2) not in {round(n, 2) for n in numbers_in(text)}:
        problems.append(f"doesn't give this week's price (Rs {fmt(facts['price_this_week_rs'])})")
    if round(abs(facts["change_pct"]), 1) not in {round(n, 1) for n in numbers_in(text)}:
        problems.append(f"doesn't give the % change ({fmt(abs(facts['change_pct']))}%)")
    return problems


def fmt(x: float) -> str:
    """2586.37 → '2,586.37'; 143.0 → '143'."""
    return f"{x:,.2f}".rstrip("0").rstrip(".")


def template(facts: dict) -> str:
    """Plain fallback sentence built only from the facts — passes check() by construction."""
    verb = "rose" if facts["direction"] == "up" else "fell"
    if facts.get("weeks_since_previous_report"):
        verb += f" over {facts['weeks_since_previous_report']} weeks"
    text = (f"{facts['item']} prices {verb} {fmt(facts['change_pct'])}% to "
            f"Rs {fmt(facts['price_this_week_rs'])} {facts['unit']} in the week ending "
            f"{facts['week_ending']}, an {facts['how_unusual']} move for this item")
    if facts.get("times_typical_change"):
        text += (f" (about {fmt(facts['times_typical_change'])} times its typical weekly change of "
                 f"{fmt(facts['typical_weekly_change_pct'])}%)")
    text += "."
    since_key = "biggest_weekly_rise_since" if facts["direction"] == "up" else "biggest_weekly_fall_since"
    move = "increase" if facts["direction"] == "up" else "decrease"
    text += f" It is the largest weekly {move} since {facts[since_key]}."
    return text.replace(" an notable", " a notable")
