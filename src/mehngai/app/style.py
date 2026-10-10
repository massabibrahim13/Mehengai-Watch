"""Look and feel: one stylesheet + small HTML builders (price ticker, headline strip, cards, bubbles).

Design: a market rate-board / newspaper feel. Serif headlines (Fraunces), tabular monospace prices
(IBM Plex Mono), the project palette (blue accent, red = price up, blue = price down), pill "bubbles" that
light up with a soft ring on hover. Motion is limited to two slow tickers (pause on hover) and a short
fade-in; all of it stops under the OS "reduce motion" setting. Neutrals are semi-transparent so the
same CSS works in light and dark mode.

All text that comes from data or news feeds is HTML-escaped here, and only http(s) links are emitted.
"""
from __future__ import annotations

import base64
import html
from urllib.parse import quote

import pandas as pd

FONTS = ("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650"
         "&family=IBM+Plex+Mono:wght@400;500;600&display=swap")

CSS = """
<style>
@import url('%(fonts)s');
:root { --mw-blue:#2a78d6; --mw-red:#e34948; --mw-line:rgba(128,128,128,.24); --mw-soft:rgba(128,128,128,.06);
        --mw-ring:rgba(42,120,214,.16); --mw-mono:'IBM Plex Mono',ui-monospace,monospace;
        --mw-serif:'Fraunces',Georgia,serif; }

/* tighter top: the ticker sits right under the nav */
[data-testid="stMainBlockContainer"] { padding-top: 3.2rem; }

/* headings: newspaper serif */
.stApp h1, .stApp h2, .stApp h3 { font-family: var(--mw-serif) !important; letter-spacing:-.01em; }
.stApp h1 { font-weight:650 !important; }

/* numbers read like a rate board */
[data-testid="stMetricValue"] { font-family: var(--mw-mono); font-weight:500; letter-spacing:-.02em; }

/* bubbles: buttons, inputs, segmented controls */
.stButton button, .stFormSubmitButton button { border-radius:999px !important;
  transition: transform .15s ease, box-shadow .2s ease, border-color .2s ease; }
.stButton button:hover, .stFormSubmitButton button:hover { transform: translateY(-1px);
  box-shadow: 0 0 0 5px var(--mw-ring); border-color: var(--mw-blue) !important; color: var(--mw-blue) !important; }
.stButton button:active, .stFormSubmitButton button:active { transform: scale(.97); }
[data-testid="stTextInputRootElement"] { border-radius:999px !important; transition: box-shadow .2s ease; }
[data-testid="stTextInputRootElement"]:focus-within { box-shadow: 0 0 0 5px var(--mw-ring); }
[data-testid="stMetric"] { transition: transform .2s ease, box-shadow .2s ease; }
[data-testid="stMetric"]:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.06), 0 0 0 4px var(--mw-ring); }

/* tickers */
.mw-ticker { position:relative; overflow:hidden; border-block:1px solid var(--mw-line); margin: 0 0 .4rem;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 3%%, #000 97%%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 3%%, #000 97%%, transparent); }
.mw-track { display:inline-flex; gap:2.2rem; white-space:nowrap; padding:.5rem 0; will-change:transform;
  animation: mw-scroll var(--mw-speed, 120s) linear infinite; }
.mw-ticker:hover .mw-track { animation-play-state: paused; }
@keyframes mw-scroll { from { transform: translateX(0) } to { transform: translateX(-50%%) } }
.mw-tick { font-family: var(--mw-mono); font-size:.82rem; text-decoration:none !important; color:inherit !important;
  padding:.1rem .55rem; border-radius:999px; transition: background .2s ease, box-shadow .2s ease; }
.mw-tick:hover { background: var(--mw-soft); box-shadow: 0 0 0 3px var(--mw-ring); }
.mw-tick b { font-weight:500; font-family: 'Source Sans', system-ui, sans-serif; margin-right:.35rem; }
.mw-up { color: var(--mw-red); } .mw-down { color: var(--mw-blue); } .mw-flat { opacity:.55; }
.mw-newsbar { display:flex; align-items:stretch; gap:.8rem; }
.mw-newsbar .mw-ticker { flex:1; margin:0; }
.mw-newsbar .mw-headline { font-family: var(--mw-serif); font-size:.95rem; text-decoration:none !important;
  color:inherit !important; border-bottom:1px solid transparent; transition: border-color .2s ease; }
.mw-newsbar .mw-headline:hover { border-color: var(--mw-blue); }
.mw-sep { opacity:.35; }

/* live badge */
.mw-live { display:inline-flex; align-items:center; gap:.45rem; font-size:.72rem; font-weight:600;
  letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; padding:.35rem .7rem; border-radius:999px;
  border:1px solid var(--mw-line); align-self:center; }
.mw-live::before { content:""; width:8px; height:8px; border-radius:50%%; background:#0ca30c;
  box-shadow:0 0 0 0 rgba(12,163,12,.55); animation: mw-pulse 2.2s ease-out infinite; }
@keyframes mw-pulse { 70%% { box-shadow:0 0 0 7px rgba(12,163,12,0) } 100%% { box-shadow:0 0 0 0 rgba(12,163,12,0) } }

/* hero */
.mw-kicker { font-size:.78rem; letter-spacing:.06em; text-transform:uppercase; opacity:.7; margin:-.6rem 0 .2rem; }
.mw-sub { font-family: var(--mw-serif); font-size:1.15rem; opacity:.85; margin:.1rem 0 .9rem; }

/* section kicker above headings */
.mw-label { font-size:.72rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; opacity:.6;
  margin-bottom:-.6rem; }

/* cards + bubbles */
.mw-grid { display:grid; gap:.9rem; grid-template-columns: repeat(auto-fill, minmax(var(--mw-min, 260px), 1fr)); }
.mw-card { border:1px solid var(--mw-line); border-radius:16px; padding:.95rem 1.05rem; background: var(--mw-soft);
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; animation: mw-in .45s ease both; }
.mw-card:hover { transform: translateY(-2px); border-color: rgba(42,120,214,.55);
  box-shadow: 0 10px 24px rgba(0,0,0,.07), 0 0 0 4px var(--mw-ring); }
.mw-card:nth-child(2) { animation-delay:.06s } .mw-card:nth-child(3) { animation-delay:.12s }
.mw-card:nth-child(4) { animation-delay:.18s } .mw-card:nth-child(n+5) { animation-delay:.24s }
@keyframes mw-in { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform:none } }
.mw-card-top { display:flex; justify-content:space-between; align-items:center; gap:.6rem; margin-bottom:.35rem; }
.mw-item { font-weight:600; text-decoration:none !important; color:inherit !important; }
.mw-item:hover { color: var(--mw-blue) !important; }
.mw-price { font-family: var(--mw-mono); font-size:1.55rem; font-weight:500; letter-spacing:-.02em; }
.mw-unit { font-family: 'Source Sans', system-ui, sans-serif; font-size:.85rem; opacity:.65; margin-left:.25rem; }
.mw-expl { font-size:.92rem; line-height:1.45; margin:.5rem 0 0; opacity:.92; }
.mw-spark { display:block; width:100%%; height:40px; margin:.45rem 0 .15rem; }
.mw-spark-label { font-size:.7rem; opacity:.55; }
.mw-cur { font-family:'Source Sans', system-ui, sans-serif; font-size:.6em; font-weight:600; opacity:.6; margin-right:.2rem; letter-spacing:0; }
.mw-pill, .mw-chip { display:inline-flex; align-items:center; gap:.3rem; border-radius:999px; white-space:nowrap;
  font-size:.75rem; padding:.12rem .6rem; border:1px solid var(--mw-line); text-decoration:none !important;
  color:inherit !important; transition: background .2s ease, box-shadow .2s ease, border-color .2s ease; }
.mw-pill.mw-up { background: rgba(227,73,72,.12); border-color: rgba(227,73,72,.35); color: var(--mw-red) !important; font-weight:600; }
.mw-pill.mw-down { background: rgba(42,120,214,.12); border-color: rgba(42,120,214,.35); color: var(--mw-blue) !important; font-weight:600; }
a.mw-chip:hover { border-color: var(--mw-blue); background: rgba(42,120,214,.10); box-shadow: 0 0 0 3px var(--mw-ring); }
.mw-chips { display:flex; flex-wrap:wrap; gap:.35rem; margin-top:.6rem; }
.mw-meta { font-size:.76rem; opacity:.65; display:flex; gap:.45rem; align-items:center; flex-wrap:wrap; }
.mw-news-title { font-family: var(--mw-serif); font-size:1.02rem; line-height:1.35; font-weight:500; margin:.45rem 0 0;
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.mw-news-title a { text-decoration:none !important; color:inherit !important; }
.mw-card:hover .mw-news-title a { color: var(--mw-blue) !important; }

/* board rows (government changes / revisions) */
.mw-board { border:1px solid var(--mw-line); border-radius:16px; overflow:hidden; }
.mw-row { display:grid; grid-template-columns: 1fr auto auto; gap:.8rem; align-items:center; padding:.65rem 1rem;
  border-bottom:1px solid var(--mw-line); transition: background .2s ease; }
.mw-row:last-child { border-bottom:none; }
.mw-row:hover { background: var(--mw-soft); }
.mw-unit-line { margin-left:0; }
.mw-row .mw-from { font-family: var(--mw-mono); font-size:.85rem; opacity:.6; }
.mw-row .mw-to { font-family: var(--mw-mono); font-size:.95rem; font-weight:500; }
.mw-empty { padding:.9rem 1rem; opacity:.7; font-size:.92rem; }

/* keyed Streamlit containers */
.st-key-mw-movers { border-radius:16px; }

@media (prefers-reduced-motion: reduce) {
  .mw-track, .mw-card, .mw-live::before { animation: none !important; }
  .mw-card, .mw-tick, .mw-pill, .mw-chip, .mw-row, .stButton button, [data-testid="stMetric"] { transition: none !important; }
}
</style>
""" % {"fonts": FONTS}


def esc(text) -> str:
    return html.escape(str(text), quote=True)


def safe_url(url: str) -> str:
    return esc(url) if str(url).startswith(("https://", "http://")) else "#"


def item_link(item_id: str) -> str:
    """In-app link to an item's page (Explore reads ?q=)."""
    return f"/explore?q={quote(item_id)}"


def money(x: float) -> str:
    """Rate-board style: Rs 2,851 for big prices, Rs 7.66 for small ones."""
    return f"Rs {x:,.0f}" if x >= 100 else f"Rs {x:,.2f}"


def direction_class(change: float) -> tuple[str, str]:
    if change >= 0.05:
        return "mw-up", "▲"
    if change <= -0.05:
        return "mw-down", "▼"
    return "mw-flat", "•"


def price_ticker(rows: list[dict], speed_s: int = 140) -> str:
    """All items scrolling: name, price, ▲/▼ %. rows: item_id, name, price, change_pct."""
    cells = []
    for r in rows:
        cls, arrow = direction_class(r["change_pct"])
        cells.append(f'<a class="mw-tick" href="{item_link(r["item_id"])}" target="_self">'
                     f'<b>{esc(r["name"])}</b>{money(r["price"])} '
                     f'<span class="{cls}">{arrow} {abs(r["change_pct"]):.1f}%</span></a>')
    track = "".join(cells)
    return (f'<div class="mw-ticker" style="--mw-speed:{speed_s}s" aria-label="This week\'s prices">'
            f'<div class="mw-track">{track}{track}</div></div>')


def news_ticker(news: pd.DataFrame, speed_s: int = 90) -> str:
    """Headlines scrolling next to a pulsing LIVE badge; each opens the article in a new tab."""
    if news.empty:
        return ""
    parts = [f'<a class="mw-headline" href="{safe_url(r.link)}" target="_blank" rel="noopener">{esc(r.title)}</a>'
             f'<span class="mw-sep">{esc(r.source)}</span>' for r in news.itertuples()]
    track = '<span class="mw-sep">•</span>'.join(parts) + '<span class="mw-sep">•</span>'
    return (f'<div class="mw-newsbar"><span class="mw-live">Live</span>'
            f'<div class="mw-ticker" style="--mw-speed:{speed_s}s"><div class="mw-track">{track}{track}</div>'
            f'</div></div>')


def sparkline(values: list[float], up: bool) -> str:
    """Tiny trend line of recent weekly prices, last point marked. Built as an SVG image (data URI)
    because Streamlit's HTML sanitiser strips inline <svg>."""
    if len(values) < 2:
        return ""
    lo, hi = min(values), max(values)
    span = (hi - lo) or 1
    w, h = 300, 40
    pts = [(4 + i * (w - 8) / (len(values) - 1), h - 5 - (v - lo) / span * (h - 10)) for i, v in enumerate(values)]
    path = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    x, y = pts[-1]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">'
           f'<polyline points="{path}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round"/>'
           f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{"#e34948" if up else "#2a78d6"}"/></svg>')
    data = base64.b64encode(svg.encode()).decode()
    return f'<img class="mw-spark" alt="26-week price trend" src="data:image/svg+xml;base64,{data}">'


def move_card(item_id: str, name: str, price: float, unit: str, change_pct: float, label: str,
              explanation: str, history: list[float]) -> str:
    cls, arrow = direction_class(change_pct)
    return (f'<div class="mw-card"><div class="mw-card-top">'
            f'<a class="mw-item" href="{item_link(item_id)}" target="_self">{esc(name)}</a>'
            f'<span class="mw-pill {cls}">{arrow} {esc(label)}</span></div>'
            f'<div><span class="mw-price"><span class="mw-cur">Rs</span>{price:,.2f}</span>'
            f'<span class="mw-unit">{esc(unit)}</span> <span class="mw-pill {cls}">{change_pct:+.1f}%</span></div>'
            f'{sparkline(history, change_pct > 0)}<div class="mw-spark-label">last 26 weeks</div>'
            f'<p class="mw-expl">{esc(explanation)}</p></div>')


def board(rows: list[dict], empty: str) -> str:
    """Rows: item_id, name, unit, before, after, change_pct."""
    if not rows:
        return f'<div class="mw-board"><div class="mw-empty">{esc(empty)}</div></div>'
    out = []
    for r in rows:
        cls, arrow = direction_class(r["change_pct"])
        out.append(f'<div class="mw-row"><div><a class="mw-item" href="{item_link(r["item_id"])}" '
                   f'target="_self">{esc(r["name"])}</a><div class="mw-unit mw-unit-line">{esc(r["unit"])}</div></div>'
                   f'<div><span class="mw-from">Rs {r["before"]:,.2f} →</span> '
                   f'<span class="mw-to">Rs {r["after"]:,.2f}</span></div>'
                   f'<span class="mw-pill {cls}">{arrow} {r["change_pct"]:+.1f}%</span></div>')
    return f'<div class="mw-board">{"".join(out)}</div>'


def news_cards(news: pd.DataFrame, names: dict[str, str], time_ago) -> str:
    """Headline bubbles: source, time, serif title, clickable item chips."""
    cards = []
    for r in news.itertuples():
        chips = "".join(f'<a class="mw-chip" href="{item_link(i)}" target="_self">{esc(names[i])}</a>'
                        for i in r.item_ids.split(",") if i in names)
        if not chips and "inflation" in r.topics:
            chips = '<span class="mw-chip">Inflation</span>'
        cards.append(f'<div class="mw-card"><div class="mw-meta"><span class="mw-chip">{esc(r.source)}</span>'
                     f'<span>{esc(time_ago(r.published))}</span></div>'
                     f'<div class="mw-news-title"><a href="{safe_url(r.link)}" target="_blank" rel="noopener">'
                     f'{esc(r.title)}</a></div><div class="mw-chips">{chips}</div></div>')
    return f'<div class="mw-grid" style="--mw-min:280px">{"".join(cards)}</div>'
