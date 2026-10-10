"""Home: this week at a glance + live price news.

Layout: price ticker → title → search → summary tiles → live headline strip → biggest movers →
[unusual moves | government changes + price revisions] → headlines grid → how to read.
The two news parts are fragments that re-run on their own every 30 minutes.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st

from mehngai.app import common as c
from mehngai.app import style
from mehngai.news import read_news, refresh_if_stale
from mehngai.store.db import connect


def latest_news(limit: int = 40) -> pd.DataFrame:
    """Stored headlines, refreshed first if they're older than 30 minutes (never fails the page)."""
    with connect() as conn:
        try:
            refresh_if_stale(conn)
        except Exception:                       # offline etc.: show what we have
            pass
        return read_news(conn, limit=limit)


@st.fragment(run_every="30m")
def headline_strip() -> None:
    st.html(style.news_ticker(latest_news(14)))


@st.fragment(run_every="30m")
def headlines_section() -> None:
    st.html('<div class="mw-label">Headlines</div>')
    st.subheader("Latest price news")
    news = latest_news()
    topic = st.segmented_control("Topic", ["All", "Food & goods", "Energy", "Inflation"], default="All",
                                 label_visibility="collapsed", key="news_topic")
    if topic and topic != "All":
        news = news[news["topics"].str.contains(topic.lower())]
    if news.empty:
        st.write("No price-related headlines in the last few weeks.")
        return
    st.html(style.news_cards(news.head(8), {i: c.name(i) for i in c.ITEMS}, c.time_ago))
    st.caption("From Dawn, Business Recorder, Express Tribune, ProPakistani, ARY News and APP, matched to tracked "
               "items by keywords. Shown as possibly related news, not as causes. Tags open the item's page.")


def render() -> None:
    wide, basket = c.load_national()
    latest, prev = wide.index.max(), wide.index[-2]
    flags = c.load_flags()
    this_week = flags[flags["week_date"] == latest].sort_values("score", key=abs, ascending=False)
    gov = c.changes_for(latest, "administered")
    revisions = c.changes_for(latest, "fixed")
    pct = (wide.iloc[-1] / wide.iloc[-2] - 1) * 100

    ticker = [{"item_id": i, "name": c.name(i), "price": wide[i].iloc[-1], "change_pct": pct[i]}
              for i in pct.abs().sort_values(ascending=False).index]
    st.html(style.price_ticker(ticker))

    st.title("Mehngai Watch")
    st.html(f'<div class="mw-kicker">Week ending {c.week_label(latest)} · compared with {c.week_label(prev)} · '
            f'51 essentials · PBS weekly price survey</div>'
            '<div class="mw-sub">Which prices moved unusually this week, and what the news is saying.</div>')

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

    headline_strip()

    # ── biggest movers ──
    movers = pd.DataFrame({"item_id": pct.index, "change_pct": pct.values, "price": wide.iloc[-1].values})
    movers["label"] = movers["item_id"].map(c.name)
    rises = movers[movers["change_pct"] >= 0.05].nlargest(6, "change_pct")      # ignore moves that round to 0
    falls = movers[movers["change_pct"] <= -0.05].nsmallest(6, "change_pct")
    with st.container(border=True, key="mw-movers"):
        left, right = st.columns(2)
        if len(rises):
            left.plotly_chart(c.move_bars(rises, "Biggest rises this week"), theme="streamlit", width="stretch")
        if len(falls):
            right.plotly_chart(c.move_bars(falls, "Biggest falls this week"), theme="streamlit", width="stretch")
        st.caption("Plain % moves across all 51 items. Vegetables top this list most weeks because they always "
                   "swing; **unusual** (below) means unusual *for that item*.")

    main, side = st.columns([3, 2], gap="large")
    with main:
        st.html('<div class="mw-label">This week</div>')
        st.subheader("Unusual price moves")
        if this_week.empty:
            st.write("Every market-priced item moved within its normal weekly range.")
        else:
            cards = [style.move_card(f.item_id, c.name(f.item_id), wide.at[latest, f.item_id], c.unit(f.item_id),
                                     f.change_pct, c.flag_label(f).split(" ", 1)[1],
                                     c.explanation(f.item_id, latest, f.severity),
                                     wide[f.item_id].iloc[-26:].tolist())
                     for f in this_week.itertuples()]
            st.html(f'<div class="mw-grid" style="--mw-min:300px">{"".join(cards)}</div>')
    with side:
        st.html('<div class="mw-label">Set prices</div>')
        st.subheader("Government price changes")
        st.html(style.board([{"item_id": g.item_id, "name": c.name(g.item_id), "unit": c.unit(g.item_id),
                              "before": g.previous_price, "after": g.price, "change_pct": g.change_pct}
                             for g in gov.itertuples()],
                            "No government-set price changed by 1% or more this week."))
        st.caption("Set by the government or regulators (OGRA, NEPRA): policy decisions, not market anomalies.")
        st.subheader("Price revisions")
        st.html(style.board([{"item_id": r.item_id, "name": c.name(r.item_id), "unit": c.unit(r.item_id),
                              "before": r.previous_price, "after": r.price, "change_pct": r.change_pct}
                             for r in revisions.itertuples()],
                            "No packaged or fixed-price item changed by 2% or more this week."))
        st.caption("Packaged, branded and hotel prices stay flat for months, then change in one step.")

    headlines_section()

    with st.expander("How to read this"):
        st.markdown(
            "- **Unusual** = this week's change is far outside the item's own normal weekly movement over the "
            "past year (robust z-score: notable ≥ 3.5, unusual ≥ 5, extreme ≥ 8). A 10% week is ordinary for "
            "tomatoes but extreme for sugar.\n"
            "- A **statistical** signal, not an accusation: it says a price moved unusually, not why.\n"
            "- Explanations are written by an AI model from the numbers only and checked automatically.\n"
            "- Prices are PBS national averages across 17 cities. Source: "
            "[Pakistan Bureau of Statistics](https://www.pbs.gov.pk/price-statistics/).")
