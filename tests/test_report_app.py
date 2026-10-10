"""Smoke tests for stage 7: the weekly report and the dashboard run on the real database.
Skipped on a fresh clone until `python -m mehngai.pipeline` has built the database."""
import pytest

from mehngai.config import PROJECT_ROOT
from mehngai.store.db import db_path

pytestmark = pytest.mark.skipif(not db_path().exists(), reason="database not built yet")


def test_weekly_report_for_a_known_week(tmp_path, monkeypatch):
    from mehngai.report import weekly_report
    monkeypatch.setattr(weekly_report, "REPORTS_DIR", tmp_path)
    path = weekly_report.write("2023-03-22")                 # the record flour jump (event E04)
    text = path.read_text(encoding="utf-8")
    assert "## This week:" in text and "Wheat flour" in text
    assert "2,586.37" in text                                 # the flour price that week
    assert (tmp_path / "figures" / "2023-03-22_wheat_flour.png").exists()
    assert "| Item | Price |" in text                          # all-items table


def test_dashboard_runs_without_errors():
    from streamlit.testing.v1 import AppTest
    app = AppTest.from_file(str(PROJECT_ROOT / "src" / "mehngai" / "app" / "dashboard.py"),
                            default_timeout=60).run()
    assert not app.exception, app.exception
    assert app.title[0].value == "Mehngai Watch"
    app.selectbox[0].select("sugar").run()                   # switch item → page re-renders
    assert not app.exception, app.exception
    assert "Sugar" in app.subheader[0].value
