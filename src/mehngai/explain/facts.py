"""Stage 6a — Facts: turn one detected anomaly into a small JSON of facts.

The LLM never sees the database and never decides what is anomalous: the detector decided that, and
this module computes every number the LLM is allowed to use. Numbers are rounded here, once, so the
guardrail can check the LLM's text against exactly these values.

All facts use data up to the anomaly's week only (same no-look-ahead rule as the detector).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from mehngai.detect.seasonal import ramazan_week
from mehngai.detect.series import same_week_last_year

RAMAZAN_WEEKS = (-2, 5)        # 2 weeks before 1 Ramazan … about Eid ul-Fitr (same as the L3 setting)
SEVERITY_WORDS = {"watch": "notable", "unusual": "unusual", "extreme": "extreme"}


def label(d: pd.Timestamp) -> str:
    """2023-03-22 → '22 Mar 2023' (human dates only, so no stray ISO numbers reach the LLM)."""
    return f"{d.day} {d:%b %Y}"


def unit_phrase(unit: str) -> str:
    """'1 kg' → 'per kg', '1 dozen' → 'per dozen', '20 kg bag' → 'per 20 kg bag',
    '1 kg pouch' → 'per 1 kg pouch' (the 1 only drops when a single unit word follows)."""
    rest = unit[2:]
    return "per " + (rest if unit.startswith("1 ") and " " not in rest else unit)


def biggest_since(pct: pd.Series, i: int, change: float) -> str:
    """When was the last same-direction weekly move at least this big? ('Mar 2023')"""
    past = pct.iloc[1:i]
    same = past[(np.sign(past) == np.sign(change)) & (past.abs() >= abs(change))]
    if same.empty:
        return f"the start of our data ({pct.index[0]:%b %Y})"
    return f"{same.index[-1]:%b %Y}"


def build_facts(item: dict, week: pd.Timestamp, prices: pd.Series, severity: str,
                typical_weeks: int) -> dict:
    """Facts for one anomaly. `prices` = the item's national weekly price series."""
    i = prices.index.get_loc(week)
    now, prev = prices.iat[i], prices.iat[i - 1]
    pct = prices.pct_change() * 100
    change = (now / prev - 1) * 100
    typical = pct.iloc[max(1, i - typical_weeks):i].abs().median()       # weeks before this one only
    direction = "up" if change > 0 else "down"

    facts = {
        "item": item["name"],
        "unit": unit_phrase(item["unit"]),
        "week_ending": label(week),
        "price_this_week_rs": round(float(now), 2),
        "previous_report": label(prices.index[i - 1]),
        "price_previous_report_rs": round(float(prev), 2),
        "change_pct": round(abs(change), 1),
        "direction": direction,
        "how_unusual": SEVERITY_WORDS[severity],
        "typical_weekly_change_pct": round(float(typical), 1),
        "times_typical_change": round(abs(change) / typical, 1) if typical > 0 else None,
        f"biggest_weekly_{'rise' if direction == 'up' else 'fall'}_since": biggest_since(pct, i, change),
        "price_type": item["price_type"],
        "ramazan_period": bool(RAMAZAN_WEEKS[0] <= ramazan_week(pd.DatetimeIndex([week]))[0]
                               <= RAMAZAN_WEEKS[1]),
    }
    gap = round((week - prices.index[i - 1]).days / 7)
    if gap > 1:
        facts["weeks_since_previous_report"] = gap

    # Same week last year (only if PBS has a report for that week).
    year_ago = same_week_last_year(prices.loc[:week], week)
    if year_ago is not None:
        facts["price_a_year_ago_rs"] = round(float(year_ago), 2)
        facts["change_vs_a_year_ago_pct"] = round(float((now / year_ago - 1) * 100), 1)
    return facts
