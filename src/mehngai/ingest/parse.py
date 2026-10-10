"""Stage 2 — Parse: Appendix-A (city-wise consumer prices) from an SPI Annex PDF → CSV.

Why Appendix-A (see docs/decisions.md, Phase 0): its items keep a fixed order (SL. 1–51) and its
price cells stay clean, while long item names in the Annexure-III table get garbled.
Known exception: two long item names (cooking oil 5 L tin, ghee 1 kg pouch) are drawn across the
first city's cells on each page (Islamabad, Multan, Bannu). Those cells don't parse as numbers and
come out blank — never as a wrong number. National and Lahore are unaffected.

Layout (same 2019 → 2026): 3 landscape pages, 7 + 7 + 3 cities, plus "National Average" on page 3.
Each city has MIN / AVG / MAX columns. Header row 1 holds city names, header row 2 holds MIN/AVG/MAX.

Output: one long-format CSV per report in data/interim/<YYYY-MM-DD>_annex.csv with columns
report_date, sl_no, item_raw, unit_raw, city, price_min, price_avg, price_max.
City "National" = national average.

Run:  python -m mehngai.ingest.parse [--force]
"""
from __future__ import annotations

import argparse
import logging
import re
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import pdfplumber

from mehngai.config import INTERIM_DIR, RAW_DIR

log = logging.getLogger(__name__)

EXPECTED_CITIES = 17
COLUMNS = ["report_date", "sl_no", "item_raw", "unit_raw", "city",
           "price_min", "price_avg", "price_max"]
_PRICES_ON = re.compile(r"PRICES\s+ON\s+(\d{1,2})[-./](\d{1,2})[-./](\d{4})", re.I)
_CITY_CODE = re.compile(r"\s*\(\d+\)\s*$")


def to_float(cell: str | None) -> float | None:
    """'1,770.12' → 1770.12; blanks, 'N.A.', '-' → None."""
    if cell is None:
        return None
    text = cell.replace(",", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def clean_text(cell: str | None) -> str:
    """Collapse whitespace/newlines in a text cell."""
    return " ".join((cell or "").split())


def city_columns(header_top: list, header_mid: list) -> dict[str, int]:
    """Map city name → column index of its MIN cell (AVG and MAX follow).

    A column starts a city block when the header has MIN, AVG, MAX in a row; the city name sits
    above the MIN cell. This skips "% Change over", "National Ave. (Prv/Cor Wk)" etc.
    """
    cities = {}
    for i in range(len(header_mid) - 2):
        if [clean_text(c).upper() for c in header_mid[i:i + 3]] == ["MIN", "AVG", "MAX"]:
            name = _CITY_CODE.sub("", clean_text(header_top[i]))
            cities["National" if name.lower().startswith("national") else name] = i
    return cities


def parse_page(page: pdfplumber.page.Page) -> list[dict]:
    """Extract (item, city, min/avg/max) records from one Appendix-A page."""
    tables = page.extract_tables()
    header = None
    for table in tables:
        for top, mid in zip(table, table[1:]):
            if city_columns(top, mid):
                header = (top, mid)
                break
        if header:
            break
    if header is None:
        raise ValueError(f"page {page.page_number}: no MIN/AVG/MAX header found")
    cities = city_columns(*header)

    records = []
    for table in tables:
        for row in table:
            sl = clean_text(row[0])
            # Item rows start with an SL number; skip the "1 2 3 4 ..." column-numbering row.
            if len(row) < 3 or not sl.isdigit() or clean_text(row[1]).isdigit():
                continue
            for city, col in cities.items():
                if col + 2 >= len(row):
                    continue
                records.append({
                    "sl_no": int(sl), "item_raw": clean_text(row[1]), "unit_raw": clean_text(row[2]),
                    "city": city, "price_min": to_float(row[col]),
                    "price_avg": to_float(row[col + 1]), "price_max": to_float(row[col + 2]),
                })
    return records


def parse_annex(pdf_path: Path) -> pd.DataFrame:
    """Parse all Appendix-A pages of one Annex PDF into a long-format DataFrame."""
    records: list[dict] = []
    report_date: date | None = None
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if "APPENDIX-A" not in text.upper():
                continue
            m = _PRICES_ON.search(text)
            if m and report_date is None:
                d, mth, y = map(int, m.groups())
                report_date = date(y, mth, d)
            records.extend(parse_page(page))

    if not records:
        raise ValueError(f"{pdf_path.name}: no Appendix-A pages found")
    if report_date is None:
        raise ValueError(f"{pdf_path.name}: no 'PRICES ON <date>' line found")

    df = pd.DataFrame(records)
    df.insert(0, "report_date", report_date.isoformat())
    check_shape(df, pdf_path.name)
    return df[COLUMNS]


def check_shape(df: pd.DataFrame, name: str) -> None:
    """Warn (don't fail) if the table looks incomplete; Phase 2 validation does the strict checks."""
    n_cities = df["city"].nunique()
    n_items = df.groupby("city")["sl_no"].nunique()
    if n_cities != EXPECTED_CITIES + 1:
        log.warning("%s: %d cities (+national), expected %d", name, n_cities, EXPECTED_CITIES + 1)
    if n_items.min() != n_items.max():
        log.warning("%s: item count differs by city (%d–%d)", name, n_items.min(), n_items.max())
    missing = df["price_avg"].isna().sum()
    if missing:
        log.info("%s: %d blank AVG cells (N.A. in source)", name, missing)


def date_from_raw_name(path: Path) -> str:
    """'2024-06-06_annex.pdf' → '2024-06-06' (filenames written by fetch.py)."""
    return path.name.split("_", 1)[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse Appendix-A from data/raw/*_annex.pdf.")
    parser.add_argument("--force", action="store_true", help="re-parse even if the CSV exists")
    args = parser.parse_args()

    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(RAW_DIR.glob("*_annex.pdf"))
    ok = skipped = failed = 0
    for pdf_path in pdfs:
        out = INTERIM_DIR / pdf_path.with_suffix(".csv").name
        if out.exists() and not args.force:
            skipped += 1
            continue
        try:
            df = parse_annex(pdf_path)
            if df["report_date"].iat[0] != date_from_raw_name(pdf_path):
                log.warning("%s: PDF says week ended %s", pdf_path.name, df["report_date"].iat[0])
            df.to_csv(out, index=False)
            ok += 1
        except Exception as exc:  # one bad PDF must not stop the batch
            failed += 1
            log.error("%s: %s", pdf_path.name, exc)
    log.info("parsed %d, skipped %d (already done), failed %d — of %d PDFs",
             ok, skipped, failed, len(pdfs))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
