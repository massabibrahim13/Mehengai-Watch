"""Smoke tests for stage 7: the weekly report and the dashboard pages run on the real database.
Skipped on a fresh clone until `python -m mehngai.pipeline` has built the database. No network:
MEHNGAI_OFFLINE stops the home page from fetching news."""
import pytest

from mehngai.config import PROJECT_ROOT
from mehngai.store.db import db_path

pytestmark = pytest.mark.skipif(not db_path().exists(), reason="database not built yet")


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setenv("MEHNGAI_OFFLINE", "1")


def test_weekly_report_for_a_known_week(tmp_path, monkeypatch):
    from mehngai.report import weekly_report
    monkeypatch.setattr(weekly_report, "REPORTS_DIR", tmp_path)
    path = weekly_report.write("2023-11-16")                 # gas tariff hike week
    text = path.read_text(encoding="utf-8")
    for section in ("## 1. Unusual price moves", "## 2. Government price changes", "## 3. Price revisions"):
        assert section in text
    assert "Gas (lowest-use households)" in text and "Rs 1,711.00" in text
    assert "| Category | Item | Price |" in text              # all-51-items table


def test_weekly_report_flags_record_flour_week(tmp_path, monkeypatch):
    from mehngai.report import weekly_report
    monkeypatch.setattr(weekly_report, "REPORTS_DIR", tmp_path)
    text = weekly_report.write("2023-03-22").read_text(encoding="utf-8")   # event E04
    assert "Wheat flour" in text and "2,586.37" in text
    assert (tmp_path / "figures" / "2023-03-22_wheat_flour.png").exists()


def test_home_page():
    AppTest = pytest.importorskip("streamlit.testing.v1").AppTest
    app = AppTest.from_file(str(PROJECT_ROOT / "src" / "mehngai" / "app" / "dashboard.py"),
                            default_timeout=120).run()
    assert not app.exception, app.exception
    assert app.title[0].value == "Mehngai Watch"
    headers = [h.value for h in app.subheader]
    assert {"Unusual price moves", "Government price changes", "Price revisions",
            "Latest price news"} <= set(headers)


def explore_sugar():
    import streamlit as st
    from mehngai.app import explore
    st.session_state["query"] = "cheeni"
    explore.render()


def ask_cheapest_flour():
    import streamlit as st
    from mehngai.app import ask_page
    st.session_state["question"] = "cheapest city for aata"
    ask_page.render()


def test_explore_page_finds_item_from_urdu_name():
    AppTest = pytest.importorskip("streamlit.testing.v1").AppTest
    app = AppTest.from_function(explore_sugar, default_timeout=120).run()
    assert not app.exception, app.exception
    assert app.header[0].value == "Sugar (refined)"


def test_ask_page_answers_from_data():
    AppTest = pytest.importorskip("streamlit.testing.v1").AppTest
    app = AppTest.from_function(ask_cheapest_flour, default_timeout=120).run()
    assert not app.exception, app.exception
    assert "cheapest in" in app.info[0].value and "Wheat flour" in app.info[0].value
