"""Explore: search for an item (any of the 51) and see its prices, cities, history and news."""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from mehngai.app import common as c
from mehngai.news import read_news
from mehngai.search import find_items
from mehngai.store.db import connect


def browse_table(wide: pd.DataFrame) -> pd.DataFrame:
    pct = (wide.iloc[-1] / wide.iloc[-2] - 1) * 100
    rows = [{"Category": it["category"], "Item": it["name"], "Price (Rs)": round(wide[i].iloc[-1], 2),
             "Unit": c.unit(i), "This week": f"{pct[i]:+.1f}%", "Type": c.GROUP_LABEL[it["price_type"]],
             "item_id": i} for i, it in c.ITEMS.items()]
    return pd.DataFrame(rows).sort_values(["Category", "Item"]).reset_index(drop=True)


def item_view(item_id: str) -> None:
    wide, _ = c.load_national()
    item = c.ITEMS[item_id]
    s = wide[item_id]
    latest = s.index.max()
    year_ago = s[s.index <= latest - pd.Timedelta(weeks=52)]

    st.header(item["name"])
    st.caption(f"{c.GROUP_LABEL[item['price_type']]} · {item['category']} · price {c.unit(item_id)} · "
               f"also called: {', '.join(item.get('aliases', [])[:6])}")
    m = st.columns(4)
    m[0].metric(f"National average, {c.week_label(latest)}", f"Rs {s.iloc[-1]:,.2f}")
    m[1].metric("vs previous report", f"{(s.iloc[-1] / s.iloc[-2] - 1) * 100:+.1f}%")
    if len(year_ago):
        m[2].metric("vs a year earlier", f"{(s.iloc[-1] / year_ago.iloc[-1] - 1) * 100:+.1f}%",
                    f"was Rs {year_ago.iloc[-1]:,.2f}", delta_color="off")
    m[3].metric("Typical weekly move", f"{c.typical_move(s):.1f}%", help="Median absolute weekly change "
                "over the past year")

    allc = c.load_all_cities()
    cities = ["National"] + sorted(allc.loc[allc["item_id"] == item_id, "city"].unique().tolist()[::1])
    cities = ["National"] + [x for x in cities if x != "National"]
    a, b = st.columns([2, 1])
    city = a.selectbox("Where", cities, key=f"city_{item_id}")
    years = b.select_slider("Show", ["1 year", "2 years", "3 years", "All"], value="2 years", key=f"yrs_{item_id}")
    start = s.index.min() if years == "All" else latest - pd.DateOffset(years=int(years[0]))
    st.plotly_chart(c.price_chart(item_id, start, city), theme="streamlit", width="stretch")

    # prices in every city this week
    now = allc[(allc["item_id"] == item_id) & (allc["week_date"] == latest) & (allc["city"] != "National")]
    if len(now):
        # dots, not bars: city prices are often close together, and bars would have to start at 0
        now = now.sort_values("price")
        pad = max((now["price"].max() - now["price"].min()) * 0.15, now["price"].mean() * 0.01)
        fig = go.Figure(go.Scatter(x=now["price"], y=now["city"], mode="markers+text",
                                   marker=dict(color=c.BLUE, size=11),
                                   text=[f"Rs {p:,.0f}" for p in now["price"]], textposition="middle right",
                                   hovertemplate="%{y}: Rs %{x:,.2f}<extra></extra>"))
        fig.add_vline(x=s.iloc[-1], line_dash="dot", line_color="gray")
        fig.update_layout(height=90 + 24 * len(now), margin=dict(l=10, r=10, t=40, b=10), showlegend=False,
                          title=f"By city, week ending {c.week_label(latest)} (dotted line = national average)",
                          xaxis=dict(range=[now["price"].min() - pad, now["price"].max() + 2.5 * pad],
                                     tickprefix="Rs ", gridcolor="rgba(128,128,128,0.2)"))
        st.plotly_chart(fig, theme="streamlit", width="stretch")
        missing = 17 - len(now)
        if missing > 0:
            st.caption(f"{missing} cities have no price this week (not sold there, or unreadable in the PBS PDF).")

    # history of flags / changes
    if item["price_type"] == "market":
        flags = c.load_flags()
        flags = flags[flags["item_id"] == item_id].sort_values("week_date", ascending=False)
        st.subheader(f"Unusual weeks ({len(flags)} since 2019)")
        if len(flags):
            st.dataframe(pd.DataFrame([{
                "Week ending": c.week_label(f.week_date), "Flag": c.flag_label(f),
                "Price (Rs)": f"{wide.at[f.week_date, item_id]:,.2f}", "Change": f"{f.change_pct:+.1f}%",
                "Explanation": c.explanation(item_id, f.week_date, f.severity)} for f in flags.head(30).itertuples()]),
                hide_index=True, width="stretch",
                column_config={"Explanation": st.column_config.TextColumn(width="large")})
    else:
        hist = c.change_history(item_id).sort_values("week_date", ascending=False)
        th = c.THRESHOLDS[item["price_type"]]
        st.subheader(f"Price changes of {th:g}% or more ({len(hist)} since 2019)")
        if len(hist):
            st.dataframe(pd.DataFrame({
                "Week ending": hist["week_date"].map(c.week_label),
                "Before (Rs)": hist["before"].map("{:,.2f}".format),
                "After (Rs)": hist["after"].map("{:,.2f}".format),
                "Change": hist["change_pct"].map("{:+.1f}%".format)}).head(40), hide_index=True, width="stretch")

    with connect() as conn:
        news = read_news(conn, item_id=item_id, limit=8)
    if len(news):
        st.subheader("Recent news mentioning this item")
        for row in news.itertuples():
            st.markdown(f"- [{row.title}]({row.link}) <span style='opacity:0.7'>· {row.source}</span>",
                        unsafe_allow_html=True)


def render() -> None:
    wide, _ = c.load_national()
    st.title("Explore prices")
    query = st.text_input("Search any of the 51 items", value=st.session_state.get("query", ""),
                          placeholder="aata, cheeni, petrol, tamatar, دودھ, bijli …")
    st.session_state["query"] = query

    item_id = None
    if query:
        matches = find_items(query, c.ITEMS, limit=6)
        if not matches:
            st.warning(f"No tracked item matches “{query}”. PBS's weekly survey covers 51 essentials; "
                       "browse them below.")
        elif len(matches) == 1 or matches[0][1] > matches[1][1]:
            item_id = matches[0][0]
            if len(matches) > 1:
                st.caption("Did you mean: " + ", ".join(c.name(i) for i, _ in matches[1:4]) + "?")
        else:
            item_id = st.radio("Several items match:", [i for i, _ in matches], format_func=c.name,
                               horizontal=True)

    with st.expander("Browse all 51 items", expanded=item_id is None):
        table = browse_table(wide)
        picked = st.dataframe(table.drop(columns="item_id"), hide_index=True, width="stretch",
                              on_select="rerun", selection_mode="single-row", key="browse")
        rows = picked.selection.rows if picked else []
        if rows:
            item_id = table.loc[rows[0], "item_id"]
        st.caption("Click a row to open the item.")

    if item_id:
        item_view(item_id)
