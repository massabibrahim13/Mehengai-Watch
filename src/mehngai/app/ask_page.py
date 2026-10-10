"""Ask: plain questions about prices, answered from PBS data (the AI only helps read the question)."""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from mehngai.app import common as c
from mehngai.ask import answer, understand
from mehngai.explain.facts import label

EXAMPLES = ["Price of onions in Lahore in March 2024", "Cheapest city for sugar",
            "How much has petrol gone up since last year?", "aata ki qeemat Karachi",
            "Which city has the most expensive tomatoes?", "Eggs and milk prices"]
COLORS = [c.BLUE, c.ORANGE, "#1baf7a"]          # validated categorical slots 1, 2, 3


def render() -> None:
    allc = c.load_all_cities()
    cities = sorted(allc["city"].unique())
    latest = allc["week_date"].max()

    st.title("Ask about a price")
    st.caption("Ask in English, Roman Urdu or Urdu. Answers come straight from PBS weekly data "
               "(51 items, 17 cities, since Sep 2019).")
    cols = st.columns(3)
    for i, ex in enumerate(EXAMPLES):
        if cols[i % 3].button(ex, key=f"ex{i}", width="stretch"):
            st.session_state["question"] = ex
    question = st.text_input("Your question", key="question", placeholder="e.g. price of chicken in Quetta")
    use_ai = st.toggle("Let AI help understand unusual questions", value=True,
                       help="Only used if the simple rules can't find an item. The AI only reads the "
                            "question; every number in the answer comes from the PBS data.")
    if not question:
        return

    q = understand(question, c.ITEMS, cities, latest, c.SETTINGS["explain"] if use_ai else None)
    a = answer(q, allc, c.ITEMS)
    if q.item_ids:
        when = f"week of {label(q.week)}" if q.week is not None else "latest week"
        since = f", since {label(q.since)}" if q.since is not None else ""
        st.caption(f"Understood as: {', '.join(c.name(i) for i in q.item_ids)} · "
                   f"{'national average' if q.city == 'National' else q.city} · {when}{since} · "
                   f"{q.intent} · read by {'AI' if q.via == 'ai' else 'rules'}")
    st.info(a.text) if q.item_ids else st.warning(a.text)
    if a.table is not None:
        st.dataframe(a.table, hide_index=True, width="stretch",
                     column_config={"Price (Rs)": st.column_config.NumberColumn(format="%,.2f")})
    if a.series:
        fig = go.Figure()
        for (name, s), color in zip(a.series.items(), COLORS):
            s = s[s.index >= latest - pd.DateOffset(years=2)] if q.week is None and q.since is None else s
            fig.add_trace(go.Scatter(x=s.index, y=s.values, mode="lines", name=name,
                                     line=dict(color=color, width=2),
                                     hovertemplate="%{x|%d %b %Y}<br>Rs %{y:,.2f}<extra>" + name + "</extra>"))
        for when in (q.week, q.since):
            if when is not None:
                fig.add_vline(x=when, line_dash="dot")
        fig.update_layout(height=340, margin=dict(l=10, r=10, t=20, b=10), yaxis_title="Rs",
                          legend=dict(orientation="h", y=1.05))
        st.plotly_chart(fig, theme="streamlit", width="stretch")
