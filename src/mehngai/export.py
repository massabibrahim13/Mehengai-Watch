"""Stage 8 — Export: small JSON files for the website (web/public/data/).

The website reads only these files and computes nothing itself: every number, label and explanation
is prepared here from the database, by the same code the report uses.

  summary.json          this week: counts, unusual moves (+ explanations), government changes,
                        price revisions, biggest movers
  items.json            all 51 items: name, unit, group, aliases, latest price, weekly / yearly change,
                        typical weekly move, 26-week sparkline, this week's flag
  cities.json           the 17 survey cities (coordinates) + this week's price of every item in each
  news.json             latest price headlines (already filtered and item-tagged by news.py)
  index.json            "Essentials index": the weekly typical change across all 51 items (the L2 basket),
                        chained from 100 at the first report — our calculation, not the official SPI
  evaluation.json       "How we tested it": the detector backtest (data/evaluation.json) and the check against
                        PBS's own printed figures (data/verification_summary.json) — both made locally, committed
  series/<item>.json    full weekly history (national + 17 cities) + flagged weeks with explanations,
                        or set-price changes. One file per item, loaded only when an item is opened.

Files are compact JSON with NaN forbidden (browsers can't parse it); missing values are null.

Run:  python -m mehngai.export
"""
from __future__ import annotations

import json
import logging
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from mehngai.clean.normalize import load_items
from mehngai.config import CONFIG_DIR, DATA_DIR, PROJECT_ROOT, load_settings
from mehngai.detect.changes import price_changes
from mehngai.detect.series import load_series, same_week_last_year
from mehngai.explain.facts import SEVERITY_WORDS, build_facts, label, unit_phrase
from mehngai.explain.guardrails import template
from mehngai.news import read_news
from mehngai.store.db import connect

log = logging.getLogger(__name__)

OUT_DIR = PROJECT_ROOT / "web" / "public" / "data"
SPARK_WEEKS = 26


def num(x, digits: int = 2) -> float | None:
    """Round for JSON; NaN/None → null."""
    if x is None or (isinstance(x, float) and math.isnan(x)) or pd.isna(x):
        return None
    return round(float(x), digits)


def iso(d: pd.Timestamp) -> str:
    return pd.Timestamp(d).strftime("%Y-%m-%d")


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
                    encoding="utf-8")


def typical_move(series: pd.Series, i: int, weeks: int) -> float | None:
    """Median absolute weekly % change over the `weeks` before position i (same as report/facts)."""
    pct = series.pct_change() * 100
    return num(pct.iloc[max(1, i - weeks):i].abs().median(), 1)


def year_ago(series: pd.Series, week: pd.Timestamp) -> float | None:
    """Price in the same week last year, or None if PBS has no report for that week (see series.py)."""
    return same_week_last_year(series, week)


class Exporter:
    """Loads everything once from the database, then writes the files."""

    def __init__(self, conn: sqlite3.Connection):
        settings = load_settings()
        self.method = settings["detect"]["production_method"]
        self.thresholds = settings["detect"]["price_changes"]
        self.typical_weeks = settings["explain"]["typical_move_weeks"]
        self.items = {i["item_id"]: i for i in load_items()[1]}
        self.wide, self.basket = load_series(conn)
        self.week = self.wide.index.max()
        self.prev = self.wide.index[-2]
        self.flags = pd.read_sql_query("SELECT * FROM anomalies WHERE method = ?", conn,
                                       params=(self.method,), parse_dates=["week_date"])
        self.texts = {(i, pd.Timestamp(w)): (t, s) for i, w, t, s in conn.execute(
            "SELECT item_id, week_date, text, source FROM explanations WHERE method = ?", (self.method,))}
        self.cities = pd.read_sql_query("SELECT week_date, item_id, city, price FROM prices WHERE city != 'National'",
                                        conn, parse_dates=["week_date"])
        self.news = read_news(conn, limit=40)

    # ── helpers ──
    def explanation(self, item_id: str, week: pd.Timestamp, severity: str) -> tuple[str, str]:
        """(text, source): cached LLM text if there is one, else the guardrail template."""
        cached = self.texts.get((item_id, week))
        if cached:
            return cached
        facts = build_facts(self.items[item_id], week, self.wide[item_id], severity, self.typical_weeks)
        return template(facts), "template"

    def change_rows(self, frame: pd.DataFrame) -> list[dict]:
        return [{"item_id": r.item_id, "previous_price": num(r.previous_price), "price": num(r.price),
                 "change_pct": num(r.change_pct, 1)} for r in frame.itertuples()]

    # ── files ──
    def summary(self) -> dict:
        pct = (self.wide.iloc[-1] / self.wide.iloc[-2] - 1) * 100
        this_week = self.flags[self.flags["week_date"] == self.week]
        this_week = this_week.reindex(this_week["score"].abs().sort_values(ascending=False).index)
        unusual = []
        for f in this_week.itertuples():
            text, source = self.explanation(f.item_id, self.week, f.severity)
            s = self.wide[f.item_id]
            unusual.append({"item_id": f.item_id, "severity": f.severity, "severity_word": SEVERITY_WORDS[f.severity],
                            "direction": f.direction, "change_pct": num(f.change_pct, 1), "price": num(s.iloc[-1]),
                            "previous_price": num(s.iloc[-2]), "typical_move_pct": typical_move(s, len(s) - 1, self.typical_weeks),
                            "explanation": text, "explanation_source": source})
        changes = price_changes(self.wide, self.items, self.week, self.thresholds)
        movers = pd.DataFrame({"item_id": pct.index, "change_pct": pct.values, "price": self.wide.iloc[-1].values})
        rises = movers[movers["change_pct"] >= 0.05].nlargest(6, "change_pct")
        falls = movers[movers["change_pct"] <= -0.05].nsmallest(6, "change_pct")
        as_rows = lambda df: [{"item_id": r.item_id, "change_pct": num(r.change_pct, 1), "price": num(r.price)}
                              for r in df.itertuples()]
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "week": iso(self.week), "week_label": label(self.week),
            "previous_week": iso(self.prev), "previous_label": label(self.prev),
            "data_start": iso(self.wide.index.min()), "weeks_of_data": len(self.wide),
            "basket_change_pct": num((np.exp(self.basket.iloc[-1]) - 1) * 100, 2),
            "counts": {"up": int((pct > 0).sum()), "down": int((pct < 0).sum()), "unchanged": int((pct == 0).sum())},
            "thresholds": self.thresholds,
            "unusual": unusual,
            "government": self.change_rows(changes[changes["price_type"] == "administered"]),
            "revisions": self.change_rows(changes[changes["price_type"] == "fixed"]),
            "movers": {"rises": as_rows(rises), "falls": as_rows(falls)},
        }

    def items_list(self) -> list[dict]:
        flagged = self.flags[self.flags["week_date"] == self.week].set_index("item_id")["severity"].to_dict()
        counts = self.flags.groupby("item_id").size().to_dict()
        out = []
        for item_id, item in self.items.items():
            s = self.wide[item_id]
            ya = year_ago(s, self.week)
            out.append({
                "item_id": item_id, "name": item["name"], "unit": unit_phrase(item["unit"]),
                "category": item["category"], "price_type": item["price_type"], "aliases": item.get("aliases", []),
                "price": num(s.iloc[-1]), "previous_price": num(s.iloc[-2]),
                "change_pct": num((s.iloc[-1] / s.iloc[-2] - 1) * 100, 1),
                "year_ago_price": num(ya), "yoy_pct": num((s.iloc[-1] / ya - 1) * 100, 1) if ya else None,
                "typical_move_pct": typical_move(s, len(s) - 1, self.typical_weeks),
                "spark": [num(v) for v in s.iloc[-SPARK_WEEKS:]],
                "flag": flagged.get(item_id), "flags_since_start": int(counts.get(item_id, 0)),
            })
        return out

    def cities_file(self) -> dict:
        coords = yaml.safe_load((CONFIG_DIR / "cities.yaml").read_text(encoding="utf-8"))["cities"]
        now = self.cities[self.cities["week_date"] == self.week]
        prices = {item_id: {r.city: num(r.price) for r in grp.itertuples()}
                  for item_id, grp in now.groupby("item_id")}
        return {"week": iso(self.week), "cities": coords, "prices": prices}

    def series_file(self, item_id: str) -> dict:
        item = self.items[item_id]
        s = self.wide[item_id]
        weeks = [iso(d) for d in s.index]
        city_wide = (self.cities[self.cities["item_id"] == item_id]
                     .pivot(index="week_date", columns="city", values="price").reindex(s.index))
        out = {"item_id": item_id, "weeks": weeks, "national": [num(v) for v in s],
               "cities": {c: [num(v) for v in city_wide[c]] for c in sorted(city_wide.columns)}}
        if item["price_type"] == "market":
            fl = self.flags[self.flags["item_id"] == item_id].sort_values("week_date")
            out["flags"] = []
            for f in fl.itertuples():
                text, source = self.explanation(item_id, f.week_date, f.severity)
                out["flags"].append({"week": iso(f.week_date), "severity": f.severity,
                                     "severity_word": SEVERITY_WORDS[f.severity], "direction": f.direction,
                                     "change_pct": num(f.change_pct, 1), "explanation": text,
                                     "explanation_source": source})
        else:
            pct = s.pct_change() * 100
            th = self.thresholds[item["price_type"]]
            hits = pct[pct.abs() >= th].dropna()
            out["changes"] = [{"week": iso(d), "before": num(s.shift(1).loc[d]), "after": num(s.loc[d]),
                               "change_pct": num(v, 1)} for d, v in hits.items()]
        return out

    def index_file(self) -> dict:
        """Chain the weekly basket change (trimmed-mean log change of all 51 items) into an index."""
        changes = self.basket.fillna(0.0)
        changes.iloc[0] = 0.0                                   # first report = base 100
        index = 100 * np.exp(changes.cumsum())
        base_1y = year_ago(index, self.week)
        return {"weeks": [iso(d) for d in index.index], "values": [num(v) for v in index],
                "base_week": iso(index.index[0]), "latest": num(index.iloc[-1]),
                "change_1w_pct": num((index.iloc[-1] / index.iloc[-2] - 1) * 100, 2),
                "change_1y_pct": num((index.iloc[-1] / base_1y - 1) * 100, 1) if base_1y else None,
                "change_all_pct": num(index.iloc[-1] - 100, 1)}

    def news_list(self) -> list[dict]:
        return [{"title": r.title, "link": r.link, "source": r.source, "published": r.published,
                 "item_ids": [i for i in r.item_ids.split(",") if i],
                 "topics": [t for t in r.topics.split(",") if t]} for r in self.news.itertuples()]

    @staticmethod
    def evaluation_file() -> dict:
        """Combine the committed backtest and PBS cross-check results (either may be missing → null)."""
        read = lambda name: json.loads((DATA_DIR / name).read_text(encoding="utf-8")) if (DATA_DIR / name).exists() else None
        return {"backtest": read("evaluation.json"), "verification": read("verification_summary.json")}

    def write_all(self, out_dir: Path = OUT_DIR) -> dict[str, int]:
        write_json(out_dir / "summary.json", self.summary())
        write_json(out_dir / "items.json", self.items_list())
        write_json(out_dir / "cities.json", self.cities_file())
        write_json(out_dir / "news.json", self.news_list())
        write_json(out_dir / "index.json", self.index_file())
        write_json(out_dir / "evaluation.json", self.evaluation_file())
        for item_id in self.items:
            write_json(out_dir / "series" / f"{item_id}.json", self.series_file(item_id))
        # the price agent's precomputed answers, for the website chat's Worker (imported here, not at the top:
        # the agent's tools import this module)
        from mehngai.agent.publish import write_files
        write_files(out_dir)
        sizes ={p.relative_to(out_dir).as_posix(): p.stat().st_size for p in out_dir.rglob("*.json")}
        log.info("exported %d files, %.0f KB total, to %s", len(sizes), sum(sizes.values()) / 1024, out_dir)
        return sizes


def run(out_dir: Path = OUT_DIR) -> dict[str, int]:
    with connect() as conn:
        return Exporter(conn).write_all(out_dir)


def export_news_only(out_dir: Path = OUT_DIR) -> None:
    """Refresh just news.json (for the frequent news job)."""
    with connect() as conn:
        write_json(out_dir / "news.json", Exporter(conn).news_list())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sizes = run()
    big = sorted(sizes.items(), key=lambda kv: -kv[1])[:5]
    print("largest files:", ", ".join(f"{k} {v / 1024:.0f} KB" for k, v in big))
