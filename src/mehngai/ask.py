"""Answer plain questions about SPI prices: "price of onions in Lahore in March 2024", "cheapest city
for sugar", "how much has petrol gone up since last year", "aata ki qeemat".

Two steps, same rule as the explanation layer — the numbers never come from an LLM:
  1. Understand the question → {items, city, week, since, intent}. Rules first (free, instant);
     only if the rules find no item is Gemini asked, and it may only return that structure, checked
     against the known items and cities.
  2. Answer from the database with a template.

Intents: price (default) · change (since a date; default a year ago) · cheapest / priciest city ·
cities (all 17 cities).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from mehngai.detect.series import same_week_last_year
from mehngai.explain.facts import label, unit_phrase
from mehngai.explain.llm import LLMError, generate
from mehngai.search import items_in_text, normalise

log = logging.getLogger(__name__)

PROMPT_FILE = Path(__file__).parent / "explain" / "prompts" / "parse_question.txt"
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
CITY_ALIASES = {
    "pindi": "Rawalpindi", "isb": "Islamabad", "khi": "Karachi", "lhr": "Lahore", "fsd": "Faisalabad",
    "pesh": "Peshawar", "hyd": "Hyderabad", "lahore": "Lahore", "karachi": "Karachi",
    "لاہور": "Lahore", "کراچی": "Karachi", "اسلام آباد": "Islamabad", "راولپنڈی": "Rawalpindi",
    "پشاور": "Peshawar", "کوئٹہ": "Quetta", "ملتان": "Multan", "فیصل آباد": "Faisalabad",
    "حیدرآباد": "Hyderabad", "سکھر": "Sukkur", "گوجرانوالہ": "Gujranwala", "سیالکوٹ": "Sialkot",
    "سرگودھا": "Sargodha", "بہاولپور": "Bahawalpur", "لاڑکانہ": "Larkana", "بنوں": "Bannu", "خضدار": "Khuzdar",
}
CHEAPEST = re.compile(r"\b(cheapest|lowest|least expensive|sasta|sasti|سستا)\b", re.I)
PRICIEST = re.compile(r"\b(most expensive|highest|costliest|dearest|mehnga|mehngi|مہنگا)\b", re.I)
ALL_CITIES = re.compile(r"\b(all cities|every city|which cities|compare cities|city wise|citywise)\b", re.I)
CHANGE = re.compile(r"\b(change[sd]?|increase[sd]?|rise[ns]?|risen|rose|gone up|went up|go up|fall(en)?|"
                    r"fell|drop(ped)?|decrease[sd]?|since|trend|over the (past|last))\b", re.I)


@dataclass
class Question:
    text: str
    item_ids: list[str] = field(default_factory=list)
    city: str = "National"
    week: pd.Timestamp | None = None        # None = latest report
    since: pd.Timestamp | None = None       # for intent "change"
    intent: str = "price"                   # price | change | cheapest | priciest | cities
    via: str = "rules"                      # rules | ai


@dataclass
class Answer:
    text: str
    table: pd.DataFrame | None = None
    series: dict[str, pd.Series] = field(default_factory=dict)     # item name → price series to chart
    question: Question | None = None


# ── step 1: understanding ────────────────────────────────────────────────────────

def find_city(text: str, cities: list[str]) -> str | None:
    padded = f" {normalise(text)} "
    for city in sorted(cities, key=len, reverse=True):
        if city != "National" and f" {normalise(city)} " in padded:
            return city
    for alias, city in CITY_ALIASES.items():
        if f" {normalise(alias)} " in padded:
            return city
    return None


def find_dates(text: str, latest: pd.Timestamp) -> list[pd.Timestamp]:
    """Dates mentioned, in order: ISO/numeric dates, '14 March 2024', 'March 2024', '2023',
    and relative ones ('last week', 'last month', 'a year ago', 'last year')."""
    t = text.lower()
    found: list[tuple[int, pd.Timestamp]] = []
    for m in re.finditer(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", t):
        found.append((m.start(), pd.Timestamp(int(m[1]), int(m[2]), int(m[3]))))
    for m in re.finditer(r"\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b", t):
        found.append((m.start(), pd.Timestamp(int(m[3]), int(m[2]), int(m[1]))))
    for m in re.finditer(r"\b(?:(\d{1,2})\s+)?([a-z]{3,9})\.?,?\s+(?:(\d{1,2}),?\s+)?(\d{4})\b", t):
        month = MONTHS.get(m[2][:3])
        if month and not any(abs(pos - m.start()) < 3 for pos, _ in found):
            day = int(m[1] or m[3] or 0)
            found.append((m.start(), pd.Timestamp(int(m[4]), month, day) if day
                          else pd.Timestamp(int(m[4]), month, 1) + pd.offsets.MonthEnd(0)))
    for m in re.finditer(r"\b(?:in|since|from|of|during)\s+(20\d{2})\b", t):
        if not any(abs(pos - m.start()) < 12 for pos, _ in found):
            year = int(m[1])
            found.append((m.start(), pd.Timestamp(year, 1, 1) if m[0].startswith(("since", "from"))
                          else pd.Timestamp(year, 12, 31)))
    relative = {r"\blast week\b": pd.Timedelta(weeks=1), r"\blast month\b|\ba month ago\b": pd.Timedelta(weeks=4),
                r"\blast year\b|\ba year ago\b|\bone year ago\b|\b1 year ago\b": pd.Timedelta(weeks=52),
                r"\b(?:6|six) months ago\b": pd.Timedelta(weeks=26)}
    for pattern, delta in relative.items():
        for m in re.finditer(pattern, t):
            found.append((m.start(), latest - delta))
    return [d for _, d in sorted(found)]


def parse_rules(text: str, items: dict, cities: list[str], latest: pd.Timestamp) -> Question:
    q = Question(text=text, item_ids=items_in_text(text, items)[:3])
    q.city = find_city(text, cities) or "National"
    dates = find_dates(text, latest)
    if CHEAPEST.search(text):
        q.intent = "cheapest"
    elif PRICIEST.search(text):
        q.intent = "priciest"
    elif ALL_CITIES.search(text):
        q.intent = "cities"
    elif CHANGE.search(text):
        q.intent = "change"
    if q.intent == "change":
        q.since = dates[0] if dates else latest - pd.Timedelta(weeks=52)
        q.week = dates[1] if len(dates) > 1 else None
    elif dates:
        q.week = dates[0]
    return q


def parse_ai(text: str, items: dict, cities: list[str], latest: pd.Timestamp, cfg: dict) -> Question | None:
    """Ask Gemini to read the question into the same structure; validate every field."""
    catalogue = "\n".join(f"- {i}: {it['name']} ({', '.join(it.get('aliases', [])[:4])})" for i, it in items.items())
    prompt = (PROMPT_FILE.read_text(encoding="utf-8").replace("{items}", catalogue)
              .replace("{cities}", ", ".join(c for c in cities if c != "National"))
              .replace("{latest}", latest.strftime("%Y-%m-%d")).replace("{question}", text))
    try:
        raw = generate(prompt, cfg, json_mode=True)
        data = json.loads(raw)
    except (LLMError, json.JSONDecodeError) as exc:
        log.warning("AI question parsing unavailable: %s", exc)
        return None
    q = Question(text=text, via="ai")
    q.item_ids = [i for i in data.get("item_ids") or [] if i in items][:3]
    q.city = data.get("city") if data.get("city") in cities else "National"
    q.intent = data.get("intent") if data.get("intent") in {"price", "change", "cheapest", "priciest", "cities"} else "price"
    for key in ("week", "since"):
        try:
            setattr(q, key, pd.Timestamp(data[key]) if data.get(key) else None)
        except (ValueError, TypeError):
            setattr(q, key, None)
    if q.intent == "change" and q.since is None:
        q.since = latest - pd.Timedelta(weeks=52)
    return q


def understand(text: str, items: dict, cities: list[str], latest: pd.Timestamp,
               llm_cfg: dict | None = None) -> Question:
    """Rules first; the AI only when the rules found no item (and an LLM config is given)."""
    q = parse_rules(text, items, cities, latest)
    if not q.item_ids and llm_cfg:
        q = parse_ai(text, items, cities, latest, llm_cfg) or q
    return q


# ── step 2: answering from the database ─────────────────────────────────────────

def nearest_week(index: pd.DatetimeIndex, when: pd.Timestamp | None) -> pd.Timestamp:
    """The last report on or before `when` (the first report if `when` is earlier)."""
    if when is None:
        return index.max()
    before = index[index <= when]
    return before.max() if len(before) else index.min()


def rs(x: float) -> str:
    return f"Rs {x:,.2f}"


def answer(q: Question, prices: pd.DataFrame, items: dict) -> Answer:
    """`prices`: long table week_date, item_id, city, price (all cities). Numbers come only from it."""
    if not q.item_ids:
        examples = "wheat flour, sugar, petrol, tomatoes"   # same wording as the website's chat (web/src/lib/ask.ts)
        return Answer("I couldn't find an item PBS tracks in that question. Mehngai Watch covers the 51 "
                      f"essentials in PBS's weekly price survey (e.g. {examples}), in 17 cities, weekly "
                      "since Sep 2019. Try: “price of sugar in Lahore” or “cheapest city for aata”.",
                      question=q)
    lines, tables, series = [], [], {}
    for item_id in q.item_ids:
        item = items[item_id]
        unit = unit_phrase(item["unit"])
        sub = prices[prices["item_id"] == item_id]
        place = "national average" if q.city == "National" else q.city
        city_series = sub[sub["city"] == q.city].set_index("week_date")["price"].sort_index()
        if city_series.empty:
            lines.append(f"PBS doesn't report {item['name'].lower()} for {q.city}.")
            continue
        week = nearest_week(city_series.index, q.week)
        note = (" (our data starts in Sep 2019, so this is the earliest week)"
                if q.week is not None and q.week < city_series.index.min() else "")
        now = city_series.loc[week]
        series[f"{item['name']} — {place}"] = city_series

        if q.intent in ("cheapest", "priciest", "cities"):
            at_week = sub[(sub["week_date"] == week) & (sub["city"] != "National")].sort_values("price")
            national = sub[(sub["week_date"] == week) & (sub["city"] == "National")]["price"]
            if at_week.empty:
                continue
            lo, hi = at_week.iloc[0], at_week.iloc[-1]
            lines.append(f"**{item['name']}**, week ending {label(week)}: cheapest in **{lo.city}** "
                         f"({rs(lo.price)} {unit}), most expensive in **{hi.city}** ({rs(hi.price)}); "
                         f"national average {rs(national.iloc[0])}.{note}")
            t = at_week[["city", "price"]].rename(columns={"city": "City", "price": "Price (Rs)"})
            tables.append(t.assign(Item=item["name"])[["Item", "City", "Price (Rs)"]])
        elif q.intent == "change":
            start = nearest_week(city_series.index, q.since)
            then = city_series.loc[start]
            change = (now / then - 1) * 100
            lines.append(f"**{item['name']}** ({place}): {rs(then)} {unit} in the week ending {label(start)} → "
                         f"{rs(now)} in the week ending {label(week)}, a change of **{change:+.1f}%**.{note}")
        else:
            i = city_series.index.get_loc(week)
            parts = [f"**{item['name']}** ({place}), week ending {label(week)}: **{rs(now)} {unit}**{note}."]
            if i > 0:
                parts.append(f"{(now / city_series.iloc[i - 1] - 1) * 100:+.1f}% vs the previous report")
            year_ago = same_week_last_year(city_series.loc[:week], week)   # same rule as the website
            if year_ago is not None:
                parts.append(f"{(now / year_ago - 1) * 100:+.1f}% vs a year earlier ({rs(year_ago)})")
            lines.append(parts[0] + (" " + "; ".join(parts[1:]) + "." if len(parts) > 1 else ""))
    table = pd.concat(tables, ignore_index=True) if tables else None
    return Answer("\n\n".join(lines), table, series, q)
