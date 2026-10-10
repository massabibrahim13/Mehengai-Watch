"""Home-page HTML builders: outside text is escaped, only http(s) links are emitted, pieces render."""
import base64

import pandas as pd

from mehngai.app import style


def test_news_titles_are_escaped_and_bad_links_blocked():
    news = pd.DataFrame([{"title": '<script>alert(1)</script> Petrol "hike"', "link": "javascript:alert(1)",
                          "source": "X<b>", "published": "2026-10-10T10:00:00+00:00", "item_ids": "petrol",
                          "topics": "energy"}])
    html = style.news_cards(news, {"petrol": "Petrol (super)"}, lambda iso: "1 h ago")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert 'href="#"' in html and "javascript:" not in html
    assert "X&lt;b&gt;" in html
    assert 'href="/explore?q=petrol"' in html                      # item chip links into the app


def test_ticker_loops_and_links_items():
    rows = [{"item_id": "sugar", "name": "Sugar", "price": 142.99, "change_pct": -0.37},
            {"item_id": "electricity", "name": "Electricity", "price": 7.66, "change_pct": 0.0}]
    html = style.price_ticker(rows)
    assert html.count('href="/explore?q=sugar"') == 2               # track duplicated for a seamless loop
    assert "Rs 143" in html and "Rs 7.66" in html                 # rate-board rounding
    assert "▼ 0.4%" in html and "• 0.0%" in html


def test_sparkline_is_an_image_not_inline_svg():
    img = style.sparkline([100, 101, 103, 102, 110], up=True)
    assert img.startswith('<img class="mw-spark"')
    svg = base64.b64decode(img.split("base64,")[1].rstrip('">')).decode()
    assert svg.startswith("<svg") and "#e34948" in svg            # last point red for a rise


def test_empty_board_message():
    assert "No changes" in style.board([], "No changes this week.")
