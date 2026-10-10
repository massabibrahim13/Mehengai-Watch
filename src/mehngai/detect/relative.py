"""L2 — relative-to-basket: L1 applied to (item change − general inflation that week).

"Is sugar rising faster than *everything else*?" The basket change is the trimmed-mean change of all
51 SPI items (stored by store/db.py). In a week where everything rises 2%, a 2% rise isn't news.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from mehngai.detect.series import gap_weeks, per_week, robust_z


def score(wide: pd.DataFrame, basket: pd.Series, cfg: dict) -> pd.DataFrame:
    """Robust z of the item's weekly log change minus the basket's, per item."""
    relative = np.log(wide).diff().sub(basket, axis=0)
    weekly = per_week(relative, gap_weeks(wide.index))
    params = cfg["L1_zscore"]          # same window as L1, so the only difference is the basket
    return weekly.apply(lambda col: robust_z(col, params["window"], params["min_periods"],
                                             cfg["mad_floor"]))
