"""Home: this week at a glance + live price news."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd
import streamlit as st

from mehngai.app import common as c
from mehngai.news import read_news, refresh_if_stale
from mehngai.store.db import connect


def time_ago(iso: str) -> str:
    delta = datetime.now(timezone.utc) - datetime.fromisoformat(iso)
    hours = delta.total_seconds() / 3600
    if hours < 1:
        return f"{int(delta.total_seconds() // 60)} min ago"
    if hours < 48:
        return f"{int(hours)} h ago"
    return f"{int(hours // 24)} days ago"


@st.fragment(run_every="30m")
def news_feed() -> None:
    """Re-runs on its own every 30 minutes; goes online only if stored headlines are stale."""
    with connect() as conn:
        try:
            refresh_if_stale(conn)
        except Exception as exc:                        # offline etc.: show what we have
            st.caption(f"Couldn't refresh news right now ({type(exc).__name__}); showing saved headlines.")
        news = read_news(conn, limit=40)
    topic = st.segmented_control("Topic", ["All", "Food & goods", "Energy", "Inflation"], default="All",
                                 label_visibility="collapsed", key="news_topic")
    if topic and topic != "All":
        news = news[news["topics"].str.contains(topic.lower())]
    if news.empty:
        st.write("No price-related headlines in the last few weeks.")
        return
    for row in news.head(12).itertuples():
        tags = " · ".join(c.name(i) for i in row.item_ids.split(",") if i in c.ITEMS)
        st.markdown(f"**[{row.title}]({row.link})**  \n"
                    f"<span style='opacity:0.7'>{row.source} · {time_ago(row.published)}"
                    f"{' · ' + tags if tags else ''}</span>", unsafe_allow_html=True)
    st.caption("Headlines from Dawn, Business Recorder, Express Tribune, ProPakistani, ARY News and APP, "
               "matched to tracked items by keywords. Shown as possibly related news, not as causes.")


def render() -> None:
    wide, basket = c.load_national()
    latest = wide.index.max()
    prev = wide.index[-2]
    flags = c.load_flags()
    this_week = flags[flags["week_date"] == latest].sort_values("score", key=abs, ascending=False)
    gov = c.changes_for(latest, "administered")
    revisions = c.changes_for(latest, "fixed")
    pct = (wide.iloc[-1] / wide.iloc[-2] - 1) * 100

    st.title("Mehngai Watch")
    st.caption(f"Pakistan's essential prices, week ending **{c.week_label(latest)}** "
               f"(compared with {c.week_label(prev)}) · 51 items · PBS weekly Sensitive Price Indicator")

    with st.form("search", border=False):
        q_col, b_col = st.columns([5, 1])
        query = q_col.text_input("Search", placeholder="Search an item: aata, cheeni, petrol, ٹماٹر …",
                                 label_visibility="collapsed")
        if b_col.form_submit_button("Search", width="stretch") and query:
            st.session_state["query"] = query
            st.switch_page(st.session_state["pages"]["explore"])

    m = st.columns(4)
    m[0].metric("Unusual price moves", len(this_week), border=True, help="Market-priced items whose weekly "
                "change is far outside their own normal range")
    m[1].metric("Government price changes", len(gov), border=True,
                help="Petrol, diesel, LPG, electricity, gas, phone (moves of 1% or more)")
    m[2].metric("Price revisions", len(revisions), border=True,
                help="Packaged / fixed-price goods whose price moved 2% or more")
    m[3].metric("All 51 items, this week", f"{(np.exp(basket.iloc[-1]) - 1) * 100:+.2f}%",
                f"{(pct > 0).sum()} up · {(pct < 0).sum()} down · {(pct == 0).sum()} unchanged",
                delta_color="off", border=True, help="Typical (trimmed-mean) weekly change across all 51 items")

    # ── biggest movers ──
    movers = pd.DataFrame({"item_id": pct.index, "change_pct": pct.values, "price": wide.iloc[-1].values})
    movers["label"] = movers["item_id"].map(c.name)
    rises = movers[movers["change_pct"] >= 0.05].nlargest(6, "change_pct")      # ignore moves that round to 0
    falls = movers[movers["change_pct"] <= -0.05].nsmallest(6, "change_pct")
    with st.container(border=True):
        left, right = st.columns(2)
        if len(rises):
            left.plotly_chart(c.move_bars(rises, "Biggest rises this week"), theme="streamlit", width="stretch")
        if len(falls):
            right.plotly_chart(c.move_bars(falls, "Biggest falls this week"), theme="streamlit", width="stretch")
        st.caption("Plain % moves across all 51 items. Vegetables top this list most weeks because they always "
                   "swing; **unusual** (below) means unusual *for that item*.")

    main, side = st.columns([3, 2], gap="large")
    with main:
        st.subheader("Unusual price moves")
        if this_week.empty:
            st.write("Every market-priced item moved within its normal weekly range.")
        for f in this_week.itertuples():
            with st.container(border=True):
                a, b = st.columns([2, 5])
                a.metric(c.name(f.item_id), f"Rs {wide.at[latest, f.item_id]:,.2f}",
                         f"{f.change_pct:+.1f}% vs previous report", delta_color="inverse")
                b.markdown(f":{'red' if f.direction == 'up' else 'blue'}-badge[{c.flag_label(f)}] "
                           f"<span style='opacity:0.7'>{c.unit(f.item_id)}</span>", unsafe_allow_html=True)
                b.write(c.explanation(f.item_id, latest, f.severity))

        st.subheader("Government price changes")
        with st.container(border=True):
            if gov.empty:
                st.write("No government-set price changed by 1% or more this week.")
            for g in gov.itertuples():
                st.markdown(f"{'▲' if g.change_pct > 0 else '▼'} **{c.name(g.item_id)}**: "
                            f"Rs {g.previous_price:,.2f} → **Rs {g.price:,.2f}** {c.unit(g.item_id)} "
                            f"({g.change_pct:+.1f}%)")
            st.caption("Set by the government or regulators (OGRA, NEPRA): policy decisions, not market "
                       "anomalies.")

        st.subheader("Price revisions")
        with st.container(border=True):
            if revisions.empty:
                st.write("No packaged or fixed-price item changed by 2% or more this week.")
            for r in revisions.itertuples():
                st.markdown(f"{'▲' if r.change_pct > 0 else '▼'} **{c.name(r.item_id)}**: "
                            f"Rs {r.previous_price:,.2f} → **Rs {r.price:,.2f}** {c.unit(r.item_id)} "
                            f"({r.change_pct:+.1f}%)")
            st.caption("Packaged, branded and hotel prices stay flat for months, then change in one step.")

    with side:
        st.subheader("Latest price news")
        with st.container(border=True, height=720):
            news_feed()

    with st.expander("How to read this"):
        st.markdown(
            "- **Unusual** = this week's change is far outside the item's own normal weekly movement over the "
            "past year (robust z-score: notable ≥ 3.5, unusual ≥ 5, extreme ≥ 8). A 10% week is ordinary for "
            "tomatoes but extreme for sugar.\n"
            "- A **statistical** signal, not an accusation: it says a price moved unusually, not why.\n"
            "- Explanations are written by an AI model from the numbers only and checked automatically.\n"
            "- Prices are PBS national averages across 17 cities. Source: "
            "[Pakistan Bureau of Statistics](https://www.pbs.gov.pk/price-statistics/).")
