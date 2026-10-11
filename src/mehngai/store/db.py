"""Stage 4 — Store: the SQLite database, the single source of truth.

Load flow (python -m mehngai.store.db):
  manifest.csv  → reports      (one row per downloaded PDF)
  items.yaml    → items        (canonical item list)
  interim CSVs  → normalise → validate → prices (accepted) + rejected_rows (with reason)

Idempotent: running it twice gives the same database. Primary keys make duplicate rows
impossible, and reports/prices/rejected_rows are rebuilt from the manifest + interim CSVs inside
one transaction, so a rule change in validate.py applies cleanly to old weeks too, and nothing
stale is left behind. items is upserted (it will be referenced by anomalies later).
"""
from __future__ import annotations

import csv
import logging
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import trim_mean

from mehngai.clean.normalize import load_items, normalize, read_interim
from mehngai.clean.validate import validate
from mehngai.config import DATA_DIR, INTERIM_DIR, RAW_DIR, load_settings

log = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    report_date TEXT PRIMARY KEY,           -- week-ending date, YYYY-MM-DD
    source      TEXT NOT NULL,              -- 'pbs' (live site) or 'wayback'
    source_url  TEXT NOT NULL,
    file_hash   TEXT NOT NULL,              -- sha256 of the PDF
    parsed_ok   INTEGER NOT NULL            -- 1 = Appendix-A parsed into an interim CSV
);
CREATE TABLE IF NOT EXISTS items (
    item_id    TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    unit       TEXT NOT NULL,
    category   TEXT,
    price_type TEXT NOT NULL                -- 'market' or 'administered'
);
CREATE TABLE IF NOT EXISTS prices (
    item_id   TEXT NOT NULL REFERENCES items(item_id),
    week_date TEXT NOT NULL REFERENCES reports(report_date),
    city      TEXT NOT NULL,                -- 'National' = national average
    price     REAL NOT NULL,                -- average price in Rs
    price_min REAL,
    price_max REAL,
    PRIMARY KEY (item_id, week_date, city)
);
CREATE TABLE IF NOT EXISTS basket (
    week_date  TEXT PRIMARY KEY REFERENCES reports(report_date),
    log_change REAL NOT NULL,               -- trimmed-mean log price change of all SPI items vs previous report
    n_items    INTEGER NOT NULL             -- how many items had a price in both reports
);
CREATE TABLE IF NOT EXISTS anomalies (
    item_id    TEXT NOT NULL REFERENCES items(item_id),
    week_date  TEXT NOT NULL REFERENCES reports(report_date),
    method     TEXT NOT NULL,               -- 'L0_baseline', 'L1_zscore', 'L2_relative', 'L3_seasonal'
    score      REAL NOT NULL,               -- signed: + = price up
    severity   TEXT NOT NULL,               -- 'watch' | 'unusual' | 'extreme'
    direction  TEXT NOT NULL,               -- 'up' | 'down'
    change_pct REAL NOT NULL,               -- raw % change vs previous report
    PRIMARY KEY (item_id, week_date, method)
);
CREATE TABLE IF NOT EXISTS explanations (
    -- A cache, deliberately without a foreign key: anomalies are rebuilt on every detector run, and
    -- explanations must survive that so we don't pay for the same LLM call twice. A row is reused
    -- only while its facts_json is unchanged.
    item_id    TEXT NOT NULL,
    week_date  TEXT NOT NULL,
    method     TEXT NOT NULL,
    text       TEXT NOT NULL,
    source     TEXT NOT NULL,               -- 'llm' or 'template' (guardrail fallback)
    model      TEXT,                        -- LLM model name; NULL for template
    attempts   INTEGER NOT NULL,            -- LLM calls made (0 = template without trying)
    facts_json TEXT NOT NULL,               -- exactly what the LLM was given
    created_at TEXT NOT NULL,
    PRIMARY KEY (item_id, week_date, method)
);
CREATE TABLE IF NOT EXISTS news (
    -- Price-related headlines from Pakistani RSS feeds (see news.py). Context only, kept across loads.
    link       TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    source     TEXT NOT NULL,
    published  TEXT NOT NULL,               -- UTC ISO time
    item_ids   TEXT NOT NULL,               -- comma-separated tracked items mentioned ('' = none)
    topics     TEXT NOT NULL,               -- comma-separated: inflation, energy, food & goods
    fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rejected_rows (
    week_date TEXT NOT NULL,
    item_id   TEXT NOT NULL,
    city      TEXT NOT NULL,
    sl_no     INTEGER,
    item_raw  TEXT,
    price     REAL,
    reason    TEXT NOT NULL,
    PRIMARY KEY (week_date, item_id, city)
);
"""


def db_path() -> Path:
    return DATA_DIR / load_settings()["store"]["db_file"]


def connect(path: Path | None = None) -> sqlite3.Connection:
    """Open the database (creating tables if needed) with foreign-key checks on."""
    conn = sqlite3.connect(path or db_path())
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def none_if_nan(value):
    """SQLite wants None for missing values, pandas uses NaN."""
    return None if pd.isna(value) else value


def report_date_of(manifest_date: str) -> tuple[str, int]:
    """(authoritative report date, parsed_ok). The date printed in the PDF wins over the filename
    date (e.g. file '01072022' is really the week ended 2022-06-30)."""
    interim = INTERIM_DIR / f"{manifest_date}_annex.csv"
    if not interim.exists():
        return manifest_date, 0
    return pd.read_csv(interim, usecols=["report_date"], nrows=1)["report_date"].iat[0], 1


EXPLANATIONS_CSV = DATA_DIR / "explanations.csv"
EXPLANATION_COLUMNS = ["item_id", "week_date", "method", "text", "source", "model", "attempts", "facts_json", "created_at"]


def save_explanations(conn: sqlite3.Connection, path: Path | None = None) -> int:
    """Write the explanations cache to a CSV (committed to git), so a fresh machine — e.g. the weekly GitHub
    Actions run, which starts with no database — reuses them instead of calling the LLM again."""
    path = path or EXPLANATIONS_CSV
    df = pd.read_sql_query(f"SELECT {', '.join(EXPLANATION_COLUMNS)} FROM explanations "
                           "ORDER BY week_date, item_id, method", conn)
    df.to_csv(path, index=False, lineterminator="\n")
    return len(df)


def restore_explanations(conn: sqlite3.Connection, path: Path | None = None) -> int:
    """Load the committed explanations CSV into the cache (rows already in the database win)."""
    path = path or EXPLANATIONS_CSV
    if not path.exists():
        return 0
    df = pd.read_csv(path, dtype={"model": "string"}, keep_default_na=False)
    rows = [tuple(None if (c == "model" and v == "") else v for c, v in zip(EXPLANATION_COLUMNS, r))
            for r in df[EXPLANATION_COLUMNS].itertuples(index=False)]
    before = conn.execute("SELECT COUNT(*) FROM explanations").fetchone()[0]
    conn.executemany(f"INSERT OR IGNORE INTO explanations ({', '.join(EXPLANATION_COLUMNS)}) "
                     f"VALUES ({', '.join('?' * len(EXPLANATION_COLUMNS))})", rows)
    return conn.execute("SELECT COUNT(*) FROM explanations").fetchone()[0] - before


def clear_derived(conn: sqlite3.Connection) -> None:
    """Empty the tables that are rebuilt on every load (children before parents, for the FKs).
    Anomalies are derived from prices, so they go too; the detectors rebuild them."""
    for table in ("anomalies", "basket", "prices", "rejected_rows", "reports"):
        conn.execute(f"DELETE FROM {table}")


def basket_changes(raw: pd.DataFrame, report_dates: list[str]) -> pd.DataFrame:
    """Weekly "general inflation": trimmed-mean log change across ALL 51 SPI items (national).
    Used by the L2 detector.

    Trimmed mean = drop the 10% biggest and 10% smallest changes, average the rest. One item
    spiking can't move it. (A plain median doesn't work: most weeks over half the items don't
    change at all, so the median is 0.) Items are matched by SL number, stable within the base.
    """
    nat = raw[(raw["city"] == "National") & raw["report_date"].isin(report_dates)
              & (raw["price_avg"] > 0)]
    wide = nat.pivot_table(index="report_date", columns="sl_no", values="price_avg").sort_index()
    log_changes = np.log(wide).diff().iloc[1:]
    return pd.DataFrame({"week_date": log_changes.index,
                         "log_change": trim_mean(log_changes, 0.1, axis=1, nan_policy="omit"),
                         "n_items": log_changes.notna().sum(axis=1).values})


def load_reports(conn: sqlite3.Connection) -> list[str]:
    """Insert one row per downloaded annex PDF from the manifest; return parsed report dates."""
    with open(RAW_DIR / "manifest.csv", newline="", encoding="utf-8") as f:
        # A re-downloaded file (e.g. after a truncated copy) appears twice; the later row wins.
        rows = list({r["report_date"]: r for r in csv.DictReader(f) if r["kind"] == "annex"}.values())
    records = []
    for r in rows:
        report_date, parsed_ok = report_date_of(r["report_date"])
        records.append((report_date, r["source"], r["url"], r["sha256"], parsed_ok))
    conn.executemany("INSERT INTO reports (report_date, source, source_url, file_hash, parsed_ok) "
                     "VALUES (?, ?, ?, ?, ?)", records)
    return sorted(r[0] for r in records if r[4])


def load_items_table(conn: sqlite3.Connection, items: list[dict]) -> None:
    """Upsert the canonical item list from items.yaml."""
    conn.executemany("""
        INSERT INTO items (item_id, name, unit, category, price_type) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (item_id) DO UPDATE SET name = excluded.name, unit = excluded.unit,
            category = excluded.category, price_type = excluded.price_type
    """, [(i["item_id"], i["name"], i["unit"], i["category"], i["price_type"]) for i in items])


def insert_prices(conn: sqlite3.Connection, accepted: pd.DataFrame, rejected: pd.DataFrame) -> None:
    """Insert this run's validated prices and rejected rows."""
    conn.executemany(
        "INSERT INTO prices (item_id, week_date, city, price, price_min, price_max) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [(r.item_id, r.week_date, r.city, r.price, none_if_nan(r.price_min), none_if_nan(r.price_max))
         for r in accepted.itertuples()])
    conn.executemany(
        "INSERT INTO rejected_rows (week_date, item_id, city, sl_no, item_raw, price, reason) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [tuple(none_if_nan(v) for v in r) for r in rejected.itertuples(index=False)])


def read_prices(conn: sqlite3.Connection, city: str = "National") -> pd.DataFrame:
    """Weekly price series for all tracked items in one city (default: national average)."""
    return pd.read_sql_query(
        "SELECT week_date, item_id, price FROM prices WHERE city = ? ORDER BY item_id, week_date",
        conn, params=(city,), parse_dates=["week_date"])


def load() -> None:
    """Rebuild the database from the manifest, items.yaml and the interim CSVs."""
    settings = load_settings()["clean"]
    series_start, items = load_items()

    raw = read_interim()
    rows, name_rejects = normalize(raw, items, series_start, settings["min_name_match_chars"])

    with connect() as conn:  # one transaction: all of it commits, or none of it
        clear_derived(conn)
        report_dates = [d for d in load_reports(conn) if d >= series_start.isoformat()]
        load_items_table(conn, items)
        accepted, rejected = validate(rows, [i["item_id"] for i in items], report_dates,
                                      settings["max_weekly_ratio"])
        # one reason per row: a name mismatch also shows up as a "missing national price"
        rejected = pd.concat([name_rejects, rejected], ignore_index=True).drop_duplicates(
            subset=["week_date", "item_id", "city"])
        insert_prices(conn, accepted, rejected)
        basket = basket_changes(raw, report_dates)
        conn.executemany("INSERT INTO basket (week_date, log_change, n_items) VALUES (?, ?, ?)",
                         basket.itertuples(index=False))
        restored = restore_explanations(conn)

        summary = conn.execute("""
            SELECT item_id, COUNT(*) AS weeks, MIN(week_date), MAX(week_date)
            FROM prices WHERE city = 'National' GROUP BY item_id ORDER BY item_id
        """).fetchall()
    log.info("loaded %d price rows, %d rejected rows, %d reports; %d explanations restored from %s",
             len(accepted), len(rejected), len(report_dates), restored, EXPLANATIONS_CSV.name)
    for item_id, weeks, first, last in summary:
        log.info("  %-12s %3d weeks  %s → %s", item_id, weeks, first, last)


def main() -> None:
    load()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
