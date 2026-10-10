"""L1 — rolling robust z-score of each item's weekly change.

"How unusual is this week's change compared with this item's last ~12 weeks?"
Per-item, so a 10% tomato week is normal but a 10% sugar week is not. Median/MAD instead of
mean/std, so one past spike doesn't hide the next one.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from mehngai.detect.series import gap_weeks, per_week, robust_z


def score(wide: pd.DataFrame, basket: pd.Series, cfg: dict) -> pd.DataFrame:
    """Robust z of the (gap-scaled) weekly log change, per item."""
    weekly = per_week(np.log(wide).diff(), gap_weeks(wide.index))
    params = cfg["L1_zscore"]
    return weekly.apply(lambda col: robust_z(col, params["window"], params["min_periods"],
                                             cfg["mad_floor"]))
