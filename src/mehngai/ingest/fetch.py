"""Stage 1 — Ingest: discover SPI report links and download the ones we don't have yet.

Two link sources (see docs/decisions.md, Phase 0):
- PBS live site (Jul 2023 onward): the WordPress media API lists every uploaded file.
- Wayback Machine (2014 to mid 2025): CDX index of the old, now-deleted PBS URLs.

Downloads land in data/raw/ as <YYYY-MM-DD>_<kind>.pdf and are recorded in
data/raw/manifest.csv (url + sha256), so nothing is ever downloaded twice.

Run:  python -m mehngai.ingest.fetch [--start 2022-01-01] [--dry-run]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import logging
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import unquote

import requests

from mehngai.config import RAW_DIR, load_settings

log = logging.getLogger(__name__)

PBS_MEDIA_API = "https://www.pbs.gov.pk/wp-json/wp/v2/media"
PBS_SEARCH_TERMS = ("SPI", "Annex")
WAYBACK_CDX = "https://web.archive.org/cdx/search/cdx"
OLD_PBS_PREFIX = "pbs.gov.pk/sites/default/files/price_statistics/weekly_spi/"
USER_AGENT = "Mozilla/5.0 (MehngaiWatch course project; polite weekly fetch)"

MANIFEST = RAW_DIR / "manifest.csv"
MANIFEST_FIELDS = ["report_date", "kind", "source", "url", "file", "sha256", "downloaded_at"]

# Dates in filenames: 07.03.2019, 06062024, 29-05-2025, and rarely DDMMYY (070923).
_DATE_FULL = re.compile(r"(\d{1,2})[.\-_ ]?(\d{2})[.\-_ ]?(20\d{2})(?!\d)")
_DATE_SHORT = re.compile(r"(\d{2})(\d{2})(\d{2})(?!\d)")


@dataclass(frozen=True)
class ReportLink:
    report_date: date
    kind: str          # "annex" = Appendix-A city prices, "report" = exec summary + Annexure-III
    source: str        # "pbs" | "wayback"
    url: str           # original file URL on pbs.gov.pk
    download_url: str  # where we actually fetch it from


def date_from_filename(name: str) -> date | None:
    """Pull the report date out of an (inconsistently named) PBS filename."""
    for pattern in (_DATE_FULL, _DATE_SHORT):
        for m in pattern.finditer(name):
            d, mth, y = m.groups()
            year = int(y) if len(y) == 4 else 2000 + int(y)
            try:
                return date(year, int(mth), int(d))
            except ValueError:
                continue
    return None


def kind_from_filename(name: str) -> str | None:
    """Classify a filename as 'annex' or 'report' PDF; None for anything else."""
    low = name.lower()
    if not low.endswith(".pdf") or "monthly" in low:
        return None
    if re.search(r"ann?ex", low):          # Annex, Annexure, and the "Anex" typo
        return "annex"
    if re.search(r"report|sumary|summary", low):
        return "report"
    return None


def to_link(url: str, source: str, download_url: str) -> ReportLink | None:
    """Turn a raw URL into a ReportLink, or None if it isn't a dated SPI PDF."""
    name = unquote(url.rsplit("/", 1)[-1])
    kind = kind_from_filename(name)
    report_date = date_from_filename(name)
    if kind is None or report_date is None:
        return None
    return ReportLink(report_date, kind, source, url, download_url)


def get_with_retry(session: requests.Session, url: str, timeout: int, retries: int,
                   **kwargs) -> requests.Response:
    """GET with simple exponential backoff; raises after the last failed attempt."""
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=timeout, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            if attempt == retries:
                raise
            wait = 5 * 2 ** (attempt - 1)
            log.warning("GET failed (%s), retry %d/%d in %ds: %s", exc, attempt, retries, wait, url)
            time.sleep(wait)
    raise AssertionError("unreachable")


def list_pbs_links(session: requests.Session, timeout: int, retries: int) -> list[ReportLink]:
    """All SPI PDFs on the live PBS site, via the WordPress media API."""
    urls: set[str] = set()
    for term in PBS_SEARCH_TERMS:
        page, total_pages = 1, 1
        while page <= total_pages:
            resp = get_with_retry(session, PBS_MEDIA_API, timeout, retries, params={
                "search": term, "per_page": 100, "page": page, "_fields": "source_url"})
            total_pages = int(resp.headers.get("X-WP-TotalPages", 1))
            urls.update(item["source_url"] for item in resp.json())
            page += 1
    links = [to_link(u, "pbs", u) for u in urls]
    return [link for link in links if link]


def list_wayback_links(session: requests.Session, timeout: int, retries: int) -> list[ReportLink]:
    """All SPI PDFs the Wayback Machine archived from the old PBS file folder."""
    resp = get_with_retry(session, WAYBACK_CDX, timeout, retries, params={
        "url": OLD_PBS_PREFIX, "matchType": "prefix", "fl": "timestamp,original",
        "filter": "statuscode:200", "collapse": "urlkey"})
    if resp.text.lstrip().startswith("<"):
        raise RuntimeError("Wayback CDX returned HTML (archive.org temporarily offline?)")
    links = []
    for line in resp.text.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        timestamp, original = parts
        link = to_link(original, "wayback", f"https://web.archive.org/web/{timestamp}id_/{original}")
        if link:
            links.append(link)
    return links


def pick_one_per_week(links: list[ReportLink]) -> dict[tuple[date, str], ReportLink]:
    """Keep one link per (date, kind), preferring the live PBS copy over Wayback."""
    chosen: dict[tuple[date, str], ReportLink] = {}
    for link in sorted(links, key=lambda l: l.source == "pbs"):  # pbs sorted last → wins
        chosen[(link.report_date, link.kind)] = link
    return chosen


def read_manifest() -> dict[tuple[str, str], dict]:
    """Manifest rows keyed by (report_date ISO string, kind)."""
    if not MANIFEST.exists():
        return {}
    with open(MANIFEST, newline="", encoding="utf-8") as f:
        return {(row["report_date"], row["kind"]): row for row in csv.DictReader(f)}


def append_manifest(row: dict) -> None:
    """Add one downloaded file to the manifest (creates it with a header if needed)."""
    is_new = not MANIFEST.exists()
    with open(MANIFEST, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS)
        if is_new:
            writer.writeheader()
        writer.writerow(row)


def download(session: requests.Session, link: ReportLink, timeout: int, retries: int) -> Path:
    """Download one PDF into data/raw/, record it in the manifest, return its path."""
    resp = get_with_retry(session, link.download_url, timeout, retries)
    content = resp.content
    if not content.startswith(b"%PDF"):
        raise ValueError(f"not a PDF ({len(content)} bytes): {link.download_url}")
    dest = RAW_DIR / f"{link.report_date.isoformat()}_{link.kind}.pdf"
    dest.write_bytes(content)
    append_manifest({
        "report_date": link.report_date.isoformat(), "kind": link.kind, "source": link.source,
        "url": link.url, "file": dest.name, "sha256": hashlib.sha256(content).hexdigest(),
        "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    return dest


def log_gaps(dates: list[date]) -> None:
    """Warn about missing weeks (gaps longer than 10 days between consecutive reports)."""
    gaps = [(a, b) for a, b in zip(dates, dates[1:]) if (b - a).days > 10]
    for a, b in gaps:
        log.warning("gap: no report between %s and %s (%d days)", a, b, (b - a).days)


def main() -> None:
    settings = load_settings()["ingest"]
    parser = argparse.ArgumentParser(description="Download weekly SPI PDFs into data/raw/.")
    parser.add_argument("--start", type=date.fromisoformat, default=settings["start_date"])
    parser.add_argument("--end", type=date.fromisoformat, default=date.today())
    parser.add_argument("--kinds", nargs="+", default=settings["kinds"])
    parser.add_argument("--dry-run", action="store_true", help="list what would be downloaded")
    args = parser.parse_args()

    timeout, retries = settings["timeout_seconds"], settings["max_retries"]
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    links = list_pbs_links(session, timeout, retries)
    log.info("PBS live site: %d SPI PDFs", len(links))
    wayback = list_wayback_links(session, timeout, retries)
    log.info("Wayback Machine: %d SPI PDFs", len(wayback))

    chosen = pick_one_per_week(links + wayback)
    wanted = sorted((link for (d, kind), link in chosen.items()
                     if kind in args.kinds and args.start <= d <= args.end),
                    key=lambda l: (l.report_date, l.kind))
    log.info("%d reports in range %s → %s", len(wanted), args.start, args.end)
    log_gaps(sorted({l.report_date for l in wanted}))

    have = read_manifest()
    todo = [l for l in wanted if (l.report_date.isoformat(), l.kind) not in have]
    log.info("%d already downloaded, %d to fetch", len(wanted) - len(todo), len(todo))
    if args.dry_run:
        for link in todo:
            log.info("would fetch %s %s from %s", link.report_date, link.kind, link.source)
        return

    failed = 0
    for i, link in enumerate(todo, 1):
        try:
            path = download(session, link, timeout, retries)
            log.info("[%d/%d] %s (%s, %d KB)", i, len(todo), path.name, link.source,
                     path.stat().st_size // 1024)
        except (requests.RequestException, ValueError) as exc:
            failed += 1
            log.error("[%d/%d] failed %s %s: %s", i, len(todo), link.report_date, link.kind, exc)
        time.sleep(settings["request_delay_seconds"])
    log.info("done: %d downloaded, %d failed", len(todo) - failed, failed)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
