"""Stage 8: the JSON the website reads is complete, valid and consistent with the database.
Skipped on a fresh clone until the pipeline has built the database."""
import json

import pytest

from mehngai.store.db import db_path

pytestmark = pytest.mark.skipif(not db_path().exists(), reason="database not built yet")


@pytest.fixture(scope="module")
def out(tmp_path_factory):
    from mehngai import export
    d = tmp_path_factory.mktemp("data")
    export.run(d)
    return d


def load(out, name):
    return json.loads((out / name).read_text(encoding="utf-8"))


def test_all_files_written(out):
    assert {"summary.json", "items.json", "cities.json", "news.json"} <= {p.name for p in out.iterdir()}
    assert len(list((out / "series").glob("*.json"))) == 51


def test_summary_is_consistent(out):
    s, items = load(out, "summary.json"), {i["item_id"]: i for i in load(out, "items.json")}
    assert s["week"] == max(load(out, "series/sugar.json")["weeks"])
    for u in s["unusual"]:                                     # every flag has a checked explanation
        assert u["explanation"] and u["explanation_source"] in {"llm", "template"}
        assert items[u["item_id"]]["price_type"] == "market"
        assert items[u["item_id"]]["flag"] == u["severity"]
    for g in s["government"]:
        assert items[g["item_id"]]["price_type"] == "administered"
    assert sum(s["counts"].values()) == 51


def test_items_and_cities(out):
    items = load(out, "items.json")
    assert len(items) == 51 and all(len(i["spark"]) == 26 for i in items)
    cities = load(out, "cities.json")
    assert len(cities["cities"]) == 17 and all(-90 < c["lat"] < 90 for c in cities["cities"])
    assert set(cities["prices"]["sugar"]) <= {c["name"] for c in cities["cities"]}


def test_series_aligned(out):
    s = load(out, "series/onions.json")
    n = len(s["weeks"])
    assert len(s["national"]) == n and all(len(v) == n for v in s["cities"].values())
    assert s["flags"] and all(f["week"] in s["weeks"] for f in s["flags"])
    assert "changes" in load(out, "series/petrol.json")            # set-price items list changes instead


def test_no_nan_anywhere(out):
    for p in out.rglob("*.json"):
        assert "NaN" not in p.read_text(encoding="utf-8"), p.name
