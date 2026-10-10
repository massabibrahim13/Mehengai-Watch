"""Shared building blocks for the detectors.

Conventions (all detectors):
- Work on **log price changes**, not prices: ln(p_t / p_prev) ≈ % change, and it stays comparable when
  prices double through inflation.
- **Gaps:** PBS sometimes skips a week, so a "weekly" change can span 2–3 weeks. A k-week change is
  scaled by 1/sqrt(k) to a 1-week equivalent (prices move roughly like a random walk, whose spread
  grows with the square root of time).
- **No look-ahead:** a score for week t only uses data up to and including week t.
- Scores are **signed** (+ = price up); severity cut-offs apply to |score|.
"""
from __future__ import annotations

import sqlite3

import numpy as np
import pandas as pd

from mehngai.store.db import read_prices

SEVERITIES = ("watch", "unusual", "extreme")
MAD_TO_SD = 1.4826   # MAD × 1.4826 ≈ standard deviation, for normally distributed data


def load_series(conn: sqlite3.Connection,
                price_types: tuple[str, ...] | None = None) -> tuple[pd.DataFrame, pd.Series]:
    """National weekly prices (rows = weeks, columns = items) and the basket log change per week.
    `price_types` keeps only items of those groups, e.g. ("market",) for anomaly detection."""
    wide = read_prices(conn).pivot(index="week_date", columns="item_id", values="price").sort_index()
    if price_types:
        keep = [i for (i,) in conn.execute(
            f"SELECT item_id FROM items WHERE price_type IN ({','.join('?' * len(price_types))})",
            price_types)]
        wide = wide[[c for c in wide.columns if c in keep]]
    basket = pd.read_sql_query("SELECT week_date, log_change FROM basket", conn,
                               parse_dates=["week_date"]).set_index("week_date")["log_change"]
    return wide, basket.reindex(wide.index)


def gap_weeks(index: pd.DatetimeIndex) -> pd.Series:
    """How many weeks each report is after the previous one (6–8 days count as 1)."""
    days = index.to_series().diff().dt.days
    return (days / 7).round().clip(lower=1)


def per_week(log_change: pd.DataFrame | pd.Series, gaps: pd.Series):
    """Scale a k-week log change to a 1-week equivalent: divide by sqrt(k)."""
    return log_change.div(np.sqrt(gaps), axis=0)


def rolling_mad(x: pd.Series, window: int, min_periods: int) -> pd.Series:
    """Median absolute deviation over a trailing window (robust version of the standard deviation)."""
    return x.rolling(window, min_periods=min_periods).apply(
        lambda w: np.nanmedian(np.abs(w - np.nanmedian(w))), raw=True)   # nan: first week has no change


def robust_z(x: pd.Series, window: int, min_periods: int, mad_floor: float) -> pd.Series:
    """How unusual is x_t compared with the previous `window` values?

    z = (x_t − median of past) / (1.4826 × MAD of past). The `shift(1)` is the no-look-ahead
    guarantee: week t is compared with weeks t−window … t−1, never with itself or the future.
    """
    past = x.shift(1)
    centre = past.rolling(window, min_periods=min_periods).median()
    spread = np.maximum(MAD_TO_SD * rolling_mad(past, window, min_periods), mad_floor)
    return (x - centre) / spread


def severity(score: float, cuts: dict) -> str | None:
    """'watch' / 'unusual' / 'extreme' from |score| and the method's cut-offs; None = normal."""
    if pd.isna(score):
        return None
    label = None
    for level in SEVERITIES:
        if abs(score) >= cuts[level]:
            label = level
    return label


def to_anomalies(scores: pd.DataFrame, change_pct: pd.DataFrame, method: str,
                 cuts: dict) -> pd.DataFrame:
    """Wide scores → long table of flagged item-weeks (the rows of the anomalies table)."""
    long = scores.stack().dropna().rename("score").reset_index()   # pandas 3 keeps NaN in stack()
    long.columns = ["week_date", "item_id", "score"]
    long["severity"] = long["score"].map(lambda s: severity(s, cuts))
    long = long[long["severity"].notna()].copy()
    long["direction"] = np.where(long["score"] > 0, "up", "down")
    long["change_pct"] = [change_pct.at[d, i] for d, i in zip(long["week_date"], long["item_id"])]
    long["method"] = method
    return long[["item_id", "week_date", "method", "score", "severity", "direction", "change_pct"]]
