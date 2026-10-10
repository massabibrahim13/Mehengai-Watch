"""Stage 3b — Validate: reject impossible values before they reach the database.

Key idea: a parsing error looks exactly like an anomaly. Every rule here exists so the detector
never "discovers" a spike that is really a misread number. Rejected rows are kept, with a reason,
in the rejected_rows table for manual review.

Rules (in order):
  1. price present        — blank = N.A. in the source or a garbled cell
  2. price > 0
  3. min <= avg <= max    — a misread digit usually breaks this ordering
  4. weekly sanity bound  — price within ×max_ratio / ÷max_ratio of the last accepted price
                            for the same item + city. Not applied to government-set prices:
                            a policy change can really be ×5 (gas, Nov 2023: Rs 295 → 1,711).
  5. completeness         — every tracked item has a National price in every report
                            (a missing one is logged; there is nothing to insert)
"""
from __future__ import annotations

import logging

import pandas as pd

from mehngai.clean.normalize import REJECT_COLUMNS

log = logging.getLogger(__name__)


def row_reason(price: float, pmin: float, pmax: float) -> str | None:
    """Rules 1–3 for a single row; None means the row is fine."""
    if pd.isna(price):
        return "blank price (N.A. or garbled cell)"
    if price <= 0:
        return "price is 0 (PBS reports 0 where an item isn't sold in a city, e.g. gas in Khuzdar)"
    if pd.notna(pmin) and pd.notna(pmax) and not (pmin <= price <= pmax):
        return "min/avg/max out of order"
    return None


def weekly_jump_reasons(prices: pd.Series, max_ratio: float) -> list[str | None]:
    """Rule 4 for one item + city series (sorted by week). Compares to the last *accepted* price,
    so one misread week doesn't also get the following (correct) week rejected."""
    reasons, last_ok = [], None
    for price in prices:
        if last_ok is not None:
            ratio = price / last_ok
            if ratio > max_ratio or ratio < 1 / max_ratio:
                reasons.append(f"weekly change x{ratio:.2f} beyond sanity bound")
                continue
        reasons.append(None)
        last_ok = price
    return reasons


def validate(rows: pd.DataFrame, item_ids: list[str], report_dates: list[str],
             max_ratio: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split normalised rows into (accepted, rejected-with-reason)."""
    rows = rows.sort_values(["item_id", "city", "week_date"]).reset_index(drop=True)
    rows["reason"] = [row_reason(p, lo, hi) for p, lo, hi in
                      zip(rows["price"], rows["price_min"], rows["price_max"])]

    passed = rows["reason"].isna()
    if "price_type" in rows:
        passed &= rows["price_type"] != "administered"
    for _, idx in rows[passed].groupby(["item_id", "city"]).groups.items():
        rows.loc[idx, "reason"] = weekly_jump_reasons(rows.loc[idx, "price"], max_ratio)

    accepted = rows[rows["reason"].isna()].drop(columns=["reason", "price_type"], errors="ignore")
    rejected = rows[rows["reason"].notna()]

    # Rule 5: completeness of the national series.
    national = set(zip(accepted.loc[accepted["city"] == "National", "week_date"],
                       accepted.loc[accepted["city"] == "National", "item_id"]))
    missing = [{"week_date": d, "item_id": i, "city": "National", "sl_no": None,
                "item_raw": None, "price": None, "reason": "missing national price"}
               for d in report_dates for i in item_ids
               if (d, i) not in national and not ((rejected["week_date"] == d)
                                                  & (rejected["item_id"] == i)
                                                  & (rejected["city"] == "National")).any()]
    rejected = pd.concat([rejected[REJECT_COLUMNS], pd.DataFrame(missing, columns=REJECT_COLUMNS)],
                         ignore_index=True)

    for reason, n in rejected["reason"].str.replace(r"x[\d.]+", "x…", regex=True).value_counts().items():
        log.info("rejected %5d rows: %s", n, reason)
    return accepted.reset_index(drop=True), rejected
