"""Stage 7 — Report: this week's unusual prices as a Markdown file (reports/YYYY-MM-DD.md).

Reads only from the database: prices, the production detector's anomalies, and cached explanations.
If an anomaly has no cached explanation (the explain stage didn't run), the guardrail template is used,
so the report never contains unchecked text and never fails for lack of an LLM.

Run:  python -m mehngai.report.weekly_report [--week YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

from mehngai.clean.normalize import load_items
from mehngai.config import PROJECT_ROOT, load_settings
from mehngai.detect.series import load_series
from mehngai.explain.facts import SEVERITY_WORDS, build_facts, label, unit_phrase
from mehngai.explain.guardrails import fmt, template
from mehngai.report.charts import flag_chart
from mehngai.store.db import connect

log = logging.getLogger(__name__)

REPORTS_DIR = PROJECT_ROOT / "reports"
ARROW = {"up": "▲", "down": "▼"}
SEVERITY_ORDER = {"extreme": 0, "unusual": 1, "watch": 2}
SOURCE_URL = "https://www.pbs.gov.pk/price-statistics/"


def load_week(conn, week: pd.Timestamp, method: str) -> tuple[pd.DataFrame, dict[str, str]]:
    """This week's flags (rises first, then by strength) and their cached explanations."""
    flags = pd.read_sql_query("SELECT * FROM anomalies WHERE method = ? AND week_date = ?", conn,
                              params=(method, week.strftime("%Y-%m-%d")))
    flags["rank"] = flags["severity"].map(SEVERITY_ORDER)
    flags = flags.sort_values(["direction", "rank", "score"], ascending=[False, True, False],
                              key=lambda c: c.abs() if c.name == "score" else c)
    texts = dict(conn.execute("SELECT item_id, text FROM explanations WHERE method = ? AND week_date = ?",
                              (method, week.strftime("%Y-%m-%d"))).fetchall())
    return flags, texts


def all_items_table(wide: pd.DataFrame, week: pd.Timestamp, items: dict, flags: pd.DataFrame,
                    typical_weeks: int) -> str:
    """Markdown table: every tracked item's price this week, change, and its usual weekly move."""
    i = wide.index.get_loc(week)
    pct = wide.pct_change() * 100
    status = {f.item_id: f"{ARROW[f.direction]} {SEVERITY_WORDS[f.severity]}" for f in flags.itertuples()}
    rows = ["| Item | Price | Change vs previous report | Typical weekly move | Flag |",
            "|---|---:|---:|---:|---|"]
    for item_id, item in items.items():
        typical = pct[item_id].iloc[max(1, i - typical_weeks):i].abs().median()
        rows.append(f"| {item['name']} | Rs {wide.at[week, item_id]:,.2f} {unit_phrase(item['unit'])} "
                    f"| {pct.at[week, item_id]:+.1f}% | {typical:.1f}% | {status.get(item_id, '–')} |")
    return "\n".join(rows)


def write(week: str | None = None) -> Path:
    """Write reports/<week>.md (default: the latest report week) and return its path."""
    settings = load_settings()
    method = settings["detect"]["production_method"]
    typical_weeks = settings["explain"]["typical_move_weeks"]
    items = {i["item_id"]: i for i in load_items()[1]}

    with connect() as conn:
        wide, _ = load_series(conn)
        target = pd.Timestamp(week) if week else wide.index.max()
        flags, texts = load_week(conn, target, method)
        history = pd.read_sql_query("SELECT item_id, week_date, direction FROM anomalies WHERE method = ?",
                                    conn, params=(method,), parse_dates=["week_date"])

    stamp = target.strftime("%Y-%m-%d")
    prev = wide.index[wide.index.get_loc(target) - 1]
    n = len(flags)
    lines = [
        f"# Mehngai Watch — week ending {label(target)}",
        "",
        f"Unusual weekly price moves in Pakistan's essentials: national average prices from the Pakistan "
        f"Bureau of Statistics' weekly Sensitive Price Indicator, compared with the previous report "
        f"({label(prev)}).",
        "",
        f"## This week: {n} unusual price move{'s' if n != 1 else ''}" if n else
        "## This week: no unusual price moves",
        "",
    ]
    if not n:
        lines += ["Every tracked item moved within its normal weekly range.", ""]
    for f in flags.itertuples():
        item = items[f.item_id]
        facts = build_facts(item, target, wide[f.item_id], f.severity, typical_weeks)
        text = texts.get(f.item_id) or template(facts)
        chart = flag_chart(wide[f.item_id], history[history["item_id"] == f.item_id], target,
                           f"{item['name']}: last 18 months",
                           REPORTS_DIR / "figures" / f"{stamp}_{f.item_id}.png")
        lines += [
            f"### {ARROW[f.direction]} {item['name']} — {SEVERITY_WORDS[f.severity]} "
            f"{'rise' if f.direction == 'up' else 'fall'}",
            "",
            f"**Rs {fmt(facts['price_this_week_rs'])} {facts['unit']}** "
            f"({'+' if f.direction == 'up' else '−'}{fmt(facts['change_pct'])}% vs {facts['previous_report']})",
            "",
            f"> {text}",
            "",
            f"![{item['name']} price chart](figures/{chart.name})",
            "",
        ]
    lines += [
        "## All tracked items this week",
        "",
        all_items_table(wide, target, items, flags, typical_weeks),
        "",
        "## How to read this",
        "",
        "- **Flagged** means this week's change is far outside the item's *own* normal weekly movement over "
        "the past year (robust z-score: notable ≥ 3.5, unusual ≥ 5, extreme ≥ 8). A 10% week is ordinary "
        "for tomatoes but extreme for sugar.",
        "- This is a **statistical** signal, not an accusation: it says a price moved unusually, not why "
        "or who is responsible.",
        "- The short explanations are written by an AI model **from the numbers above only**; every number is "
        "checked automatically, and the text is not allowed to state causes it wasn't given.",
        f"- Source: [PBS weekly SPI]({SOURCE_URL}), week ending {label(target)}. Data since Sep 2019. "
        "Built with Mehngai Watch (Edversity AI Solutions Engineers course project).",
        "",
    ]
    path = REPORTS_DIR / f"{stamp}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    log.info("report written: %s (%d flagged)", path, n)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Write the weekly Markdown report.")
    parser.add_argument("--week", help="YYYY-MM-DD (default: the latest report week)")
    write(parser.parse_args().week)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
