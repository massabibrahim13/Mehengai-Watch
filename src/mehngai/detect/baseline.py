"""L0 — fixed threshold on the weekly % change. Dumb on purpose: it's the benchmark.

"Flag anything that moved more than X% since the last report." Same X for every item, no history,
no gap handling. Every other layer has to beat this to be kept.
"""
from __future__ import annotations

import pandas as pd


def score(wide: pd.DataFrame, basket: pd.Series, cfg: dict) -> pd.DataFrame:
    """Score = % change vs the previous report (signed)."""
    return wide.pct_change() * 100
