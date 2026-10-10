"""v2 features: all 51 items in three groups, search, ask, news, set-price changes. No network needed."""
import numpy as np
import pandas as pd
import pytest

from mehngai.ask import answer, find_dates, parse_rules
from mehngai.clean.normalize import load_items
from mehngai.clean.validate import validate
from mehngai.config import load_settings
from mehngai.detect.changes import price_changes
from mehngai.news import classify, parse_feed
from mehngai.search import find_items, items_in_text

ITEMS = {i["item_id"]: i for i in load_items()[1]}
NEWS_CFG = load_settings()["news"]
LATEST = pd.Timestamp("2026-10-08")
CITIES = ["National", "Lahore", "Karachi", "Quetta", "Islamabad"]


# --- the item list ---

def test_all_51_items_in_three_groups():
    assert len(ITEMS) == 51
    assert len({i["sl_no"] for i in ITEMS.values()}) == 51
    groups = pd.Series([i["price_type"] for i in ITEMS.values()]).value_counts().to_dict()
    assert groups == {"market": 25, "fixed": 20, "administered": 6}
    assert {"petrol", "diesel", "lpg", "electricity", "gas", "telephone"} == {
        k for k, v in ITEMS.items() if v["price_type"] == "administered"}


# --- search ---

@pytest.mark.parametrize("query, expected", [
    ("aata", "wheat_flour"), ("cheeni", "sugar"), ("tamatar", "tomatoes"), ("ٹماٹر", "tomatoes"),
    ("onoin", "onions"), ("bijli", "electricity"), ("Petrol", "petrol"), ("doodh", "milk"),
])
def test_find_items(query, expected):
    assert find_items(query, ITEMS)[0][0] == expected


def test_untracked_product_finds_nothing():
    assert find_items("iphone", ITEMS) == []


@pytest.mark.parametrize("text, expected", [
    ("price of gas cylinder in Lahore", ["lpg"]),             # longer alias wins over "gas"
    ("mustard oil and sugar prices", ["mustard_oil", "sugar"]),
    ("cup of tea at a dhaba", ["tea_cup"]),
    ("Onions and tomatoes become costlier", ["tomatoes", "onions"]),
])
def test_items_in_text(text, expected):
    assert items_in_text(text, ITEMS) == expected


# --- ask: understanding ---

def test_dates():
    assert find_dates("onions in March 2024", LATEST) == [pd.Timestamp("2024-03-31")]
    assert find_dates("chicken on 14 Feb 2023", LATEST) == [pd.Timestamp("2023-02-14")]
    assert find_dates("price on 2024-06-06", LATEST) == [pd.Timestamp("2024-06-06")]
    assert find_dates("since last year", LATEST) == [LATEST - pd.Timedelta(weeks=52)]


@pytest.mark.parametrize("text, items, city, intent", [
    ("What is the price of onions in Lahore in March 2024?", ["onions"], "Lahore", "price"),
    ("cheapest city for sugar", ["sugar"], "National", "cheapest"),
    ("which city has the most expensive tomatoes", ["tomatoes"], "National", "priciest"),
    ("how much has petrol gone up since last year?", ["petrol"], "National", "change"),
    ("aata ki qeemat karachi", ["wheat_flour"], "Karachi", "price"),
    ("آٹا کی قیمت لاہور", ["wheat_flour"], "Lahore", "price"),
])
def test_parse_rules(text, items, city, intent):
    q = parse_rules(text, ITEMS, CITIES, LATEST)
    assert (q.item_ids, q.city, q.intent) == (items, city, intent)


# --- ask: answering (numbers come only from the price table) ---

@pytest.fixture
def prices():
    weeks = pd.date_range("2025-10-02", periods=54, freq="W-THU")
    rows = []
    for w_i, w in enumerate(weeks):
        for city, base in (("Lahore", 140), ("Karachi", 150), ("Quetta", 130)):
            rows.append({"week_date": w, "item_id": "sugar", "city": city, "price": base + w_i})
        rows.append({"week_date": w, "item_id": "sugar", "city": "National", "price": 140 + w_i})
    return pd.DataFrame(rows)


def test_answer_cheapest(prices):
    q = parse_rules("cheapest city for sugar", ITEMS, CITIES, prices["week_date"].max())
    a = answer(q, prices, ITEMS)
    assert "cheapest in **Quetta**" in a.text and "Rs 183.00" in a.text      # 130 + 53
    assert list(a.table["City"]) == ["Quetta", "Lahore", "Karachi"]


def test_answer_change(prices):
    latest = prices["week_date"].max()
    q = parse_rules("how much has sugar gone up since last year", ITEMS, CITIES, latest)
    a = answer(q, prices, ITEMS)
    assert "Rs 141.00" in a.text and "Rs 193.00" in a.text and "+36.9%" in a.text


def test_answer_before_data_starts(prices):
    q = parse_rules("sugar price in March 2019", ITEMS, CITIES, prices["week_date"].max())
    assert "earliest week" in answer(q, prices, ITEMS).text


def test_answer_unknown_item(prices):
    q = parse_rules("price of an iphone", ITEMS, CITIES, prices["week_date"].max())
    assert "couldn't find an item" in answer(q, prices, ITEMS).text


# --- news ---

FEED = b"""<?xml version="1.0"?><rss><channel>
<item><title>Govt raises petrol price by Rs2.31 per litre</title><link>https://x.pk/1</link>
  <pubDate>Wed, 01 Oct 2026 18:00:00 +0500</pubDate><description>&lt;p&gt;OGRA notified&lt;/p&gt;</description></item>
<item><title>Global oil prices slip as demand cools</title><link>https://x.pk/2</link>
  <pubDate>Wed, 01 Oct 2026 10:00:00 +0000</pubDate></item>
<item><title>Pakistan beat Sri Lanka as fans light matches</title><link>https://x.pk/3</link></item>
<item><title>Short-term inflation rises to 11.97pc, PBS data shows</title><link>https://x.pk/4</link></item>
<item><title>Americans hit with record gasoline prices</title><link>https://x.pk/5</link></item>
<item><title>Flour prices jump by Rs20 per kg in Karachi</title><link>https://x.pk/6</link></item>
</channel></rss>"""


def test_news_parsing_and_filtering():
    entries = parse_feed(FEED, "Test")
    assert entries[0]["summary"] == "OGRA notified"
    assert entries[0]["published"] == pd.Timestamp("2026-10-01 13:00", tz="UTC")
    kept = {e["link"][-1]: classify(e, ITEMS, NEWS_CFG) for e in entries}
    assert kept["1"] == (["petrol"], ["energy"])
    assert kept["2"] is None                    # crude oil: "oil" is ignored, and it's foreign
    assert kept["3"] is None                    # cricket "matches" isn't the matchbox
    assert kept["4"][1] == ["inflation"]
    assert kept["5"] is None                    # foreign news
    assert kept["6"] == (["wheat_flour"], ["food & goods"])


# --- set-price changes and validation ---

def test_price_changes_thresholds():
    idx = pd.date_range("2026-09-24", periods=2, freq="W-THU")
    wide = pd.DataFrame({"petrol": [100, 101.5], "diesel": [100, 100.5],      # +1.5% listed, +0.5% not
                         "salt": [50, 51.5], "tea_leaves": [500, 505],          # +3% listed, +1% not
                         "sugar": [100, 120]}, index=idx)                       # market: never listed
    ch = price_changes(wide, ITEMS, idx[-1], {"fixed": 2.0, "administered": 1.0})
    assert list(ch["item_id"]) == ["salt", "petrol"]


def test_government_prices_skip_the_jump_rule():
    # gas really went Rs 295 → 1,711 in Nov 2023; the ×4 rule would have rejected it as a misread
    weeks = ["2023-11-02", "2023-11-08", "2023-11-16"]
    rows = pd.DataFrame({"week_date": weeks * 2, "item_id": ["gas"] * 3 + ["sugar"] * 3,
                         "unit": "x", "price_type": ["administered"] * 3 + ["market"] * 3,
                         "city": "National", "price": [295, 295, 1711, 100, 100, 580.0],
                         "price_min": np.nan, "price_max": np.nan, "sl_no": 0, "item_raw": "x"})
    accepted, rejected = validate(rows, ["gas", "sugar"], weeks, max_ratio=4.0)
    assert 1711 in accepted["price"].values
    # only the market item's ×5.8 jump is rejected (logged once, not again as "missing")
    assert rejected[["item_id", "price"]].values.tolist() == [["sugar", 580.0]]
    assert rejected["reason"].iloc[0].startswith("weekly change x5.80")
