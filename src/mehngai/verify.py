"""Check our numbers against PBS's own printed ones.

Next to the national average, every Annex PDF prints PBS's own figures: last week's average, the same week
last year, and the % change over both. Our pipeline never uses those columns — it computes every change itself
from the weekly national averages — so they are an independent check of parsing, cleaning, storing and the
calculations the website shows.

For each checked week and item we compare:
  price      our stored national average          vs PBS "National Average – AVG"
  previous   our previous report's average        vs PBS "National Ave. – Prv. Wk"
  change     our weekly % change                  vs PBS "% Change over – Prv. Wk"
  year ago   our price ~52 weeks earlier          vs PBS "National Ave. – Cor. Wk"
  yearly     our yearly % change                  vs PBS "% Change over – Cor. Wk"

Run:  python -m mehngai.verify [--weeks 52 | --all]   → prints a summary, writes docs/verification.md
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import pdfplumber

from mehngai.clean.normalize import load_items
from mehngai.config import PROJECT_ROOT, RAW_DIR
from mehngai.detect.series import load_series
from mehngai.export import year_ago
from mehngai.ingest.parse import city_columns, clean_text, to_float
from mehngai.store.db import connect

log = logging.getLogger(__name__)

PRICE_TOL = 0.011   # Rs — prices are printed with 2 decimals
PCT_TOL = 0.011     # percentage points — PBS prints % changes with 2 decimals
REPORT = PROJECT_ROOT / "docs" / "verification.md"
SUMMARY_JSON = PROJECT_ROOT / "data" / "verification_summary.json"   # read by export.py for the website


def pbs_national(pdf_path: Path) -> pd.DataFrame:
    """PBS's printed national columns: sl_no, avg, prev_week, year_ago, chg_week, chg_year (one row per item)."""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = (page.extract_text() or "").upper()
            if "APPENDIX-A" not in text or "NATIONAL" not in text:
                continue
            tables = page.extract_tables()
            cols = None
            for table in tables:
                for top, mid in zip(table, table[1:]):
                    nat = city_columns(top, mid).get("National")
                    labels = [clean_text(c).lower() for c in mid]
                    prv = [i for i, c in enumerate(labels) if c.startswith("prv")]
                    cor = [i for i, c in enumerate(labels) if c.startswith("cor")]
                    if nat is not None and len(prv) >= 2 and len(cor) >= 2:
                        # first Prv/Cor pair = national averages, second pair = % changes
                        cols = {"avg": nat + 1, "prev_week": prv[0], "year_ago": cor[0], "chg_week": prv[1], "chg_year": cor[1]}
                        break
                if cols:
                    break
            if cols is None:
                continue
            rows = []
            for table in tables:
                for row in table:
                    sl = clean_text(row[0])
                    if len(row) <= max(cols.values()) or not sl.isdigit() or clean_text(row[1]).isdigit():
                        continue
                    rows.append({"sl_no": int(sl), **{k: to_float(row[i]) for k, i in cols.items()}})
            if rows:
                return pd.DataFrame(rows).drop_duplicates("sl_no")
    raise ValueError(f"{pdf_path.name}: no national columns found")


def compare_week(week: pd.Timestamp, pbs: pd.DataFrame, wide: pd.DataFrame, by_sl: dict[int, str]) -> pd.DataFrame:
    """One row per tracked item: our figures, PBS's printed figures and whether each pair agrees."""
    i = wide.index.get_loc(week)
    out = []
    for r in pbs.itertuples():
        item_id = by_sl.get(r.sl_no)
        if item_id is None:
            continue
        s = wide[item_id]
        price, prev = s.iloc[i], (s.iloc[i - 1] if i > 0 else None)
        ya = year_ago(s.iloc[: i + 1], week)
        ours = {
            "price": price, "prev_week": prev,
            "chg_week": (price / prev - 1) * 100 if prev else None,
            "year_ago": ya, "chg_year": (price / ya - 1) * 100 if ya else None,
        }
        row = {"week": week.date(), "item_id": item_id}
        for key, theirs_key, tol in (("price", "avg", PRICE_TOL), ("prev_week", "prev_week", PRICE_TOL),
                                     ("chg_week", "chg_week", PCT_TOL), ("year_ago", "year_ago", PRICE_TOL),
                                     ("chg_year", "chg_year", PCT_TOL)):
            mine, theirs = ours[key], getattr(r, theirs_key)
            row[f"our_{key}"], row[f"pbs_{key}"] = mine, theirs
            row[f"ok_{key}"] = None if mine is None or theirs is None or pd.isna(mine) or pd.isna(theirs) \
                else abs(mine - theirs) <= tol
        out.append(row)
    return pd.DataFrame(out)


def run(weeks: int | None = 52) -> pd.DataFrame:
    """Compare the last `weeks` reports (all if None). Returns one row per (week, item)."""
    _, items = load_items()
    by_sl = {i["sl_no"]: i["item_id"] for i in items}
    with connect() as conn:
        wide, _ = load_series(conn)
    pdfs = {date.fromisoformat(p.name.split("_", 1)[0]): p for p in RAW_DIR.glob("*_annex.pdf")}
    checked_weeks = [w for w in wide.index if w.date() in pdfs]
    if weeks:
        checked_weeks = checked_weeks[-weeks:]
    frames = []
    for w in checked_weeks:
        try:
            frames.append(compare_week(w, pbs_national(pdfs[w.date()]), wide, by_sl))
        except Exception as exc:  # one odd PDF must not stop the check
            log.warning("%s: %s", w.date(), exc)
    return pd.concat(frames, ignore_index=True)


FIELDS = [("price", "this week's price"), ("prev_week", "last week's price"), ("chg_week", "weekly % change"),
          ("year_ago", "price a year ago"), ("chg_year", "yearly % change")]


def summarise(df: pd.DataFrame) -> pd.DataFrame:
    """Per field: values compared, matches, mismatches, not comparable (a blank on either side)."""
    rows = []
    for key, label in FIELDS:
        ok = df[f"ok_{key}"]
        compared = ok.notna().sum()
        matches = (ok == True).sum()  # noqa: E712 (ok holds True/False/None)
        blank = (df[f"our_{key}"].isna() & df[f"pbs_{key}"].notna()).sum()  # we show "–", PBS has a figure
        rows.append({"check": label, "compared": int(compared), "match": int(matches),
                     "mismatch": int(compared - matches), "left_blank": int(blank),
                     "match_%": round(100 * matches / compared, 2) if compared else None})
    return pd.DataFrame(rows)


def write_report(df: pd.DataFrame, path: Path = REPORT) -> None:
    summary = summarise(df)
    weeks = sorted(df["week"].unique())
    lines = [
        "# Verification against PBS's own printed figures",
        "",
        f"Checked {len(weeks)} weekly reports ({weeks[0]} → {weeks[-1]}), {df['item_id'].nunique()} items each. "
        "Our pipeline computes every change itself; PBS prints its own previous-week, same-week-last-year and "
        "% change figures next to the national average, so the two are independent.",
        "",
        "Tolerance: Rs 0.01 for prices, 0.01 percentage points for % changes (PBS prints 2 decimals).",
        "",
        "| Check | Compared | Match | Mismatch | Left blank (–) | Match % |",
        "|---|---:|---:|---:|---:|---:|",
        *[f"| {r.check} | {r.compared} | {r.match} | {r.mismatch} | {r.left_blank} | {r._6} |" for r in summary.itertuples()],
        "",
        "*Left blank*: we show \"–\" — the first year of our data (from Sep 2019) has no year earlier, and some "
        "weeks are missing from our archive; we never borrow a neighbouring week.",
        "",
        "*Why the rest differ*: (1) PBS sometimes corrects an earlier week's figure in a later report (e.g. electricity, "
        "27 Nov 2025: printed Rs 4.83, later quoted as Rs 5.40); we keep each week as first published. (2) When a week is "
        "missing from our archive, our \"weekly\" change spans two weeks, while PBS compares with the missing week.",
        "",
    ]
    bad = df[(df[[f"ok_{k}" for k, _ in FIELDS]] == False).any(axis=1)]  # noqa: E712
    if len(bad):
        lines += ["## Mismatches", "", "| Week | Item | Field | Ours | PBS |", "|---|---|---|---:|---:|"]
        for r in bad.itertuples():
            for key, label in FIELDS:
                if getattr(r, f"ok_{key}") is False:
                    lines.append(f"| {r.week} | {r.item_id} | {label} | {getattr(r, f'our_{key}'):.2f} | {getattr(r, f'pbs_{key}'):.2f} |")
        lines.append("")
    lines.append("Generated by `python -m mehngai.verify`.")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_summary_json(df: pd.DataFrame, path: Path = SUMMARY_JSON) -> None:
    """The headline numbers for the website's "How we tested it" section. Committed to git: the PDFs needed to
    recompute them are not available on the GitHub Actions machine."""
    weeks = sorted(df["week"].unique())
    summary = summarise(df)
    path.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reports": len(weeks), "first_week": str(weeks[0]), "last_week": str(weeks[-1]),
        "items": int(df["item_id"].nunique()),
        "checks": [{"check": r.check, "compared": r.compared, "match": r.match, "mismatch": r.mismatch,
                    "left_blank": r.left_blank, "match_pct": r._6} for r in summary.itertuples()],
    }, indent=2) + "\n", encoding="utf-8")


def check_latest() -> int:
    """Pipeline check: compare the newest report with PBS's printed figures; log every mismatch.
    Returns the number of mismatches (0 = all agree). Never raises: a check must not block publishing."""
    try:
        df = run(1)
    except Exception as exc:
        log.warning("could not verify the latest report: %s", exc)
        return -1
    bad = 0
    for key, label in FIELDS:
        for r in df[df[f"ok_{key}"] == False].itertuples():  # noqa: E712
            bad += 1
            log.warning("%s %s: our %s %.2f vs PBS %.2f", r.week, r.item_id, label,
                        getattr(r, f"our_{key}"), getattr(r, f"pbs_{key}"))
    log.info("latest report checked against PBS's printed figures: %d values, %d mismatches",
             int(sum(df[f"ok_{k}"].notna().sum() for k, _ in FIELDS)), bad)
    return bad


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare our numbers with PBS's printed figures.")
    parser.add_argument("--weeks", type=int, default=52, help="how many recent reports to check (default 52)")
    parser.add_argument("--all", action="store_true", help="check every report")
    args = parser.parse_args()
    df = run(None if args.all else args.weeks)
    print(summarise(df).to_string(index=False))
    write_report(df)
    print(f"report written to {REPORT.relative_to(PROJECT_ROOT)}")
    if args.all:   # the website shows the full-history check only
        write_summary_json(df)
        print(f"summary written to {SUMMARY_JSON.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
