"""Shared data loading and display helpers for the dashboard pages. Reads only from the database.

@st.cache_data keeps database reads from repeating on every click; ttl=10 min means a new weekly
report (written by the pipeline) shows up without restarting the app.
"""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from mehngai.clean.normalize import load_items
from mehngai.config import load_settings
from mehngai.detect.changes import price_changes
from mehngai.detect.series import load_series
from mehngai.explain.facts import SEVERITY_WORDS, build_facts, label, unit_phrase
from mehngai.explain.guardrails import template
from mehngai.report.charts import BLUE, ORANGE
from mehngai.store.db import connect

SETTINGS = load_settings()
METHOD = SETTINGS["detect"]["production_method"]
TYPICAL_WEEKS = SETTINGS["explain"]["typical_move_weeks"]
THRESHOLDS = SETTINGS["detect"]["price_changes"]
ITEMS = {i["item_id"]: i for i in load_items()[1]}
ARROW = {"up": "▲", "down": "▼"}
RISE, FALL = "#e34948", BLUE            # diverging pair for price up / down (validated palette)
GROUP_LABEL = {"market": "Market price", "fixed": "Fixed / packaged price",
               "administered": "Government-set price"}


@st.cache_data(ttl=600)
def load_national() -> tuple[pd.DataFrame, pd.Series]:
    """National prices of all 51 items (weeks × items) and the basket change per week."""
    with connect() as conn:
        return load_series(conn)


@st.cache_data(ttl=600)
def load_flags() -> pd.DataFrame:
    with connect() as conn:
        return pd.read_sql_query("SELECT * FROM anomalies WHERE method = ?", conn, params=(METHOD,),
                                 parse_dates=["week_date"])


@st.cache_data(ttl=600)
def load_texts() -> dict:
    with connect() as conn:
        return {(i, pd.Timestamp(w)): t for i, w, t in conn.execute(
            "SELECT item_id, week_date, text FROM explanations WHERE method = ?", (METHOD,))}


@st.cache_data(ttl=600)
def load_all_cities() -> pd.DataFrame:
    """Long table of every price: week_date, item_id, city, price (~320k rows)."""
    with connect() as conn:
        return pd.read_sql_query("SELECT week_date, item_id, city, price FROM prices", conn,
                                 parse_dates=["week_date"])


def name(item_id: str) -> str:
    return ITEMS[item_id]["name"]


def unit(item_id: str) -> str:
    return unit_phrase(ITEMS[item_id]["unit"])


def typical_move(prices: pd.Series) -> float:
    """Median absolute weekly % change over the year BEFORE the latest week (same as the report)."""
    return (prices.pct_change() * 100).iloc[-TYPICAL_WEEKS - 1:-1].abs().median()


def flag_label(f) -> str:
    return f"{ARROW[f.direction]} {SEVERITY_WORDS[f.severity]} {'rise' if f.direction == 'up' else 'fall'}"


def explanation(item_id: str, week: pd.Timestamp, severity: str) -> str:
    """The cached LLM explanation, or the guardrail template (the dashboard never calls the LLM)."""
    wide, _ = load_national()
    return load_texts().get((item_id, week)) or template(
        build_facts(ITEMS[item_id], week, wide[item_id], severity, TYPICAL_WEEKS))


def changes_for(week: pd.Timestamp, price_type: str) -> pd.DataFrame:
    wide, _ = load_national()
    ch = price_changes(wide, ITEMS, week, THRESHOLDS)
    return ch[ch["price_type"] == price_type]


def change_history(item_id: str) -> pd.DataFrame:
    """Every week a fixed/administered item's price moved ≥ its threshold: week, before, after, %."""
    wide, _ = load_national()
    s = wide[item_id]
    pct = s.pct_change() * 100
    th = THRESHOLDS.get(ITEMS[item_id]["price_type"], 0)
    hits = pct[pct.abs() >= th].dropna()
    return pd.DataFrame({"week_date": hits.index, "before": s.shift(1).loc[hits.index].values,
                         "after": s.loc[hits.index].values, "change_pct": hits.values})


def price_chart(item_id: str, start: pd.Timestamp, city: str = "National") -> go.Figure:
    """Price history; market items get their flagged weeks (▲▼), set-price items their changes."""
    wide, _ = load_national()
    if city == "National":
        prices = wide.loc[start:, item_id]
    else:
        allc = load_all_cities()
        prices = allc[(allc["item_id"] == item_id) & (allc["city"] == city)].set_index("week_date")["price"]
        prices = prices.sort_index().loc[start:]
    pct = prices.pct_change() * 100
    fig = go.Figure(go.Scatter(
        x=prices.index, y=prices.values, mode="lines", name="Price" if city == "National" else f"Price, {city}",
        line=dict(color=BLUE, width=2, shape="hv" if ITEMS[item_id]["price_type"] != "market" else "linear"),
        customdata=pct.round(1),
        hovertemplate="%{x|%d %b %Y}<br>Rs %{y:,.2f} " + unit(item_id) + "<br>%{customdata:+.1f}% vs previous<extra></extra>"))
    if city == "National" and ITEMS[item_id]["price_type"] == "market":
        flags = load_flags()
        flags = flags[(flags["item_id"] == item_id) & (flags["week_date"] >= start)]
        for direction, symbol in (("up", "triangle-up"), ("down", "triangle-down")):
            pts = flags[flags["direction"] == direction]
            fig.add_trace(go.Scatter(
                x=pts["week_date"], y=prices.reindex(pts["week_date"]).values, mode="markers",
                name=f"Unusual {'rise' if direction == 'up' else 'fall'}",
                marker=dict(symbol=symbol, size=11, color=ORANGE, line=dict(width=1.5, color="white")),
                customdata=list(zip(pts["severity"].map(SEVERITY_WORDS), pts["change_pct"].round(1))),
                hovertemplate="%{x|%d %b %Y}<br>Rs %{y:,.2f}<br>%{customdata[1]:+.1f}% · %{customdata[0]}<extra></extra>"))
    fig.update_layout(height=360, margin=dict(l=10, r=10, t=30, b=10), hovermode="closest",
                      yaxis_title="Rs", legend=dict(orientation="h", y=1.02, x=1, xanchor="right",
                                                     yanchor="bottom"))
    return fig


def move_bars(df: pd.DataFrame, title: str) -> go.Figure:
    """Horizontal bars of the size of each % move (falls drawn left-to-right too, so labels never
    collide); rises red, falls blue, and the signed % with ▲/▼ as text so colour isn't needed."""
    df = df.iloc[::-1]
    colors = [RISE if v > 0 else FALL for v in df["change_pct"]]
    text = [f"{'▲' if v > 0 else '▼'} {v:+.1f}%" for v in df["change_pct"]]
    fig = go.Figure(go.Bar(x=df["change_pct"].abs(), y=df["label"], orientation="h", marker_color=colors,
                           text=text, textposition="outside", cliponaxis=False,
                           customdata=list(zip(df["change_pct"], df["price"])),
                           hovertemplate="%{y}<br>%{customdata[0]:+.1f}% · Rs %{customdata[1]:,.2f}<extra></extra>"))
    fig.update_layout(height=60 + 34 * len(df), margin=dict(l=10, r=70, t=36, b=10), title=title,
                      xaxis=dict(ticksuffix="%", rangemode="tozero"), showlegend=False, bargap=0.35)
    return fig


def week_label(week: pd.Timestamp) -> str:
    return label(week)
