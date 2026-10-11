// Item search in the browser — the same scoring as src/mehngai/search.py:
//   1.00 exact name/alias · 0.90 query is a whole word of it · 0.80 it starts with the query
//   0.75+ close spelling (typo).  Works for English, Roman Urdu and Urdu ("aata", "cheeni", "ٹماٹر").
import type { Item } from "../types";

const WORD = /[\p{L}\p{N}']+/gu;
export const normalise = (text: string): string => (text.toLowerCase().match(WORD) ?? []).join(" ");

const terms = (item: Item): string[] =>
  [item.item_id.replace(/_/g, " "), item.name, ...item.aliases].map(normalise).filter(Boolean);

/** Similarity 0–1 from edit distance (like Python's difflib ratio, close enough for typos). */
function similarity(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length, 1);
}

function score(query: string, term: string): number {
  if (query === term || query.replace(/s$/, "") === term.replace(/s$/, "")) return 1;
  if (` ${term} `.includes(` ${query} `)) return 0.9;
  if (query.length >= 3 && term.startsWith(query)) return 0.8;
  const s = similarity(query, term);
  return s >= 0.75 ? s : 0;
}

export function findItems(query: string, items: Item[], limit = 8): Item[] {
  const q = normalise(query);
  if (!q) return [];
  return items
    .map((item) => ({ item, s: Math.max(...terms(item).map((t) => score(q, t))) }))
    .filter((r) => r.s >= 0.6)
    .sort((a, b) => b.s - a.s || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((r) => r.item);
}

/** For a live search box: the scored matches above, or — for short queries like "su" — items with a word
 *  that starts with what was typed. */
export function liveMatches(query: string, items: Item[], limit = 8): Item[] {
  const found = findItems(query, items, limit);
  const q = normalise(query);
  if (found.length || !q) return found;
  // rank: the item's own name starts with it, then a word of its name, then a word of an alias
  const rank = (item: Item) => {
    const name = normalise(item.name);
    if (name.startsWith(q)) return 0;
    if (name.split(" ").some((w) => w.startsWith(q))) return 1;
    return terms(item).some((t) => t.split(" ").some((w) => w.startsWith(q))) ? 2 : 3;
  };
  return items
    .map((item) => ({ item, r: rank(item) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((x) => x.item);
}
