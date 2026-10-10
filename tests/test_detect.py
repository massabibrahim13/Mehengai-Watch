"""Detector tests on tiny hand-made series where the right answer is known."""
import copy

import numpy as np
import pandas as pd
import pytest

from mehngai.config import load_settings
from mehngai.detect import baseline, relative, seasonal, zscore
from mehngai.detect.evaluate import event_recall, in_event
from mehngai.detect.series import gap_weeks, per_week, robust_z, severity

CFG = load_settings()["detect"]
CUTS = CFG["L1_zscore"]


def weekly_index(n: int, start: str = "2020-01-02") -> pd.DatetimeIndex:
    return pd.date_range(start, periods=n, freq="W-THU")


def noisy_prices(n: int, seed: int = 0, weekly_sd: float = 0.01) -> pd.Series:
    """A price that wanders ~1% a week around Rs 100."""
    rng = np.random.default_rng(seed)
    return pd.Series(100 * np.exp(np.cumsum(rng.normal(0, weekly_sd, n))), index=weekly_index(n))


# --- shared helpers ---

def test_baseline_is_plain_percent_change():
    wide = pd.DataFrame({"sugar": [100.0, 110.0, 99.0]}, index=weekly_index(3))
    assert baseline.score(wide, None, CFG)["sugar"].round(6).tolist()[1:] == [10.0, -10.0]


def test_gap_scaling():
    idx = pd.DatetimeIndex(["2024-01-04", "2024-01-11", "2024-01-25", "2024-01-31"])  # 1, 2, 1 week
    gaps = gap_weeks(idx)
    assert gaps.tolist()[1:] == [1, 2, 1]
    assert per_week(pd.Series([np.nan, 0.1, 0.2, 0.1], index=idx), gaps).round(4).tolist()[2] == round(0.2 / np.sqrt(2), 4)


def test_robust_z_flags_a_spike_and_ignores_noise():
    x = pd.Series(np.random.default_rng(1).normal(0, 0.01, 60))
    x.iloc[59] = 0.15                                   # a 15% jump after ~1% noise
    z = robust_z(x, window=52, min_periods=12, mad_floor=0.005)
    assert z.iloc[59] > CUTS["extreme"]
    assert (z.iloc[13:59].abs() < CUTS["extreme"]).all()


def test_mad_floor_stops_flat_series_blowing_up():
    x = pd.Series([0.0] * 20 + [0.01])                  # flat for 20 weeks, then +1%
    z = robust_z(x, window=52, min_periods=12, mad_floor=0.005)
    assert np.isfinite(z.iloc[-1]) and z.iloc[-1] == pytest.approx(2.0)


def test_one_past_spike_does_not_hide_the_next():
    # the point of median/MAD: a spike in the window barely changes the "normal" spread
    x = pd.Series(np.random.default_rng(2).normal(0, 0.01, 40))
    x.iloc[20] = 0.30
    x.iloc[39] = 0.15
    assert robust_z(x, 52, 12, 0.005).iloc[39] > CUTS["extreme"]


@pytest.mark.parametrize("score, label", [(2.0, None), (3.6, "watch"), (-5.5, "unusual"), (9, "extreme")])
def test_severity(score, label):
    assert severity(score, CUTS) == label


# --- no look-ahead: changing the future must not change past scores ---

@pytest.mark.parametrize("detector", [zscore, relative])
def test_no_look_ahead(detector):
    wide = pd.DataFrame({"onions": noisy_prices(80)})
    basket = pd.Series(0.002, index=wide.index)
    before = detector.score(wide, basket, CFG)
    future = wide.copy()
    future.iloc[60:] *= 3                                # wild changes after week 60
    after = detector.score(future, basket, CFG)
    pd.testing.assert_frame_equal(before.iloc[:60], after.iloc[:60])


# --- L2: a rise that everything shares is not news ---

def test_relative_ignores_basket_wide_moves():
    n = 60
    rng = np.random.default_rng(3)
    basket = pd.Series(rng.normal(0.002, 0.001, n), index=weekly_index(n))
    basket.iloc[-1] = 0.10                              # everything jumps 10% this week
    item_log = np.cumsum(basket.values + rng.normal(0, 0.005, n))
    wide = pd.DataFrame({"sugar": 100 * np.exp(item_log)}, index=basket.index)
    l1 = zscore.score(wide, basket, CFG)["sugar"].iloc[-1]
    l2 = relative.score(wide, basket, CFG)["sugar"].iloc[-1]
    assert l1 > CUTS["extreme"] and abs(l2) < CUTS["watch"]


# --- L3: a jump that happens every year at the same time is not news ---

def test_ramazan_week():
    weeks = seasonal.ramazan_week(pd.DatetimeIndex(["2023-03-23", "2023-03-16", "2023-04-20"]))
    assert weeks.tolist() == [0, -1, 4]


def test_seasonal_ignores_a_repeating_yearly_rise_and_never_looks_ahead():
    # Every year prices climb 40% over 6 weeks (a harvest-style season), then fall back.
    # (STL fits smooth curves, so it learns gradual seasons; an instant one-week jump it can't.)
    n = 52 * 3 + 20
    rng = np.random.default_rng(4)
    week_of_year = np.arange(n) % 52
    season = 0.4 * (np.clip((week_of_year - 10) / 6, 0, 1) - np.clip((week_of_year - 30) / 6, 0, 1))
    log_p = np.cumsum(rng.normal(0, 0.01, n)) + season
    wide = pd.DataFrame({"tomatoes": 100 * np.exp(log_p)}, index=weekly_index(n, "2019-01-03"))
    cfg = copy.deepcopy(CFG)
    cfg["L3_seasonal"]["min_seasonal_strength"] = 0.0

    rise = slice(52 * 3 + 10, 52 * 3 + 16)                # the 4th year's rise
    l1 = zscore.score(wide, None, cfg)["tomatoes"].iloc[rise]
    l3 = seasonal.score(wide, None, cfg)["tomatoes"]
    assert l1.max() > CUTS["unusual"]                     # L1 thinks it's unusual...
    # ...L3 knows it happens every year: never above "watch", and far lower than L1 overall.
    # (The first week can still reach "watch": the smoothed season expects the rise a bit early.)
    assert l3.iloc[rise].abs().max() < CUTS["unusual"]
    assert l3.iloc[rise].abs().mean() < l1.abs().mean() / 2

    end = rise.stop
    future = wide.copy()
    future.iloc[end:] *= 3
    pd.testing.assert_series_equal(l3.iloc[:end], seasonal.score(future, None, cfg)["tomatoes"].iloc[:end])


# --- evaluation helpers ---

def test_event_matching():
    events = pd.DataFrame({"event_id": ["E1", "E2"], "item_id": ["sugar", "onions"],
                           "start_week": pd.to_datetime(["2023-08-24", "2022-08-18"]),
                           "end_week": pd.to_datetime(["2023-09-07", "2022-09-01"]),
                           "direction": ["up", "up"]})
    alerts = pd.DataFrame({"item_id": ["sugar", "onions", "sugar"],
                           "week_date": pd.to_datetime(["2023-08-31", "2022-08-25", "2024-01-04"]),
                           "score": [5.1, -4.0, 6.0]})          # onions alert is a DROP → no match
    assert in_event(alerts, events).tolist() == [True, False, False]
    recall, missed = event_recall(alerts, events)
    assert recall == 0.5 and missed == ["E2"]
