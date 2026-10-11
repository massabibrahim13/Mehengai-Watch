"""Stage 6 — Explain: write a plain-language note for each detected anomaly.

Flow per anomaly: facts (code) → prompt → LLM → guardrail check → retry once with the problems
listed → template fallback. Results are cached in the `explanations` table, keyed by the anomaly;
a cached row is reused only while its facts are unchanged, so re-runs cost no API calls.

Command line: see explain/__main__.py (python -m mehngai.explain --help).
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from mehngai.clean.normalize import load_items
from mehngai.config import load_settings
from mehngai.detect.series import load_series
from mehngai.explain.facts import build_facts
from mehngai.explain.guardrails import check, template
from mehngai.explain.llm import LLMError, generate
from mehngai.store.db import connect, save_explanations

log = logging.getLogger(__name__)

PROMPT_FILE = Path(__file__).parent / "prompts" / "explain_anomaly.txt"
RETRY_NOTE = ("\n\nYour previous answer broke these rules: {problems}\n"
              "Previous answer: {previous}\nWrite it again, following every rule.")


def explain(facts: dict, cfg: dict) -> tuple[str, str, int]:
    """(text, source, attempts) — source is 'llm' if a checked LLM answer passed, else 'template'."""
    facts_json = json.dumps(facts, indent=2, ensure_ascii=False)
    prompt = PROMPT_FILE.read_text(encoding="utf-8").replace("{facts_json}", facts_json)
    attempts, extra = 0, ""
    for _ in range(2):                                     # first try + one regeneration
        try:
            text = generate(prompt + extra, cfg)
        except LLMError as exc:
            log.warning("LLM unavailable (%s) — using template", exc)
            break
        attempts += 1
        problems = check(text, facts, cfg["banned_phrases"], cfg["max_words"])
        if not problems:
            return text, "llm", attempts
        log.warning("guardrail failed (attempt %d): %s | %s", attempts, problems, text)
        extra = RETRY_NOTE.format(problems="; ".join(problems), previous=text)
        time.sleep(cfg["request_delay_seconds"])
    return template(facts), "template", attempts


def pick_anomalies(conn, method: str, week: pd.Timestamp, sample: int | None) -> pd.DataFrame:
    """Which anomalies to explain: one report week, or a varied historical sample."""
    df = pd.read_sql_query("SELECT * FROM anomalies WHERE method = ?", conn, params=(method,),
                           parse_dates=["week_date"])
    if sample:
        # strongest anomaly per item, then fill with the strongest price drops: a varied test set
        df = df.reindex(df["score"].abs().sort_values(ascending=False).index)
        chosen = df.drop_duplicates("item_id")
        rest = df.drop(chosen.index)
        rest = rest[rest["direction"] == "down"]
        return pd.concat([chosen, rest]).head(sample)
    return df[df["week_date"] == week]


def run(week: str | None = None, sample: int | None = None, force: bool = False) -> list[dict]:
    """Explain one report week's anomalies (default: the latest week), or a historical sample.
    Returns one dict per anomaly: item_id, week_date, severity, direction, text, source."""
    settings = load_settings()
    cfg, method = settings["explain"], settings["detect"]["production_method"]
    items = {i["item_id"]: i for i in load_items()[1]}
    results = []

    with connect() as conn:
        wide, _ = load_series(conn)
        target = pd.Timestamp(week) if week else wide.index.max()
        todo = pick_anomalies(conn, method, target, sample)
        log.info("%d anomalies to explain (method %s%s)", len(todo), method,
                 "" if sample else f", week {target.date()}")
        for a in todo.itertuples():
            facts = build_facts(items[a.item_id], a.week_date, wide[a.item_id], a.severity,
                                cfg["typical_move_weeks"])
            facts_json = json.dumps(facts, ensure_ascii=False, sort_keys=True)
            key = (a.item_id, a.week_date.strftime("%Y-%m-%d"), method)
            cached = conn.execute("SELECT text, source FROM explanations WHERE item_id=? AND week_date=? "
                                  "AND method=? AND facts_json=?", (*key, facts_json)).fetchone()
            if cached and not force:
                text, source = cached
                log.info("cached: %s %s", *key[:2])
            else:
                text, source, attempts = explain(facts, cfg)
                conn.execute(
                    "INSERT OR REPLACE INTO explanations (item_id, week_date, method, text, source, model, "
                    "attempts, facts_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (*key, text, source, cfg["model"] if source == "llm" else None, attempts, facts_json,
                     datetime.now(timezone.utc).isoformat(timespec="seconds")))
                conn.commit()
                time.sleep(cfg["request_delay_seconds"])
            results.append({"item_id": a.item_id, "week_date": key[1], "severity": a.severity,
                            "direction": a.direction, "text": text, "source": source})
        save_explanations(conn)   # keep the cache in git (data/explanations.csv)
    log.info("explained %d: %d LLM, %d template", len(results),
             sum(r["source"] == "llm" for r in results), sum(r["source"] == "template" for r in results))
    return results
