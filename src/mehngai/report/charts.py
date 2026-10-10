"""Chart style shared by the weekly report (matplotlib) and the dashboard (plotly).

One accent colour for prices (blue), one for flagged weeks (orange): a validated, colour-blind-safe
pair. Direction is also shown by marker shape (▲/▼), so colour never carries meaning alone.
"""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")                      # render to files; no window needed
import matplotlib.dates as mdates          # noqa: E402
import matplotlib.pyplot as plt            # noqa: E402
from matplotlib.lines import Line2D        # noqa: E402
import pandas as pd                        # noqa: E402

BLUE, ORANGE = "#2a78d6", "#eb6834"
INK, INK_2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"

STYLE = {
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": GRID, "axes.labelcolor": INK_2, "xtick.color": INK_2, "ytick.color": INK_2,
    "text.color": INK, "axes.grid": True, "axes.axisbelow": True, "grid.color": GRID,
    "grid.linewidth": 0.8, "axes.spines.top": False, "axes.spines.right": False, "font.size": 9,
    "axes.titlesize": 10, "axes.titleweight": "bold", "axes.titlelocation": "left",
}


def flag_chart(prices: pd.Series, flags: pd.DataFrame, week: pd.Timestamp, title: str,
               path: Path, weeks: int = 78) -> Path:
    """Last `weeks` weeks of one item's price, flagged weeks marked, this week emphasised."""
    window = prices[prices.index > week - pd.Timedelta(weeks=weeks)]
    window = window[window.index <= week]
    past = flags[(flags["week_date"].isin(window.index)) & (flags["week_date"] < week)]
    with plt.rc_context(STYLE):
        fig, ax = plt.subplots(figsize=(7, 2.6))
        ax.plot(window.index, window.values, color=BLUE, lw=1.8, zorder=2, label="National average price")
        for direction, marker in (("up", "^"), ("down", "v")):
            pts = past[past["direction"] == direction]
            ax.scatter(pts["week_date"], window.loc[pts["week_date"]], marker=marker, s=40,
                       color=ORANGE, alpha=0.55, edgecolor="none", zorder=3)
        ax.scatter([week], [window.loc[week]], s=110, color=ORANGE, edgecolor=SURFACE,
                   linewidth=2, zorder=4, label="This week (flagged)")
        ax.annotate(f"Rs {window.loc[week]:,.0f}", (week, window.loc[week]), xytext=(-8, 8),
                    textcoords="offset points", ha="right", color=INK, fontsize=9, fontweight="bold")
        ax.set_title(title)
        ax.set_ylabel("Rs")
        ax.xaxis.set_major_locator(mdates.MonthLocator(bymonth=(1, 4, 7, 10)))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
        handles, _ = ax.get_legend_handles_labels()
        handles.insert(1, Line2D([], [], marker="^", ls="", ms=6, color=ORANGE, alpha=0.55,
                                 label="Earlier flagged weeks (▲ up, ▼ down)"))
        ax.legend(handles=handles, loc="upper left", frameon=False, fontsize=8)
        fig.tight_layout()
        path.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(path, dpi=120)
        plt.close(fig)
    return path
