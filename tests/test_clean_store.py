"""Tests for stage 3–4: name matching, validation rules, and idempotent database loading."""
import sqlite3

import pandas as pd
import pytest

from mehngai.clean.normalize import name_matches
from mehngai.clean.validate import row_reason, validate, weekly_jump_reasons
from mehngai.store.db import connect, insert_prices, load_items_table

ITEMS = [{"item_id": "onions", "name": "Onions", "unit": "1 kg", "category": "vegetables",
          "price_type": "market"}]


# --- normalise ---

@pytest.mark.parametrize("raw, ok", [
    ("Vegetable Ghee DALDA/HABIB or O", True),   # garbled, cut short
    ("Chicken F", True),                          # garbled, very short but ≥ 5 letters agree
    ("Vegetable Ghee DALDA/HABIB 2.5", False),   # the 2.5 kg tin, a different item
    ("Veg", False),                               # too short to trust
])
def test_name_matches(raw, ok):
    prefix = "Chicken Farm Broiler" if raw.startswith("Chicken") else "Vegetable Ghee DALDA/HABIB or"
    assert name_matches(raw, prefix, min_chars=5) is ok


# --- validate ---

def test_row_rules():
    assert row_reason(100.0, 90.0, 110.0) is None
    assert row_reason(float("nan"), None, None).startswith("blank")
    assert row_reason(0.0, None, None) == "price not positive"
    assert row_reason(150.0, 90.0, 110.0) == "min/avg/max out of order"


def test_weekly_jump_compares_to_last_accepted():
    # 500 is a misread (×4.76); 110 must be compared to 105, not to 500.
    reasons = weekly_jump_reasons(pd.Series([100.0, 105.0, 500.0, 110.0]), max_ratio=4.0)
    assert reasons[0] is None and reasons[1] is None and reasons[3] is None
    assert reasons[2].startswith("weekly change x4.76")


def test_missing_national_price_is_logged():
    rows = pd.DataFrame({"week_date": ["2024-01-04"], "item_id": ["onions"], "unit": ["1 kg"],
                         "city": ["National"], "price": [100.0], "price_min": [90.0],
                         "price_max": [110.0], "sl_no": [22], "item_raw": ["Onions"]})
    accepted, rejected = validate(rows, ["onions"], ["2024-01-04", "2024-01-11"], max_ratio=4.0)
    assert len(accepted) == 1
    assert rejected[["week_date", "reason"]].values.tolist() == [["2024-01-11", "missing national price"]]


# --- store ---

def make_db(tmp_path):
    conn = connect(tmp_path / "test.db")
    conn.execute("INSERT INTO reports VALUES ('2024-01-04', 'pbs', 'u', 'h', 1)")
    load_items_table(conn, ITEMS)
    return conn


def test_load_twice_gives_same_rows(tmp_path):
    conn = make_db(tmp_path)
    accepted = pd.DataFrame({"item_id": ["onions"], "week_date": ["2024-01-04"], "city": ["National"],
                             "price": [100.0], "price_min": [90.0], "price_max": [float("nan")]})
    empty = pd.DataFrame(columns=["week_date", "item_id", "city", "sl_no", "item_raw", "price", "reason"])
    for _ in range(2):
        conn.execute("DELETE FROM prices")
        insert_prices(conn, accepted, empty)
        load_items_table(conn, ITEMS)
    assert conn.execute("SELECT COUNT(*) FROM prices").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM items").fetchone()[0] == 1


def test_primary_key_blocks_duplicates(tmp_path):
    conn = make_db(tmp_path)
    insert = "INSERT INTO prices (item_id, week_date, city, price) VALUES ('onions', '2024-01-04', 'National', 1)"
    conn.execute(insert)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(insert)


def test_foreign_key_blocks_unknown_week(tmp_path):
    conn = make_db(tmp_path)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO prices (item_id, week_date, city, price) "
                     "VALUES ('onions', '1999-01-01', 'National', 1)")
