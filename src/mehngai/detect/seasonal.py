"""L3 — seasonal + Ramazan-aware z-score.

Two calendars move prices: the solar year (harvests: onions are cheap in spring, dear in winter) and
the lunar year (Ramazan/Eid move ~11 days earlier every year). L1 would flag these every year.

For each week t, using ONLY data up to the previous report (no look-ahead):
  1. STL decomposition of the log price → trend + seasonal + leftover. (STL = "Seasonal-Trend
     decomposition using Loess": it fits smooth curves to split a series into those three parts.)
  2. Expected seasonal change this week = the seasonal component's change in the same weeks last year.
  3. Ramazan effect = median deseasonalised change in the same "week relative to 1 Ramazan" in past
     Ramazans (only for weeks inside `ramazan_weeks`, and only once `min_ramazans` have been seen).
  4. Adjusted change = actual − seasonal − Ramazan; score it with a robust z against the item's last
     `window` weeks of deseasonalised changes.

The first `min_history` weeks (2 years) have no score: STL needs two full cycles to learn a season.
"""
from __future__ import annotations

import logging
from functools import lru_cache

import numpy as np
import pandas as pd
from hijridate import Hijri
from statsmodels.tsa.seasonal import STL

from mehngai.detect.series import MAD_TO_SD, gap_weeks

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def ramazan_starts() -> pd.DatetimeIndex:
    """Gregorian date of 1 Ramazan for Hijri years 1438–1452 (2017–2031)."""
    return pd.DatetimeIndex([pd.Timestamp(Hijri(y, 9, 1).to_gregorian()) for y in range(1438, 1453)])


def ramazan_week(dates: pd.DatetimeIndex) -> np.ndarray:
    """Weeks since the nearest 1 Ramazan (0 = first week of Ramazan, −1 = the week before, ...)."""
    starts = ramazan_starts().values
    days = (dates.values[:, None] - starts[None, :]).astype("timedelta64[D]").astype(int)
    nearest = days[np.arange(len(dates)), np.abs(days).argmin(axis=1)]
    return np.floor(nearest / 7).astype(int)


def to_weekly_grid(log_price: pd.Series) -> pd.Series:
    """Put reports on a regular Thursday grid (PBS weeks end on Thursday; a Wed/Fri report counts as
    that week) and fill missing weeks by straight-line interpolation. STL needs regular spacing."""
    shift = (3 - log_price.index.weekday + 3) % 7 - 3          # days to the nearest Thursday
    on_thursday = pd.Series(log_price.values, index=log_price.index + pd.to_timedelta(shift, "D"))
    grid = pd.date_range(on_thursday.index.min(), on_thursday.index.max(), freq="W-THU")
    return on_thursday.reindex(grid).interpolate()


def extend_seasonal(seasonal: np.ndarray, length: int, period: int) -> np.ndarray:
    """Seasonal component for grid rows 0..length-1; rows past the fit repeat the value one period
    earlier ("same week last year")."""
    out = np.empty(length)
    n = min(len(seasonal), length)
    out[:n] = seasonal[:n]
    for j in range(n, length):
        out[j] = out[j - period]
    return out


def score_item(log_price: pd.Series, cfg: dict, mad_floor: float) -> pd.Series:
    """L3 score for every report date of one item (NaN where there isn't enough history)."""
    p = cfg["L3_seasonal"]
    window, period = cfg["L1_zscore"]["window"], p["period"]
    lo, hi = p["ramazan_weeks"]

    grid = to_weekly_grid(log_price)
    shift = (3 - log_price.index.weekday + 3) % 7 - 3
    pos = grid.index.get_indexer(log_price.index + pd.to_timedelta(shift, "D"))  # report → grid row
    grid_rweek = ramazan_week(grid.index)
    gaps = gap_weeks(log_price.index).values

    scores = np.full(len(log_price), np.nan)
    fit_end, fitted = -1, None
    for i in range(1, len(log_price)):
        g_now, g_prev = pos[i], pos[i - 1]
        if g_prev + 1 < p["min_history"]:
            continue
        history = grid.iloc[: g_prev + 1].values                  # everything up to the previous report

        # 1. STL on the history. The seasonal shape changes slowly, so refit every few weeks
        #    (a robust fit takes ~0.5 s); weeks after the last fit reuse last year's shape.
        if fitted is None or g_prev - fit_end >= p["refit_every"]:
            fit_end = g_prev
            fit = STL(history, period=period, robust=True).fit()
            raw_seasonal = fit.seasonal
            # Seasonal strength (0–1): how much of the non-trend movement the season explains.
            # Below the cut-off the "season" is mostly one-off steps (flour, sugar, ghee), so
            # don't adjust for it — that's what made sticky items over-flag.
            strength = max(0.0, 1 - np.var(fit.resid) / np.var(fit.seasonal + fit.resid))
            if strength < p["min_seasonal_strength"]:
                raw_seasonal = np.zeros_like(raw_seasonal)
            # With only a few years of weekly data the seasonal shape is jagged week to week
            # (each week-of-year is estimated separately). Smooth it so last year's noise isn't
            # mistaken for a seasonal pattern.
            fitted = pd.Series(raw_seasonal).rolling(p["seasonal_smooth_weeks"], center=True,
                                                     min_periods=1).mean().values
        seasonal = extend_seasonal(fitted, g_now + 1, period)

        # 2. expected seasonal move into each grid week = the seasonal change in the same week last
        #    year. Applied the same way to history and to this week, so both are on the same footing.
        lagged = np.full(g_now + 1, np.nan)
        lagged[period + 1:] = np.diff(seasonal[: g_now + 1 - period])
        adjusted = np.diff(history) - lagged[1: g_prev + 1]       # history: change into week 1..g_prev
        expected = seasonal[g_now - period] - seasonal[g_prev - period]
        change = log_price.iat[i] - log_price.iat[i - 1] - expected

        # 3. Ramazan adjustment, learned from past Ramazans only
        k = grid_rweek[g_now]
        if lo <= k <= hi:
            same_k = adjusted[(grid_rweek[1: g_prev + 1] == k) & ~np.isnan(adjusted)]
            if len(same_k) >= p["min_ramazans"]:
                change -= np.median(same_k) * gaps[i]

        # 4. robust z against the item's recent seasonally-adjusted weekly changes
        recent = adjusted[-window:]
        centre = np.median(recent)
        spread = max(MAD_TO_SD * np.median(np.abs(recent - centre)), mad_floor)
        scores[i] = (change / np.sqrt(gaps[i]) - centre) / spread
    return pd.Series(scores, index=log_price.index)


def score(wide: pd.DataFrame, basket: pd.Series, cfg: dict) -> pd.DataFrame:
    """L3 scores for all items (rows = weeks, columns = items)."""
    out = {}
    for item in wide.columns:
        log.info("L3: fitting STL week by week for %s", item)
        out[item] = score_item(np.log(wide[item]), cfg, cfg["mad_floor"])
    return pd.DataFrame(out, index=wide.index)
