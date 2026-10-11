"""Is what the website shows correct? Checks the exported JSON against the database, against the parsed PDFs,
and against PBS's own printed figures in the latest report. Uses the real data, so it skips when the data
hasn't been built (fresh checkout / CI without data). Run after `python -m mehngai.pipeline`."""
import json
import sqlite3
from datetime import date

import numpy as np
import pandas as pd
import pytest

from mehngai.clean.normalize import load_items
from mehngai.config import INTERIM_DIR, PROJECT_ROOT, RAW_DIR, load_settings
from mehngai.detect.series import load_series, same_week_last_year

DATA = PROJECT_ROOT / "web" / "public" / "data"
DB = PROJECT_ROOT / "data" / "mehngai.db"
pytestmark = pytest.mark.skipif(not (DB.exists() and (DATA / "items.json").exists()),
                                reason="needs the built database and exported JSON")


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def site():
    return {"items": {i["item_id"]: i for i in load("items.json")}, "summary": load("summary.json"),
            "cities": load("cities.json"), "index": load("index.json")}


@pytest.fixture(scope="module")
def db():
    conn = sqlite3.connect(DB)
    wide, basket = load_series(conn)
    yield {"conn": conn, "wide": wide, "basket": basket}
    conn.close()


def latest_pdf(week: str):
    path = RAW_DIR / f"{week}_annex.pdf"
    if not path.exists():
        pytest.skip(f"{path.name} not downloaded")
    return path


# ── against PBS's own printed figures ──

def test_latest_week_matches_pbs_print(site):
    from mehngai.verify import pbs_national
    week = site["summary"]["week"]
    pbs = pbs_national(latest_pdf(week)).set_index("sl_no")
    by_sl = {i["sl_no"]: i["item_id"] for i in load_items()[1]}
    checked = 0
    for sl, r in pbs.iterrows():
        it = site["items"].get(by_sl.get(sl))
        if it is None:
            continue
        checked += 1
        name = it["item_id"]
        assert it["price"] == pytest.approx(r.avg, abs=0.011), name
        assert it["previous_price"] == pytest.approx(r.prev_week, abs=0.011), name
        assert it["change_pct"] == pytest.approx(r.chg_week, abs=0.051), name          # we show 1 decimal
        if it["year_ago_price"] is not None:                                           # "–" when PBS has no report
            assert it["year_ago_price"] == pytest.approx(r.year_ago, abs=0.011), name
            assert it["yoy_pct"] == pytest.approx(r.chg_year, abs=0.051), name
    assert checked == 51


# ── exported JSON vs the database ──

def test_item_prices_and_changes_match_database(site, db):
    wide = db["wide"]
    for item_id, it in site["items"].items():
        s = wide[item_id]
        assert it["price"] == pytest.approx(s.iloc[-1], abs=0.006), item_id
        assert it["previous_price"] == pytest.approx(s.iloc[-2], abs=0.006), item_id
        assert it["change_pct"] == pytest.approx((s.iloc[-1] / s.iloc[-2] - 1) * 100, abs=0.051), item_id
        assert it["spark"] == pytest.approx([round(v, 2) for v in s.iloc[-26:]], abs=0.006), item_id
        ya = same_week_last_year(s, wide.index[-1])
        assert (it["year_ago_price"] is None) == (ya is None), item_id
        if ya is not None:
            assert it["yoy_pct"] == pytest.approx((s.iloc[-1] / ya - 1) * 100, abs=0.051), item_id


def test_summary_matches_database(site, db):
    summary, wide, conn = site["summary"], db["wide"], db["conn"]
    assert summary["week"] == wide.index[-1].strftime("%Y-%m-%d")
    assert summary["previous_week"] == wide.index[-2].strftime("%Y-%m-%d")
    assert summary["weeks_of_data"] == len(wide)
    assert summary["data_start"] == wide.index[0].strftime("%Y-%m-%d")
    method = load_settings()["detect"]["production_method"]
    flagged = {r[0] for r in conn.execute("SELECT item_id FROM anomalies WHERE method = ? AND week_date = ?",
                                          (method, summary["week"]))}
    assert {u["item_id"] for u in summary["unusual"]} == flagged
    for u in summary["unusual"]:
        it = site["items"][u["item_id"]]
        assert (u["price"], u["previous_price"], u["change_pct"]) == (it["price"], it["previous_price"], it["change_pct"])
    assert summary["counts"]["up"] + summary["counts"]["down"] + summary["counts"]["unchanged"] == 51


def test_government_and_revision_lists_follow_thresholds(site):
    summary, items = site["summary"], site["items"]
    th = summary["thresholds"]
    for group, rows in (("administered", summary["government"]), ("fixed", summary["revisions"])):
        expected = {i for i, it in items.items() if it["price_type"] == group
                    and abs((it["price"] / it["previous_price"] - 1) * 100) >= th[group]}
        assert {r["item_id"] for r in rows} == expected, group
        for r in rows:
            assert (r["previous_price"], r["price"]) == (items[r["item_id"]]["previous_price"], items[r["item_id"]]["price"])


def test_explanations_quote_the_right_numbers(site):
    for u in site["summary"]["unusual"]:
        text = u["explanation"]
        assert f"Rs {u['price']:,.2f}" in text, text
        assert f"{abs(u['change_pct']):.1f}%" in text, text
        assert ("rose" in text or "up" in text) if u["direction"] == "up" else ("fell" in text or "down" in text)


# ── cities vs the parsed PDF ──

def test_city_prices_match_parsed_pdf(site):
    week = site["cities"]["week"]
    csv = INTERIM_DIR / f"{week}_annex.csv"
    if not csv.exists():
        pytest.skip("parsed CSV missing")
    raw = pd.read_csv(csv)
    by_sl = {i["sl_no"]: i["item_id"] for i in load_items()[1]}
    raw = raw[raw["city"] != "National"].assign(item_id=lambda d: d["sl_no"].map(by_sl))
    shown = 0
    for r in raw.itertuples():
        value = site["cities"]["prices"].get(r.item_id, {}).get(r.city)
        if pd.isna(r.price_avg) or r.price_avg == 0:
            assert value is None, (r.item_id, r.city)       # blanks / "not sold here" are never shown as a price
        else:
            assert value == pytest.approx(r.price_avg, abs=0.006), (r.item_id, r.city)
            shown += 1
    assert shown > 51 * 17 * 0.9


# ── per-item history files ──

def test_series_files_agree_with_items(site, db):
    method = load_settings()["detect"]["production_method"]
    flags = pd.read_sql_query("SELECT item_id, week_date FROM anomalies WHERE method = ?", db["conn"], params=(method,))
    flagged = set(zip(flags["item_id"], flags["week_date"]))
    for item_id, it in site["items"].items():
        s = json.loads((DATA / "series" / f"{item_id}.json").read_text(encoding="utf-8"))
        assert len(s["weeks"]) == len(s["national"]) == site["summary"]["weeks_of_data"], item_id
        assert s["weeks"] == sorted(set(s["weeks"])), item_id
        assert s["national"][-1] == it["price"] and s["national"][-2] == it["previous_price"], item_id
        assert all(len(v) == len(s["weeks"]) for v in s["cities"].values()), item_id
        for f in s.get("flags", []):
            assert (item_id, f["week"]) in flagged, (item_id, f["week"])


# ── the Essentials index ──

def test_index_recomputed_from_the_basket(site, db):
    idx = site["index"]
    changes = db["basket"].fillna(0.0)
    changes.iloc[0] = 0.0
    values = 100 * np.exp(changes.cumsum())
    assert idx["values"] == pytest.approx([round(v, 2) for v in values], abs=0.006)
    assert idx["latest"] == pytest.approx(values.iloc[-1], abs=0.006)
    assert idx["change_1w_pct"] == pytest.approx((values.iloc[-1] / values.iloc[-2] - 1) * 100, abs=0.006)
    base = same_week_last_year(values, values.index[-1])
    assert (idx["change_1y_pct"] is None) == (base is None)
    if base is not None:
        assert idx["change_1y_pct"] == pytest.approx((values.iloc[-1] / base - 1) * 100, abs=0.051)
    assert date.fromisoformat(idx["base_week"]) == values.index[0].date()
