"""Publish the price agent for the website: every answer its tools can give, computed here, as JSON files.

The live agent runs in our Cloudflare Worker (worker/src/agent.ts), which has no Python and no database. So,
at every export, this writes what it needs next to the site's other data files (web/public/data/agent/):

  setup.json          the brief (system prompt), the tool declarations and the guardrail settings
  this_week.json      this_week()
  news.json           price_news() for all items
  items/<id>.json     item_overview() for the national average and each city, price_history() for each period,
                      compare_cities() and price_news() for that item

The Worker only looks answers up, so its numbers are exactly the ones the Python tools give, and an experiment in
LangSmith (which runs the Python agent) tests the same brief, tools and rules as the live chat.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from mehngai.agent import tools
from mehngai.agent.agent import brief, guard_context, settings

log = logging.getLogger(__name__)


def write(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def item_file(item_id: str) -> dict:
    d = tools.data()
    return {
        "overview": {place: tools.item_overview(item_id, place) for place in [tools.NATIONAL, *d.cities]},
        "history": {period: tools.price_history(item_id, period) for period in tools.PERIODS},
        "cities": tools.compare_cities(item_id),
        "news": tools.price_news(item_id),
    }


def write_files(out_dir: Path) -> int:
    """Write every agent file under out_dir/agent/. Returns the total size in bytes."""
    cfg, d = settings(), tools.data()
    root = out_dir / "agent"
    size = write(root / "setup.json", {
        "latest_week": tools.label(d.latest), "brief": brief(cfg), "tools": tools.declarations(),
        "max_steps": cfg["max_steps"], "max_words": cfg["max_words"], "temperature": cfg["temperature"],
        "banned_phrases": cfg["banned_phrases"], "guard_context": guard_context(),
    })
    size += write(root / "this_week.json", tools.this_week())
    size += write(root / "news.json", tools.price_news())
    for item_id in d.items:
        size += write(root / "items" / f"{item_id}.json", item_file(item_id))
    log.info("agent files: %d items, %d KB", len(d.items), size // 1024)
    return size
