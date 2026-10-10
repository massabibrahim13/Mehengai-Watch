"""Price-related news headlines from Pakistani outlets' public RSS feeds.

Context only: headlines are shown as "possibly related news" with a link. Nothing here decides what is
anomalous, and no LLM reads or summarises the articles, so the app never claims a cause on its own.

Flow: fetch each feed → keep headlines that mention a tracked item AND a price word (or inflation/SPI)
→ tag them with item ids → store in the `news` table (one row per link, so re-fetching never
duplicates). `refresh_if_stale()` only goes online when the stored headlines are older than
`refresh_minutes`.

Run:  python -m mehngai.news      # fetch now and print what was kept
"""
from __future__ import annotations

import html
import logging
import os
import re
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import pandas as pd
import requests

from mehngai.clean.normalize import load_items
from mehngai.config import load_settings
from mehngai.search import items_in_text, normalise

log = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (MehngaiWatch course project; news headlines with links)"
TAG = re.compile(r"<[^>]+>")


def parse_feed(xml_bytes: bytes, source: str) -> list[dict]:
    """RSS XML → [{title, link, published, summary, source}] (published as UTC datetime or None)."""
    entries = []
    for item in ET.fromstring(xml_bytes).iter("item"):
        title = html.unescape((item.findtext("title") or "").strip())
        link = (item.findtext("link") or "").strip()
        if not title or not link:
            continue
        try:
            published = parsedate_to_datetime(item.findtext("pubDate")).astimezone(timezone.utc)
        except (TypeError, ValueError):
            published = None
        summary = html.unescape(TAG.sub(" ", item.findtext("description") or ""))[:400]
        entries.append({"title": title, "link": link, "published": published,
                        "summary": " ".join(summary.split()), "source": source})
    return entries


def has_any(text: str, words: list[str]) -> bool:
    """Whole-word / whole-phrase match of any of the words in normalised text."""
    padded = f" {normalise(text)} "
    return any(f" {normalise(w)} " in padded for w in words)


def classify(entry: dict, items: dict, cfg: dict) -> tuple[list[str], list[str]] | None:
    """(item ids, topics) if the headline is price news worth showing, else None.
    Matching uses the headline plus the start of the summary; topics: 'inflation', 'energy', 'food'."""
    text = f"{entry['title']}. {entry['summary'][:200]}"
    ids = items_in_text(entry["title"], items, ignore=set(cfg["ignore_aliases"]))
    if not ids:                                   # summary is a weaker signal: only if the title is silent
        ids = items_in_text(text, items, ignore=set(cfg["ignore_aliases"]))
    if not ids:                                   # "OGRA", "Nepra", "petroleum": only if no item is named
        for phrase, extra in cfg["extra_aliases"].items():
            if has_any(text, [phrase]):
                ids += [i for i in extra if i not in ids]
    if has_any(entry["title"], cfg["foreign_words"]) and not has_any(entry["title"], ["pakistan"]):
        return None                               # e.g. "Americans hit with record gasoline prices"
    inflation = has_any(text, cfg["inflation_words"])
    if not (inflation or (ids and has_any(text, cfg["price_words"]))):
        return None
    topics = ["inflation"] if inflation else []
    if any(items[i]["price_type"] == "administered" for i in ids):
        topics.append("energy")
    if any(items[i]["price_type"] != "administered" for i in ids):
        topics.append("food & goods")
    return ids, topics


def fetch_all(cfg: dict, items: dict) -> list[dict]:
    """Fetch every feed; a failing feed is logged and skipped. Returns the relevant entries."""
    kept = []
    for source, url in cfg["feeds"].items():
        try:
            resp = requests.get(url, timeout=cfg["timeout_seconds"], headers={"User-Agent": USER_AGENT})
            resp.raise_for_status()
            entries = parse_feed(resp.content, source)
        except (requests.RequestException, ET.ParseError) as exc:
            log.warning("news feed %s unavailable: %s", source, exc)
            continue
        for e in entries:
            tagged = classify(e, items, cfg)
            if tagged:
                e["item_ids"], e["topics"] = tagged
                kept.append(e)
        log.info("%s: %d headlines, %d about prices", source, len(entries),
                 sum(1 for e in entries if "item_ids" in e))
    return kept


def store(conn: sqlite3.Connection, entries: list[dict]) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    conn.executemany(
        "INSERT OR IGNORE INTO news (link, title, source, published, item_ids, topics, fetched_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(e["link"], e["title"], e["source"], e["published"].isoformat() if e["published"] else now,
          ",".join(e["item_ids"]), ",".join(e["topics"]), now) for e in entries])
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('news_refreshed_at', ?)", (now,))
    conn.commit()


def last_refresh(conn: sqlite3.Connection) -> datetime | None:
    row = conn.execute("SELECT value FROM meta WHERE key = 'news_refreshed_at'").fetchone()
    return datetime.fromisoformat(row[0]) if row else None


def refresh(conn: sqlite3.Connection) -> int:
    """Fetch all feeds now and store the relevant headlines. Returns how many were relevant."""
    cfg = load_settings()["news"]
    items = {i["item_id"]: i for i in load_items()[1]}
    entries = fetch_all(cfg, items)
    store(conn, entries)
    return len(entries)


def refresh_if_stale(conn: sqlite3.Connection) -> bool:
    """Refresh only if the stored headlines are older than `refresh_minutes`. True if it fetched.
    Set the environment variable MEHNGAI_OFFLINE=1 to never go online (used by tests)."""
    if os.getenv("MEHNGAI_OFFLINE"):
        return False
    minutes = load_settings()["news"]["refresh_minutes"]
    last = last_refresh(conn)
    if last and datetime.now(timezone.utc) - last < timedelta(minutes=minutes):
        return False
    refresh(conn)
    return True


def read_news(conn: sqlite3.Connection, item_id: str | None = None, limit: int = 20) -> pd.DataFrame:
    """Most recent stored headlines (optionally only those tagged with one item)."""
    days = load_settings()["news"]["keep_days"]
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    df = pd.read_sql_query("SELECT * FROM news WHERE published >= ? ORDER BY published DESC", conn,
                           params=(since,))
    if item_id:
        df = df[df["item_ids"].str.split(",").apply(lambda ids: item_id in ids)]
    return df.head(limit)


if __name__ == "__main__":
    from mehngai.store.db import connect
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    with connect() as conn:
        n = refresh(conn)
        print(f"{n} price-related headlines kept")
        for row in read_news(conn, limit=25).itertuples():
            print(f"- [{row.source}] {row.title}  ({row.item_ids or row.topics})")
