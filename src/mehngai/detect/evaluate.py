"""Backtest every detector layer over the full history and compare them.

Every layer's score for week t only uses data up to week t (no look-ahead), so running it over
history is the same as replaying the weeks as if the system had been live.

Metrics, on the item-weeks where ALL layers have a score (L3 needs 2 years of history first):
  - alerts / week      — how many flags (|score| ≥ watch) per week, all 8 items together
  - recall             — share of known events (data/known_events.csv) with ≥ 1 alert in the right
                         direction inside the event's weeks
  - event precision    — share of alerts that fall inside a known event. A LOWER BOUND: the event list
                         is small, so many real shocks aren't on it. Real precision needs a spot-check.
  - recall @ budget    — every layer gets the same number of alerts (its top |scores|); fair comparison
                         of how well each layer *ranks* weeks, independent of its thresholds.

Also writes every layer's flagged weeks to the `anomalies` table.

Run:  python -m mehngai.detect.evaluate [--json]   (--json also writes data/evaluation.json for the website)
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone

import pandas as pd

from mehngai.config import DATA_DIR, load_settings
from mehngai.detect import baseline, relative, seasonal, zscore
from mehngai.detect.series import load_series, to_anomalies
from mehngai.store.db import connect

log = logging.getLogger(__name__)

METHODS = {
    "L0_baseline": baseline.score,
    "L1_zscore": zscore.score,
    "L2_relative": relative.score,
    "L3_seasonal": seasonal.score,
}


def load_events() -> pd.DataFrame:
    return pd.read_csv(DATA_DIR / "known_events.csv", parse_dates=["start_week", "end_week"])


def to_long(scores: pd.DataFrame) -> pd.DataFrame:
    """Wide (weeks × items) → long rows: week_date, item_id, score."""
    long = scores.stack().dropna().rename("score").reset_index()   # pandas 3 keeps NaN in stack()
    long.columns = ["week_date", "item_id", "score"]
    return long


def in_event(alerts: pd.DataFrame, events: pd.DataFrame) -> pd.Series:
    """For each alert row: does it fall inside a known event (same item, direction, weeks)?"""
    hit = pd.Series(False, index=alerts.index)
    for e in events.itertuples():
        sign = 1 if e.direction == "up" else -1
        hit |= ((alerts["item_id"] == e.item_id) & (alerts["week_date"] >= e.start_week)
                & (alerts["week_date"] <= e.end_week) & (alerts["score"] * sign > 0))
    return hit


def event_recall(alerts: pd.DataFrame, events: pd.DataFrame) -> tuple[float, list[str]]:
    """Share of events caught by at least one alert; also the IDs of the missed ones."""
    missed = []
    for e in events.itertuples():
        one = alerts.iloc[0:0] if alerts.empty else alerts
        if not in_event(one, events[events.event_id == e.event_id]).any():
            missed.append(e.event_id)
    return 1 - len(missed) / len(events), missed


def evaluate(all_scores: dict[str, pd.DataFrame], events: pd.DataFrame, cuts: dict,
             budget_per_week: float) -> pd.DataFrame:
    """One row of metrics per method."""
    longs = {m: to_long(s) for m, s in all_scores.items()}
    # Common evaluation set: item-weeks every method scored.
    common = None
    for long in longs.values():
        keys = set(zip(long["week_date"], long["item_id"]))
        common = keys if common is None else common & keys
    n_weeks = len({d for d, _ in common})
    k_budget = round(budget_per_week * n_weeks)

    rows = []
    for method, long in longs.items():
        long = long[[k in common for k in zip(long["week_date"], long["item_id"])]]
        alerts = long[long["score"].abs() >= cuts[method]["watch"]]
        recall, missed = event_recall(alerts, events)
        top = long.reindex(long["score"].abs().sort_values(ascending=False).index).head(k_budget)
        recall_b, missed_b = event_recall(top, events)
        rows.append({
            "method": method,
            "alerts": len(alerts),
            "alerts / week": round(len(alerts) / n_weeks, 2),
            "recall": round(recall, 2),
            "event precision (lower bound)": round(in_event(alerts, events).mean(), 2) if len(alerts) else 0,
            "missed": ", ".join(missed) or "–",
            f"recall @ {budget_per_week}/wk": round(recall_b, 2),
            "missed @ budget": ", ".join(missed_b) or "–",
            "top item": alerts["item_id"].value_counts().index[0] if len(alerts) else "–",
            "top item share": round(alerts["item_id"].value_counts(normalize=True).iloc[0], 2) if len(alerts) else 0,
        })
    log.info("evaluation set: %d weeks (%s → %s), %d events, budget = %d alerts",
             n_weeks, min(d for d, _ in common).date(), max(d for d, _ in common).date(),
             len(events), k_budget)
    table = pd.DataFrame(rows)
    table.attrs = {"weeks": n_weeks, "first_week": str(min(d for d, _ in common).date()),
                   "last_week": str(max(d for d, _ in common).date()), "budget_alerts": k_budget,
                   "budget_per_week": budget_per_week}
    return table


LABELS = {"L0_baseline": "Fixed rule: flag any weekly move over the threshold",
          "L1_zscore": "Each item vs its own last 52 weeks (robust z-score)",
          "L2_relative": "L1 after removing general inflation (whole basket)",
          "L3_seasonal": "L1 after removing seasonality and Ramazan effects"}


def write_json(table: pd.DataFrame, events: pd.DataFrame, n_items: int, production: str) -> None:
    """data/evaluation.json — the backtest results the website's "How we tested it" section shows. Committed to git
    (the backtest is slow and only needs re-running when a detector changes)."""
    rows = [{"method": r["method"], "label": LABELS[r["method"]], "alerts": int(r["alerts"]),
             "alerts_per_week": float(r["alerts / week"]), "recall": float(r["recall"]),
             "precision_lower_bound": float(r["event precision (lower bound)"]),
             "missed": [m for m in r["missed"].split(", ") if m != "–"],
             "top_item": r["top item"], "top_item_share": float(r["top item share"])}
            for r in table.to_dict("records")]
    out = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": n_items,
           "production": production, **table.attrs, "methods": rows,
           "events": [{"id": e.event_id, "item_id": e.item_id, "start": str(e.start_week.date()), "end": str(e.end_week.date()),
                       "direction": e.direction, "description": e.description, "source": e.source_name, "url": e.source_url}
                      for e in events.itertuples()]}
    (DATA_DIR / "evaluation.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest every detector layer.")
    parser.add_argument("--json", action="store_true", help="also write data/evaluation.json for the website")
    args = parser.parse_args()
    settings = load_settings()
    cfg = settings["detect"]
    cuts = {m: cfg[m] for m in METHODS}
    with connect() as conn:
        wide, basket = load_series(conn, ("market",))   # anomalies only for market-priced items
        all_scores = {m: fn(wide, basket, cfg) for m, fn in METHODS.items()}
        change_pct = wide.pct_change() * 100

        anomalies = pd.concat([to_anomalies(s, change_pct, m, cuts[m]) for m, s in all_scores.items()])
        anomalies["week_date"] = anomalies["week_date"].dt.strftime("%Y-%m-%d")
        conn.execute("DELETE FROM anomalies")
        conn.executemany(
            "INSERT INTO anomalies (item_id, week_date, method, score, severity, direction, change_pct) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)", anomalies.itertuples(index=False))

    events = load_events()
    table = evaluate(all_scores, events, cuts, settings["evaluate"]["alert_budget_per_week"])
    print(table.to_markdown(index=False))
    if args.json:
        write_json(table, events, wide.shape[1], cfg["production_method"])
        log.info("wrote %s", DATA_DIR / "evaluation.json")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
