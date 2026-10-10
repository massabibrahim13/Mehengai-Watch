"""Run only the production detector (chosen in Phase 4) and store its flags.

The weekly pipeline uses this instead of evaluate.py: it takes seconds, while the full backtest
fits STL ~500 times for L3. Only the production method's rows in `anomalies` are replaced.

Run:  python -m mehngai.detect.run
"""
from __future__ import annotations

import logging

from mehngai.config import load_settings
from mehngai.detect.evaluate import METHODS
from mehngai.detect.series import load_series, to_anomalies
from mehngai.store.db import connect

log = logging.getLogger(__name__)


def run() -> int:
    """Score the production method over all weeks, replace its anomalies rows. Returns # flags."""
    cfg = load_settings()["detect"]
    method = cfg["production_method"]
    with connect() as conn:
        wide, basket = load_series(conn)
        scores = METHODS[method](wide, basket, cfg)
        flags = to_anomalies(scores, wide.pct_change() * 100, method, cfg[method])
        flags["week_date"] = flags["week_date"].dt.strftime("%Y-%m-%d")
        conn.execute("DELETE FROM anomalies WHERE method = ?", (method,))
        conn.executemany(
            "INSERT INTO anomalies (item_id, week_date, method, score, severity, direction, change_pct) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)", flags.itertuples(index=False))
    latest = wide.index.max().strftime("%Y-%m-%d")
    log.info("%s: %d flags in total, %d in the latest week (%s)", method, len(flags),
             (flags["week_date"] == latest).sum(), latest)
    return len(flags)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run()
