"""Mehngai Watch dashboard (Streamlit). Reads only from the database.

Run:  streamlit run src/mehngai/app/dashboard.py

Streamlit re-runs this script top to bottom on every click; @st.cache_data keeps the database reads
from repeating. Sections: this week's flags → one item's price history with flags marked →
that item's flagged weeks with explanations → all items this week.
"""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from mehngai.clean.normalize import load_items
from mehngai.config import load_settings
from mehngai.detect.series import load_series
from mehngai.explain.facts import SEVERITY_WORDS, build_facts, label, unit_phrase
from mehngai.explain.guardrails import template
from mehngai.report.charts import BLUE, ORANGE
from mehngai.store.db import connect

ARROW = {"up": "▲", "down": "▼"}
SETTINGS = load_settings()
METHOD = SETTINGS["detect"]["production_method"]
TYPICAL_WEEKS = SETTINGS["explain"]["typical_move_weeks"]
ITEMS = {i["item_id"]: i for i in load_items()[1]}


@st.cache_data
def load() -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Prices (weeks × items), the production detector's flags, cached explanations."""
    with connect() as conn:
        wide, _ = load_series(conn)
        flags = pd.read_sql_query("SELECT * FROM anomalies WHERE method = ?", conn, params=(METHOD,),
                                  parse_dates=["week_date"])
        texts = {(i, pd.Timestamp(w)): t for i, w, t in conn.execute(
            "SELECT item_id, week_date, text FROM explanations WHERE method = ?", (METHOD,))}
    return wide, flags, texts


def explanation(item_id: str, week: pd.Timestamp, severity: str, wide, texts) -> str:
    """The cached LLM explanation, or the guardrail template (no LLM call from the dashboard)."""
    return texts.get((item_id, week)) or template(
        build_facts(ITEMS[item_id], week, wide[item_id], severity, TYPICAL_WEEKS))


def typical_move(prices: pd.Series) -> float:
    """Median absolute weekly % change over the year BEFORE the latest week (same as the report)."""
    return (prices.pct_change() * 100).iloc[-TYPICAL_WEEKS - 1:-1].abs().median()


def flag_label(f) -> str:
    return f"{ARROW[f.direction]} {SEVERITY_WORDS[f.severity]} {'rise' if f.direction == 'up' else 'fall'}"


def price_chart(prices: pd.Series, flags: pd.DataFrame, name: str, unit: str) -> go.Figure:
    pct = prices.pct_change() * 100
    fig = go.Figure(go.Scatter(
        x=prices.index, y=prices.values, mode="lines", name="National average price",
        line=dict(color=BLUE, width=2), customdata=pct.round(1),
        hovertemplate="%{x|%d %b %Y}<br>Rs %{y:,.2f} " + unit + "<br>%{customdata:+.1f}% vs previous<extra></extra>"))
    for direction, symbol in (("up", "triangle-up"), ("down", "triangle-down")):
        pts = flags[flags["direction"] == direction]
        fig.add_trace(go.Scatter(
            x=pts["week_date"], y=prices.loc[pts["week_date"]], mode="markers",
            name=f"Flagged {'rise' if direction == 'up' else 'fall'}",
            marker=dict(symbol=symbol, size=11, color=ORANGE, line=dict(width=1.5, color="white")),
            customdata=list(zip(pts["severity"].map(SEVERITY_WORDS), pts["change_pct"].round(1))),
            hovertemplate="%{x|%d %b %Y}<br>Rs %{y:,.2f}<br>%{customdata[1]:+.1f}% · %{customdata[0]}<extra></extra>"))
    fig.update_layout(height=380, margin=dict(l=10, r=10, t=40, b=10), hovermode="closest",
                      title=f"{name}: weekly national average price", yaxis_title="Rs",
                      legend=dict(orientation="h", y=1.02, x=1, xanchor="right", yanchor="bottom"))
    return fig


def main() -> None:
    st.set_page_config(page_title="Mehngai Watch", page_icon="📈", layout="wide")
    wide, flags, texts = load()
    latest = wide.index.max()

    st.title("Mehngai Watch")
    st.caption("Unusual weekly price moves in Pakistan's essentials · national averages from the PBS weekly "
               "Sensitive Price Indicator · data since Sep 2019")

    # ── This week ──
    this_week = flags[flags["week_date"] == latest].sort_values("score", key=abs, ascending=False)
    st.header(f"Week ending {label(latest)}: "
              + (f"{len(this_week)} unusual price move{'s' * (len(this_week) != 1)}" if len(this_week)
                 else "no unusual price moves"))
    for f in this_week.itertuples():
        item = ITEMS[f.item_id]
        with st.container(border=True):
            left, right = st.columns([1, 3])
            left.metric(item["name"], f"Rs {wide.at[latest, f.item_id]:,.2f}",
                        f"{f.change_pct:+.1f}% vs previous report", delta_color="inverse")
            right.markdown(f"**{flag_label(f)}** ({unit_phrase(item['unit'])})")
            right.write(explanation(f.item_id, latest, f.severity, wide, texts))

    # ── One item's history ──
    st.header("Price history")
    default = this_week["item_id"].iloc[0] if len(this_week) else "wheat_flour"
    c1, c2 = st.columns([2, 1])
    item_id = c1.selectbox("Item", list(ITEMS), index=list(ITEMS).index(default),
                           format_func=lambda i: ITEMS[i]["name"])
    years = c2.select_slider("Show", options=["1 year", "2 years", "3 years", "All"], value="2 years")
    start = wide.index.min() if years == "All" else latest - pd.DateOffset(years=int(years[0]))
    item = ITEMS[item_id]
    prices = wide.loc[start:, item_id]
    item_flags = flags[(flags["item_id"] == item_id) & (flags["week_date"] >= start)]
    st.plotly_chart(price_chart(prices, item_flags, item["name"], unit_phrase(item["unit"])),
                    width="stretch", theme="streamlit")

    st.caption(f"Typical weekly move for {item['name'].lower()} over the past year: "
               f"{typical_move(wide[item_id]):.1f}%. "
               "Flags mean a change far outside that range (notable / unusual / extreme).")

    # ── That item's flagged weeks ──
    st.subheader(f"Flagged weeks: {item['name']} ({len(item_flags)} in this period)")
    rows = [{"Week ending": label(f.week_date), "Flag": flag_label(f),
             "Price (Rs)": f"{wide.at[f.week_date, item_id]:,.2f}", "Change": f"{f.change_pct:+.1f}%",
             "Explanation": explanation(item_id, f.week_date, f.severity, wide, texts)}
            for f in item_flags.sort_values("week_date", ascending=False).itertuples()]
    if rows:
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch",
                     column_config={"Explanation": st.column_config.TextColumn(width="large")})
    else:
        st.write("No flagged weeks in this period.")

    # ── All items this week ──
    st.header("All tracked items this week")
    week_pct = wide.pct_change().iloc[-1] * 100
    status = {f.item_id: flag_label(f) for f in this_week.itertuples()}
    st.dataframe(pd.DataFrame([{
        "Item": ITEMS[i]["name"], "Price (Rs)": f"{wide.at[latest, i]:,.2f}", "Unit": unit_phrase(ITEMS[i]["unit"]),
        "Change": f"{week_pct[i]:+.1f}%",
        "Typical weekly move": f"{typical_move(wide[i]):.1f}%",
        "Flag": status.get(i, "–")} for i in ITEMS]), hide_index=True, width="stretch")

    with st.expander("How to read this"):
        st.markdown(
            "- **Flagged** = this week's change is far outside the item's own normal weekly movement over the "
            "past year (robust z-score: notable ≥ 3.5, unusual ≥ 5, extreme ≥ 8).\n"
            "- A **statistical** signal, not an accusation: it says a price moved unusually, not why.\n"
            "- Explanations are written by an AI model from the numbers only and checked automatically "
            "(every number must come from the data; no causes, no blame). Older weeks without a stored AI "
            "explanation show a plain template sentence.\n"
            "- Source: [Pakistan Bureau of Statistics, weekly SPI](https://www.pbs.gov.pk/price-statistics/).")


main()
