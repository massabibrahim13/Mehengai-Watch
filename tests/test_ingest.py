"""Tests for stage 1–2: filename handling (no files needed) and parsing a known report."""
from datetime import date
from pathlib import Path

import pytest

from mehngai.config import RAW_DIR
from mehngai.ingest.fetch import date_from_filename, kind_from_filename, pick_one_per_week, to_link
from mehngai.ingest.parse import city_columns, parse_annex, to_float

KNOWN_REPORT = RAW_DIR / "2024-06-06_annex.pdf"


# --- fetch: filenames are inconsistent, these are real examples from PBS / Wayback ---

@pytest.mark.parametrize("name, expected", [
    ("SPI Annex 07.03.2019.pdf", date(2019, 3, 7)),
    ("spi_annex _05082021.pdf", date(2021, 8, 5)),
    ("SPI Annex&USCP_06062024.pdf", date(2024, 6, 6)),
    ("Annex_08.10.2026.pdf", date(2026, 10, 8)),
    ("3.-SPI-Report-08.10.2026.xlsx", date(2026, 10, 8)),
    ("Annexure 22-05-2025.xlsx", date(2025, 5, 22)),
    ("SPI_AnnexUSCP_070923.pdf", date(2023, 9, 7)),
    ("SPI-Monthly-Prices-Annex.xlsx", None),
])
def test_date_from_filename(name, expected):
    assert date_from_filename(name) == expected


@pytest.mark.parametrize("name, expected", [
    ("SPI Annex 07.03.2019.pdf", "annex"),
    ("api_annex_27012022.pdf", "annex"),              # PBS typo
    ("SPI_AnexUSCP_10082023.pdf", "annex"),            # PBS typo
    ("Executive_Summary_&_SPI_Report_10112022.pdf", "report"),
    ("Exective-Summary-SPI-Report_10.09.2026.pdf", "report"),
    ("3.-SPI-Report-08.10.2026.xlsx", None),           # not a PDF
    ("SPI-Monthly-Prices-Annex-9.pdf", None),          # monthly, not weekly
])
def test_kind_from_filename(name, expected):
    assert kind_from_filename(name) == expected


def test_live_pbs_copy_wins_over_wayback():
    url = "https://www.pbs.gov.pk/x/Annex_08.10.2026.pdf"
    wayback = to_link(url, "wayback", "https://web.archive.org/...")
    pbs = to_link(url, "pbs", url)
    chosen = pick_one_per_week([pbs, wayback])
    assert chosen[(date(2026, 10, 8), "annex")].source == "pbs"


# --- parse: pure helpers ---

def test_to_float():
    assert to_float("1,770.12") == 1770.12
    assert to_float("N.A.") is None
    assert to_float("2T6in95.00") is None   # garbled overflow text must never become a number
    assert to_float(None) is None


def test_city_columns_skips_non_price_blocks():
    top = ["SL.", "", "", "Khuzdar (17)", None, None, "National Average", None, None,
           "National Ave.", None, "% Change over", None]
    mid = ["NO.", "DESCRIPTION", "UNIT", "MIN", "AVG", "MAX", "MIN", "AVG", "MAX",
           "Prv. Wk", "Cor. Wk", "Prv. Wk", "Cor. Wk"]
    assert city_columns(top, mid) == {"Khuzdar": 3, "National": 6}


# --- parse: a real report with known values (needs `python -m mehngai.ingest.fetch` first) ---

@pytest.fixture(scope="module")
def known_report():
    if not KNOWN_REPORT.exists():
        pytest.skip(f"{KNOWN_REPORT.name} not downloaded yet — run python -m mehngai.ingest.fetch")
    return parse_annex(KNOWN_REPORT)


def avg_price(df, sl_no: int, city: str) -> float:
    return df[(df.sl_no == sl_no) & (df.city == city)]["price_avg"].item()


def test_known_report_shape(known_report):
    assert known_report["report_date"].unique().tolist() == ["2024-06-06"]
    assert known_report["city"].nunique() == 18           # 17 cities + National
    assert known_report["sl_no"].nunique() == 51


def test_known_report_values(known_report):
    assert avg_price(known_report, 22, "National") == 133.93   # onions (CLAUDE.md anchor)
    assert avg_price(known_report, 24, "National") == 143.18   # sugar
    assert avg_price(known_report, 15, "National") == 503.78   # ghee 1 kg pouch (long name)
    assert avg_price(known_report, 22, "Lahore") == 149.38     # onions, Lahore
