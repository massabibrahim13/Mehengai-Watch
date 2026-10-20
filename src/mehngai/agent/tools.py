"""Data tools for the price agent: each one answers one kind of question exactly, from the database.

The model calls these, reasons over what they return, and writes the answer. The guardrail then accepts only
numbers that appear in these results, so every number a reader might want is computed here, rounded the way
the website shows it (prices to 2 decimals, % to 1): "x times its typical weekly move", "% above the national
average", the gap between cities, and so on. The model never has to do arithmetic of its own.

Same no-look-ahead idea as the rest of the project: "typical" always means the reports *before* the one described.

The arguments are a fixed set (51 items × 18 places, 4 history periods), so publish.py can compute every possible
answer ahead of time for the website's agent, which runs in a Cloudflare Worker without Python: the live agent
looks these answers up, so its numbers are exactly the ones these functions give.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import pandas as pd

from mehngai.detect.series import same_week_last_year
from mehngai.explain.facts import SEVERITY_WORDS, label, unit_phrase
from mehngai.export import Exporter
from mehngai.store.db import connect

NATIONAL = "National"
PERIODS = {"3 months": 13, "1 year": 52, "2 years": 104, "since 2019": None}     # weeks back (None = all data)
GROUPS = {
    "market": "market price: moves with supply and demand; checked every week for unusual moves",
    "administered": "set by the government or a regulator (OGRA, NEPRA): changes are official decisions, "
                    "not market moves",
    "fixed": "packaged, branded or hotel price: stays flat for months, then changes in one step",
}


@dataclass
class Data:
    items: dict[str, dict]                         # item_id → item (config/items.yaml)
    prices: pd.DataFrame                           # long table: week_date, item_id, city, price (for ask.py)
    series: dict[tuple[str, str], pd.Series]       # (item_id, city) → weekly price; city "National" = average
    cities: list[str]                              # the 17 survey cities
    flags: pd.DataFrame                            # the production detector's flags (national market items)
    summary: dict                                  # this week, exactly as the website shows it
    news: pd.DataFrame                             # recent price headlines
    latest: pd.Timestamp
    typical_weeks: int


@lru_cache(maxsize=1)
def data() -> Data:
    """Everything the tools need, read once per process (the website's exporter does the shared work)."""
    with connect() as conn:
        exporter = Exporter(conn)
        summary = exporter.summary()
        prices = pd.read_sql_query("SELECT week_date, item_id, city, price FROM prices", conn,
                                   parse_dates=["week_date"])
    series = {key: g.set_index("week_date")["price"].sort_index() for key, g in prices.groupby(["item_id", "city"])}
    cities = sorted(c for c in prices["city"].unique() if c != NATIONAL)
    return Data(exporter.items, prices, series, cities, exporter.flags, summary, exporter.news, exporter.week,
                exporter.typical_weeks)


# ── small helpers ────────────────────────────────────────────────────────────────

def r2(x: float) -> float:
    return round(float(x), 2)


def r1(x: float) -> float:
    return round(float(x), 1)


def lookup(item_id: str, city: str) -> tuple[dict | None, str, dict | None]:
    """(item, city, error): the model's arguments checked against what exists."""
    d = data()
    item = d.items.get(item_id)
    if item is None:
        return None, city, {"error": f"unknown item_id {item_id!r}; use an id from the item list"}
    city = next((c for c in [NATIONAL, *d.cities] if c.lower() == (city or NATIONAL).strip().lower()), None)
    if city is None:
        return item, NATIONAL, {"error": f"PBS has no data for that city; the 17 survey cities are: {', '.join(d.cities)}"}
    return item, city, None


def place(city: str) -> str:
    return "national average of the 17 survey cities" if city == NATIONAL else city


def typical_move(s: pd.Series, i: int, weeks: int) -> float | None:
    """Median size of the weekly % change over the `weeks` reports before position i: 'normal' for this item.
    Not rounded, so ratios match the website's alerts (round only for display)."""
    pct = s.pct_change().iloc[max(1, i - weeks):i].abs() * 100
    return float(pct.median()) if len(pct) else None


def flag_rows(item_id: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    f = data().flags
    return f[(f["item_id"] == item_id) & (f["week_date"] >= start) & (f["week_date"] <= end)].sort_values("week_date")


def flag_dict(row) -> dict:
    return {"week": label(row.week_date), "direction": row.direction, "how_unusual": SEVERITY_WORDS[row.severity],
            "change_pct": r1(row.change_pct)}


# ── the tools ────────────────────────────────────────────────────────────────────

def item_overview(item_id: str, city: str = NATIONAL) -> dict:
    """One item's latest price and whether its latest move is normal for it."""
    item, city, error = lookup(item_id, city)
    if error:
        return error
    d = data()
    s = d.series.get((item_id, city), pd.Series(dtype=float))
    if len(s) < 2:
        return {"error": f"PBS doesn't report {item['name']} for {city}"}
    i, week, now, prev = len(s) - 1, s.index[-1], s.iat[-1], s.iat[-2]
    change = (now / prev - 1) * 100
    typical = typical_move(s, i, d.typical_weeks)
    year = s[s.index > week - pd.Timedelta(weeks=52)]
    out = {
        "item": item["name"], "unit": unit_phrase(item["unit"]), "place": place(city),
        "price_group": GROUPS[item["price_type"]],
        "latest_week": label(week), "price_rs": r2(now),
        "previous_report": label(s.index[-2]), "previous_price_rs": r2(prev),
        "change_vs_previous_report_pct": r1(change),
        "typical_weekly_move_pct": r1(typical) if typical is not None else None,
        "this_move_times_typical": r1(abs(change) / typical) if typical else None,
        "lowest_in_past_year": {"price_rs": r2(year.min()), "week": label(year.idxmin())},
        "highest_in_past_year": {"price_rs": r2(year.max()), "week": label(year.idxmax())},
    }
    year_ago = same_week_last_year(s, week)
    if year_ago is not None:
        out["price_a_year_ago_rs"] = r2(year_ago)
        out["change_vs_a_year_ago_pct"] = r1((now / year_ago - 1) * 100)
    if city == NATIONAL and item["price_type"] == "market":
        flags = flag_rows(item_id, week - pd.Timedelta(weeks=52), week)
        latest = flags[flags["week_date"] == week]
        out["flagged_this_week"] = flag_dict(next(latest.itertuples())) if len(latest) else None
        out["flagged_weeks_in_past_year"] = len(flags)
        earlier = flags[flags["week_date"] < week]
        out["previous_flagged_week"] = flag_dict(next(earlier.iloc[::-1].itertuples())) if len(earlier) else None
        alert = next((u for u in d.summary["unusual"] if u["item_id"] == item_id), None)
        if alert:
            out["this_weeks_alert_text"] = alert["explanation"]
    elif city != NATIONAL:
        national = d.series.get((item_id, NATIONAL))
        if national is not None and week in national.index:
            out["national_average_rs"] = r2(national[week])
            out["vs_national_average_pct"] = r1((now / national[week] - 1) * 100)
    return out


def price_history(item_id: str, period: str = "1 year") -> dict:
    """How one item's national price moved over a period up to the latest report: start and end, low and high,
    biggest weeks, average prices by month (or quarter or year for long periods), flagged weeks."""
    item, city, error = lookup(item_id, NATIONAL)
    if error:
        return error
    if period not in PERIODS:
        return {"error": f"period must be one of: {', '.join(PERIODS)}"}
    d = data()
    s = d.series[(item_id, city)]
    w = s if PERIODS[period] is None else s[s.index >= d.latest - pd.Timedelta(weeks=PERIODS[period])]
    pct = w.pct_change() * 100
    out = {
        "item": item["name"], "unit": unit_phrase(item["unit"]), "place": place(city), "period": period,
        "price_group": GROUPS[item["price_type"]], "reports_in_period": len(w),
        "from_week": label(w.index[0]), "from_price_rs": r2(w.iat[0]),
        "to_week": label(w.index[-1]), "to_price_rs": r2(w.iat[-1]),
        "change_over_period_pct": r1((w.iat[-1] / w.iat[0] - 1) * 100),
        "lowest": {"price_rs": r2(w.min()), "week": label(w.idxmin())},
        "highest": {"price_rs": r2(w.max()), "week": label(w.idxmax())},
        "biggest_weekly_rise": {"week": label(pct.idxmax()), "change_pct": r1(pct.max())},
        "biggest_weekly_fall": {"week": label(pct.idxmin()), "change_pct": r1(pct.min())},
    }
    # averages short enough to read: by month, or by quarter / year for long periods
    for freq, key, fmt in (("MS", "average_price_by_month", "%b %Y"), ("QS", "average_price_by_quarter", "Q%q %Y"),
                           ("YS", "average_price_by_year", "%Y")):
        avg = w.resample(freq).mean().dropna()
        if len(avg) <= 25:      # "2 years" spans 25 calendar months (partial ones at both ends)
            out[key] = {(f"Q{t.quarter} {t.year}" if freq == "QS" else t.strftime(fmt)): r2(v) for t, v in avg.items()}
            break
    if city == NATIONAL and item["price_type"] == "market":
        flags = flag_rows(item_id, w.index[0], w.index[-1])
        out["flagged_weeks_count"] = len(flags)
        out["flagged_weeks_latest_first"] = [flag_dict(r) for r in flags.iloc[::-1].head(8).itertuples()]
    return out


def compare_cities(item_id: str) -> dict:
    """One item's price in each of the 17 cities in the latest report, against the national average."""
    item, _, error = lookup(item_id, NATIONAL)
    if error:
        return error
    d = data()
    national = d.series[(item_id, NATIONAL)]
    day = national.index.max()
    rows = sorted(({"city": c, "price_rs": r2(d.series[(item_id, c)][day])} for c in d.cities
                   if (item_id, c) in d.series and day in d.series[(item_id, c)].index), key=lambda r: r["price_rs"])
    if not rows:
        return {"error": f"no city prices for {item['name']} in the week ending {label(day)}"}
    avg = national[day]
    for r in rows:
        r["vs_national_average_pct"] = r1((r["price_rs"] / avg - 1) * 100)
    lo, hi = rows[0], rows[-1]
    return {
        "item": item["name"], "unit": unit_phrase(item["unit"]), "week": label(day),
        "national_average_rs": r2(avg), "cheapest": lo, "dearest": hi,
        "gap_dearest_minus_cheapest_rs": r2(hi["price_rs"] - lo["price_rs"]),
        "dearest_vs_cheapest_pct": r1((hi["price_rs"] / lo["price_rs"] - 1) * 100),
        "cities_cheapest_first": rows,
    }


def this_week() -> dict:
    """The latest report at a glance: unusual moves, government price changes, revisions, biggest movers."""
    d = data()
    s, name = d.summary, (lambda i: d.items[i]["name"])
    move = lambda r: {"item": name(r["item_id"]), "price_rs": r["price"], "change_pct": r["change_pct"]}
    return {
        "week": s["week_label"], "previous_report": s["previous_label"],
        "overall_change_all_items_pct": s["basket_change_pct"],     # trimmed average weekly change of all 51 items
        "items_up": s["counts"]["up"], "items_down": s["counts"]["down"], "items_unchanged": s["counts"]["unchanged"],
        "unusual_moves": [{**move(u), "how_unusual": u["severity_word"], "direction": u["direction"],
                           "typical_weekly_move_pct": u["typical_move_pct"], "alert_text": u["explanation"]}
                          for u in s["unusual"]],
        "government_price_changes": [move(r) for r in s["government"]],
        "price_revisions": [move(r) for r in s["revisions"]],
        "biggest_rises": [move(r) for r in s["movers"]["rises"]],
        "biggest_falls": [move(r) for r in s["movers"]["falls"]],
    }


def price_news(item_id: str | None = None) -> dict:
    """Recent headlines from Pakistani news sites that mention prices (of one item, if given)."""
    d = data()
    news = d.news
    if item_id:
        news = news[news["item_ids"].str.split(",").apply(lambda ids: item_id in ids)]
    return {
        "note": "Headlines that mention these prices. Possibly related; they are not proof of a cause.",
        "headlines": [{"title": n.title, "source": n.source, "date": label(pd.Timestamp(n.published)), "link": n.link}
                      for n in news.head(5).itertuples()],
    }


TOOLS = {f.__name__: f for f in (item_overview, price_history, compare_cities, this_week, price_news)}


def declarations() -> list[dict]:
    """The tools as Gemini function declarations. Item ids and cities are enums, so the model can't invent one."""
    d = data()
    item = {"type": "string", "enum": sorted(d.items), "description": "Item id from the item list in your brief."}
    city = {"type": "string", "enum": [NATIONAL, *d.cities],
            "description": "A survey city, or National for the national average (the default)."}
    period = {"type": "string", "enum": list(PERIODS), "description": "How far back from the latest report."}
    obj = lambda props, required: {"type": "object", "properties": props, "required": required}
    return [
        {"name": "item_overview", "parameters": obj({"item_id": item, "city": city}, ["item_id"]),
         "description": "Start here for any question about an item. Latest price, change since the previous report "
                        "and a year ago, its typical weekly move (what is normal for it) and how many times that the "
                        "latest move is, its low and high of the past year, whether the detector flagged it, and what "
                        "kind of price it is (market, government-set or packaged)."},
        {"name": "price_history", "parameters": obj({"item_id": item, "period": period}, ["item_id", "period"]),
         "description": "How an item's national average price moved over a period up to the latest report: start "
                        "and end price and % change, low and high, the biggest weekly rise and fall, average price by "
                        "month (or quarter or year for long periods) and the weeks the detector flagged."},
        {"name": "compare_cities", "parameters": obj({"item_id": item}, ["item_id"]),
         "description": "An item's price in each of the 17 survey cities in the latest report, cheapest first, each "
                        "against the national average, plus the gap between the cheapest and dearest city."},
        {"name": "this_week",
         "description": "The latest weekly report at a glance: unusual market moves (with their alert text), "
                        "government price changes, price revisions, the biggest rises and falls, and how many of the "
                        "51 items went up or down."},
        {"name": "price_news", "parameters": {"type": "object", "properties": {"item_id": item}},
         "description": "Up to 5 recent headlines from Pakistani news sites about prices, of one item if given. "
                        "Possibly related context with links, never proof of a cause."},
    ]
