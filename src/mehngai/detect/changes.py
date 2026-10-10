"""Price changes for items whose prices are set, not discovered by a market.

  fixed         packaged / branded / hotel prices: flat for months, then one jump (a "price revision")
  administered  government- or regulator-set prices: petrol, diesel, LPG, electricity, gas, phone

Their jumps are decisions, not market anomalies, so they are never scored by the detector. Instead we
list every change of at least `min_change_pct` (settings: detect.price_changes). Smaller moves are
mostly noise from a single city's shop nudging the national average.
"""
from __future__ import annotations

import pandas as pd


def price_changes(wide: pd.DataFrame, items: dict[str, dict], week: pd.Timestamp,
                  thresholds: dict[str, float]) -> pd.DataFrame:
    """Rows for every fixed/administered item whose national price moved ≥ threshold this week.

    Columns: item_id, price_type, previous_report, previous_price, price, change_pct.
    Sorted: biggest absolute change first.
    """
    i = wide.index.get_loc(week)
    prev_week = wide.index[i - 1]
    rows = []
    for item_id, item in items.items():
        threshold = thresholds.get(item["price_type"])
        if threshold is None or item_id not in wide:
            continue
        before, now = wide.at[prev_week, item_id], wide.at[week, item_id]
        change = (now / before - 1) * 100
        if abs(change) >= threshold:
            rows.append({"item_id": item_id, "price_type": item["price_type"],
                         "previous_report": prev_week, "previous_price": before, "price": now,
                         "change_pct": change})
    out = pd.DataFrame(rows, columns=["item_id", "price_type", "previous_report", "previous_price",
                                      "price", "change_pct"])
    return out.reindex(out["change_pct"].abs().sort_values(ascending=False).index)
