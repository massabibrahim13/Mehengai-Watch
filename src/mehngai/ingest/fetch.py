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

from mehngai.config import INTERIM_DIR, RAW_DIR, load_settings

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
    size: int = 0      # Wayback capture size; bigger = complete (some captures were cut at 1 MB)


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


def to_link(url: str, source: str, download_url: str, size: int = 0) -> ReportLink | None:
    """Turn a raw URL into a ReportLink, or None if it isn't a dated SPI PDF."""
    name = unquote(url.rsplit("/", 1)[-1])
    kind = kind_from_filename(name)
    report_date = date_from_filename(name)
    if kind is None or report_date is None:
        return None
    return ReportLink(report_date, kind, source, url, download_url, size)


def is_complete_pdf(content: bytes) -> bool:
    """A whole PDF starts with %PDF and ends with an %%EOF marker; truncated captures don't."""
    return content.startswith(b"%PDF") and b"%%EOF" in content[-2048:]


def file_is_complete(path: Path) -> bool:
    """is_complete_pdf() for a file on disk, reading only its first and last bytes."""
    if not path.exists() or path.stat().st_size < 2048:
        return False
    with open(path, "rb") as f:
        head = f.read(8)
        f.seek(-2048, 2)
        return is_complete_pdf(head + f.read())


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
    """All SPI PDFs the Wayback Machine archived from the old PBS file folder.

    Every capture is listed (not just the first per URL): early captures of some 2023 files were
    cut off at 1 MB, and pick_one_per_week() then keeps the largest capture.
    """
    resp = get_with_retry(session, WAYBACK_CDX, timeout, retries, params={
        "url": OLD_PBS_PREFIX, "matchType": "prefix", "fl": "timestamp,original,length",
        "filter": "statuscode:200"})
    if resp.text.lstrip().startswith("<"):
        raise RuntimeError("Wayback CDX returned HTML (archive.org temporarily offline?)")
    links = []
    for line in resp.text.splitlines():
        parts = line.split()
        if len(parts) != 3 or not parts[2].isdigit():
            continue
        timestamp, original, length = parts
        link = to_link(original, "wayback", f"https://web.archive.org/web/{timestamp}id_/{original}",
                       int(length))
        if link:
            links.append(link)
    return links


def pick_one_per_week(links: list[ReportLink]) -> dict[tuple[date, str], ReportLink]:
    """Keep one link per (date, kind): the live PBS copy if there is one, else the largest
    Wayback capture (the most likely to be complete)."""
    chosen: dict[tuple[date, str], ReportLink] = {}
    for link in sorted(links, key=lambda l: (l.source == "pbs", l.size)):  # best sorted last → wins
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
    if not is_complete_pdf(content):
        raise ValueError(f"not a complete PDF ({len(content)} bytes): {link.download_url}")
    dest = RAW_DIR / f"{link.report_date.isoformat()}_{link.kind}.pdf"
    dest.write_bytes(content)
    append_manifest({
        "report_date": link.report_date.isoformat(), "kind": link.kind, "source": link.source,
        "url": link.url, "file": dest.name, "sha256": hashlib.sha256(content).hexdigest(),
        "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    return dest


def log_gaps(dates: list[date]) -> None:
    """Report missing weeks (gaps longer than 10 days between consecutive reports)."""
    gaps = [(a, b) for a, b in zip(dates, dates[1:]) if (b - a).days > 10]
    log.info("%d gaps (missing weeks) in range; details at debug level", len(gaps))
    for a, b in gaps:
        log.debug("gap: no report between %s and %s (%d days)", a, b, (b - a).days)


def run(start: date, end: date, kinds: list[str], dry_run: bool = False, wayback: bool = True) -> int:
    """Download every SPI PDF of the given kinds between start and end that we don't have yet.
    wayback=False skips the Internet Archive listing (only needed for history): a quick, polite check for new weeks.
    Returns how many files were downloaded."""
    settings = load_settings()["ingest"]
    timeout, retries = settings["timeout_seconds"], settings["max_retries"]
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    links = list_pbs_links(session, timeout, retries)
    log.info("PBS live site: %d SPI PDFs", len(links))
    archived = []
    if wayback:
        try:
            archived = list_wayback_links(session, timeout, retries)
            log.info("Wayback Machine: %d SPI PDFs", len(archived))
        except (requests.RequestException, RuntimeError) as exc:
            # Wayback only matters for history; a weekly run gets new reports from the live site.
            log.warning("Wayback Machine unavailable (%s) — continuing with the live PBS site only", exc)

    chosen = pick_one_per_week(links + archived)
    wanted = sorted((link for (d, kind), link in chosen.items()
                     if kind in kinds and start <= d <= end),
                    key=lambda l: (l.report_date, l.kind))
    log.info("%d reports in range %s → %s", len(wanted), start, end)
    log_gaps(sorted({l.report_date for l in wanted}))

    # Files that are missing or truncated on disk get downloaded again — unless the week is already parsed
    # (data/interim/ is in git, the PDFs are not, so a fresh machine only fetches new weeks).
    have = {key for key, row in read_manifest().items()
            if file_is_complete(RAW_DIR / row["file"])
            or (key[1] == "annex" and (INTERIM_DIR / f"{key[0]}_annex.csv").exists())}
    todo = [l for l in wanted if (l.report_date.isoformat(), l.kind) not in have]
    log.info("%d already downloaded, %d to fetch", len(wanted) - len(todo), len(todo))
    if dry_run:
        for link in todo:
            log.info("would fetch %s %s from %s", link.report_date, link.kind, link.source)
        return 0

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
    return len(todo) - failed


def main() -> None:
    settings = load_settings()["ingest"]
    parser = argparse.ArgumentParser(description="Download weekly SPI PDFs into data/raw/.")
    parser.add_argument("--start", type=date.fromisoformat, default=settings["start_date"])
    parser.add_argument("--end", type=date.fromisoformat, default=date.today())
    parser.add_argument("--kinds", nargs="+", default=settings["kinds"])
    parser.add_argument("--dry-run", action="store_true", help="list what would be downloaded")
    args = parser.parse_args()
    run(args.start, args.end, args.kinds, args.dry_run)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
