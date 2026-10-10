"""Run the whole pipeline, stages 1 → 7, with one command:

    python -m mehngai.pipeline

  1. fetch    new SPI annex PDFs (PBS live site; Wayback for history)   → data/raw/
  2. parse    Appendix-A tables                                         → data/interim/
  3–4. store  normalise, validate, rebuild the SQLite database          → data/mehngai.db
  5. detect   production detector only (seconds; the full L0–L3 backtest is detect.evaluate)
  6. explain  this week's anomalies (LLM + guardrails, cached)
  6b. news    price headlines from Pakistani news RSS feeds (context; failure is not fatal)
  7. report   reports/<week>.md

Each stage reads the previous stage's output from disk/DB, so a failed run can simply be re-run:
downloads, parsed CSVs and explanations are cached, and the database rebuild is idempotent.
On a fresh clone the first run downloads ~380 PDFs (about an hour, mostly the Wayback Machine).
"""
from __future__ import annotations

import argparse
import logging
import time
from datetime import date

from mehngai import news
from mehngai.config import load_settings
from mehngai.detect import run as detect
from mehngai.explain import run as explain
from mehngai.ingest import fetch, parse
from mehngai.report import weekly_report
from mehngai.store import db
from mehngai.store.db import connect

log = logging.getLogger("mehngai.pipeline")


def stage(name: str, fn, *args, **kwargs):
    """Run one stage with a timing log line; let errors stop the pipeline with a clear message."""
    log.info("── %s ──", name)
    start = time.perf_counter()
    try:
        result = fn(*args, **kwargs)
    except Exception:
        log.exception("stage '%s' failed — fix the error and re-run; earlier stages are cached", name)
        raise
    log.info("── %s done in %.1fs", name, time.perf_counter() - start)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Mehngai Watch end to end.")
    parser.add_argument("--skip-fetch", action="store_true", help="use the PDFs already downloaded")
    args = parser.parse_args()

    ingest = load_settings()["ingest"]
    if not args.skip_fetch:
        stage("1. fetch", fetch.run, ingest["start_date"], date.today(), ingest["kinds"])
    stage("2. parse", parse.run)
    stage("3-4. clean, validate, store", db.load)
    stage("5. detect", detect.run)
    results = stage("6. explain", explain.run)
    try:                                   # news is context only: a failure must not stop the report
        with connect() as conn:
            stage("6b. news", news.refresh, conn)
    except Exception:
        log.warning("news refresh failed; the report will use the headlines already stored")
    path = stage("7. report", weekly_report.write)
    log.info("finished: %s (%d flagged this week)", path.name, len(results))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    main()
