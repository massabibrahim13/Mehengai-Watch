"""Mehngai Watch dashboard (Streamlit). Reads only from the database.

Run:  streamlit run src/mehngai/app/dashboard.py

Streamlit re-runs a page top to bottom on every click; @st.cache_data (in common.py) keeps the
database reads from repeating. Three pages:
  Home     this week at a glance: unusual moves, government price changes, price revisions,
           biggest movers, and live price news (auto-refreshes every 30 minutes)
  Explore  search any of the 51 items: prices, cities, history, flags/changes, news
  Ask      plain questions ("cheapest city for sugar") answered from PBS data
"""
import streamlit as st

from mehngai.app import ask_page, explore, home, style

st.set_page_config(page_title="Mehngai Watch", page_icon="📈", layout="wide")
st.html(style.CSS)                         # one stylesheet for every page

pages = {
    "home": st.Page(home.render, title="Home", icon="🏠", default=True),
    "explore": st.Page(explore.render, title="Explore prices", icon="🔎", url_path="explore"),
    "ask": st.Page(ask_page.render, title="Ask", icon="💬", url_path="ask"),
}
st.session_state["pages"] = pages
st.navigation(list(pages.values()), position="top").run()
