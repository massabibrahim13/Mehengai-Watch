"""Find SPI items from what a person types: "aata", "cheeni", "petrol", "tamatar", "ٹماٹر", "onoin".

Each item in config/items.yaml has a name and aliases (English, Roman Urdu, Urdu). A query is matched
against all of them, best match first:
  1.00  exact alias / name                      ("sugar", "cheeni")
  0.90  query is a whole word of an alias/name  ("basmati" → "Rice (basmati, broken)")
  0.80  alias/name starts with the query        ("tom" → "tomatoes"), at least 3 letters
  0.6+  close spelling (typo), via difflib      ("onoin" → "onion")
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

WORD = re.compile(r"[\w']+", re.UNICODE)


def normalise(text: str) -> str:
    """Lower case, strip punctuation and extra spaces (keeps Urdu letters)."""
    return " ".join(WORD.findall(str(text).lower()))


def terms(item: dict) -> list[str]:
    """Everything an item can be called: its id, name and aliases, normalised."""
    names = [item["item_id"].replace("_", " "), item["name"], *item.get("aliases", [])]
    return [normalise(n) for n in names if n]


def score(query: str, term: str) -> float:
    """How well one query matches one term (0–1)."""
    if not query or not term:
        return 0.0
    if query == term or query.rstrip("s") == term.rstrip("s"):
        return 1.0
    if query in term.split() or f" {query} " in f" {term} ":
        return 0.9
    if len(query) >= 3 and term.startswith(query):
        return 0.8
    ratio = SequenceMatcher(None, query, term).ratio()
    return ratio if ratio >= 0.75 else 0.0


def find_items(query: str, items: dict[str, dict], limit: int = 5,
               min_score: float = 0.6) -> list[tuple[str, float]]:
    """Best-matching item ids for a query, as (item_id, score), best first."""
    q = normalise(query)
    results = []
    for item_id, item in items.items():
        best = max(score(q, t) for t in terms(item))
        if best >= min_score:
            results.append((item_id, round(best, 2)))
    results.sort(key=lambda r: (-r[1], items[r[0]]["name"]))
    return results[:limit]


def same_word(a: str, b: str) -> bool:
    """'onion' == 'onions' (simple plural)."""
    return a == b or a.rstrip("s") == b.rstrip("s")


def items_in_text(text: str, items: dict[str, dict], ignore: set[str] = frozenset()) -> list[str]:
    """Item ids mentioned as whole words in a longer text (a question, a headline), in order of
    how specific the match was.

    Longer matches win where they overlap: in "gas cylinder price" the words belong to LPG
    ("gas cylinder"), not to gas; in "mustard oil" to mustard oil, not cooking oil ("oil").
    `ignore` = aliases too generic for this use (e.g. "oil" in news, which is usually crude oil).
    """
    words = normalise(text).split()
    spans = []                                              # (words, letters, start, end, item_id)
    for item_id, item in items.items():
        for t in terms(item):
            if t in ignore:
                continue
            tw = t.split()
            n = len(tw)
            for i in range(len(words) - n + 1):
                if all(same_word(w, x) for w, x in zip(words[i:i + n], tw)):
                    spans.append((n, len(t), i, i + n, item_id))
    taken: set[int] = set()
    found: list[str] = []
    for _, _, start, end, item_id in sorted(spans, key=lambda s: (-s[0], -s[1])):
        if taken.isdisjoint(range(start, end)):
            taken.update(range(start, end))
            if item_id not in found:
                found.append(item_id)
    return found
