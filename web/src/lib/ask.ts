// The chat's plain question answering, in the browser — a port of src/mehngai/ask.py:
//   1. Understand the question → {items, city, week, since, intent}. Rules first (free, instant). If the AI is
//      asked (via our Cloudflare Worker) to read it, its answer is checked against the known items and cities.
//   2. Answer from the exported data (items.json, cities.json, series/<id>.json) with a fixed sentence.
// Questions that want an explanation go to the price agent instead (wantsAgent, below; ChatBubble.tsx). This
// plain answer is its fallback.
import { dateLabel, moneyExact } from "./format";
import { normalise, terms } from "./search";
import type { Item, Series } from "../types";

export type Intent = "price" | "change" | "cheapest" | "priciest" | "cities";
export interface Question {
  text: string;
  itemIds: string[];
  city: string;          // "National" = the national average
  week: string | null;   // ISO date asked about; null = latest report
  since: string | null;  // start date, for intent "change"
  intent: Intent;
  via: "rules" | "ai";
}
export interface Answer {
  text: string;                                        // **bold** marks emphasis (rendered as <strong>, never as HTML)
  table?: { item: string; rows: { city: string; price: number }[] };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const CITY_ALIASES: Record<string, string> = {
  pindi: "Rawalpindi", isb: "Islamabad", khi: "Karachi", lhr: "Lahore", fsd: "Faisalabad", pesh: "Peshawar", hyd: "Hyderabad",
  "لاہور": "Lahore", "کراچی": "Karachi", "اسلام آباد": "Islamabad", "راولپنڈی": "Rawalpindi", "پشاور": "Peshawar", "کوئٹہ": "Quetta",
  "ملتان": "Multan", "فیصل آباد": "Faisalabad", "حیدرآباد": "Hyderabad", "سکھر": "Sukkur", "گوجرانوالہ": "Gujranwala",
  "سیالکوٹ": "Sialkot", "سرگودھا": "Sargodha", "بہاولپور": "Bahawalpur", "لاڑکانہ": "Larkana", "بنوں": "Bannu", "خضدار": "Khuzdar",
};
// \b doesn't work next to Urdu letters, so these patterns use the same "word edges" as the Python version where it matters
const CHEAPEST = /\b(cheapest|lowest|least expensive|sasta|sasti)\b|سستا/i;
const PRICIEST = /\b(most expensive|highest|costliest|dearest|mehnga|mehngi)\b|مہنگا/i;
const ALL_CITIES = /\b(all cities|every city|which cities|compare cities|city wise|citywise)\b/i;
const CHANGE = /\b(change[sd]?|increase[sd]?|rise[ns]?|risen|rose|gone up|went up|go up|fall(en)?|fell|drop(ped)?|decrease[sd]?|since|trend|over the (past|last))\b/i;
// Questions that want an explanation, not just a figure: the price agent answers these (when it is available).
const EXPLAIN = /\b(why|how come|explain|normal|usual|unusual|worr(y|ied)|should|expect(ed)?|reason|happen(ed|ing)?|going on|kyun|kyon|kyu)\b|کیوں/i;
const LONG_QUESTION = 12; // words: longer questions usually want more than one figure

// ── dates as ISO strings (no time zones involved) ──
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const addWeeks = (isoDate: string, weeks: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};
const days = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

const sameWord = (a: string, b: string) => a === b || a.replace(/s+$/, "") === b.replace(/s+$/, "");

/** Item ids mentioned as whole words; longer matches win where they overlap ("gas cylinder" = LPG, not gas). */
export function itemsInText(text: string, items: Item[]): string[] {
  const words = normalise(text).split(" ").filter(Boolean);
  const spans: [number, number, number, number, string][] = [];
  for (const item of items) {
    for (const t of terms(item)) {
      const tw = t.split(" ");
      for (let i = 0; i + tw.length <= words.length; i++) {
        if (tw.every((x, j) => sameWord(words[i + j], x))) spans.push([tw.length, t.length, i, i + tw.length, item.item_id]);
      }
    }
  }
  spans.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const taken = new Set<number>(), found: string[] = [];
  for (const [, , start, end, id] of spans) {
    const range = Array.from({ length: end - start }, (_, k) => start + k);
    if (range.every((k) => !taken.has(k))) {
      range.forEach((k) => taken.add(k));
      if (!found.includes(id)) found.push(id);
    }
  }
  return found;
}

export function findCity(text: string, cities: string[]): string | null {
  const padded = ` ${normalise(text)} `;
  for (const city of [...cities].sort((a, b) => b.length - a.length)) {
    if (city !== "National" && padded.includes(` ${normalise(city)} `)) return city;
  }
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (padded.includes(` ${normalise(alias)} `)) return city;
  }
  return null;
}

/** Dates mentioned, in order: 2024-06-06, 6/6/2024, "14 March 2024", "March 2024", "in 2023", "last year"… */
export function findDates(text: string, latest: string): string[] {
  const t = text.toLowerCase();
  const found: [number, string][] = [];
  const near = (pos: number, within: number) => found.some(([p]) => Math.abs(p - pos) < within);
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) found.push([m.index!, iso(+m[1], +m[2], +m[3])]);
  for (const m of t.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g)) found.push([m.index!, iso(+m[3], +m[2], +m[1])]);
  for (const m of t.matchAll(/\b(?:(\d{1,2})\s+)?([a-z]{3,9})\.?,?\s+(?:(\d{1,2}),?\s+)?(\d{4})\b/g)) {
    const month = MONTHS[m[2].slice(0, 3)];
    if (month && !near(m.index!, 3)) {
      const day = +(m[1] ?? m[3] ?? 0);
      found.push([m.index!, day ? iso(+m[4], month, day) : iso(+m[4], month + 1, 0)]);
    }
  }
  for (const m of t.matchAll(/\b(?:in|since|from|of|during)\s+(20\d{2})\b/g)) {
    if (!near(m.index!, 12)) found.push([m.index!, /^(since|from)/.test(m[0]) ? iso(+m[1], 1, 1) : iso(+m[1], 12, 31)]);
  }
  const relative: [RegExp, number][] = [
    [/\blast week\b/g, 1], [/\blast month\b|\ba month ago\b/g, 4],
    [/\blast year\b|\ba year ago\b|\bone year ago\b|\b1 year ago\b/g, 52], [/\b(?:6|six) months ago\b/g, 26],
  ];
  for (const [pattern, weeks] of relative) for (const m of t.matchAll(pattern)) found.push([m.index!, addWeeks(latest, -weeks)]);
  return found.sort((a, b) => a[0] - b[0]).map(([, d]) => d);
}

export function parseRules(text: string, items: Item[], cities: string[], latest: string): Question {
  const q: Question = { text, itemIds: itemsInText(text, items).slice(0, 3), city: findCity(text, cities) ?? "National",
    week: null, since: null, intent: "price", via: "rules" };
  const dates = findDates(text, latest);
  if (CHEAPEST.test(text)) q.intent = "cheapest";
  else if (PRICIEST.test(text)) q.intent = "priciest";
  else if (ALL_CITIES.test(text)) q.intent = "cities";
  else if (CHANGE.test(text)) q.intent = "change";
  if (q.intent === "change") {
    q.since = dates[0] ?? addWeeks(latest, -52);
    q.week = dates[1] ?? null;
  } else if (dates.length) q.week = dates[0];
  return q;
}

/** Should the price agent answer this, rather than the rules? Yes if the rules found no item, if it asks why or
 *  whether something is normal, or if it is long. Short lookups ("price of sugar in Lahore") stay instant and free. */
export function wantsAgent(q: Question): boolean {
  return !q.itemIds.length || EXPLAIN.test(q.text) || q.text.trim().split(/\s+/).length >= LONG_QUESTION;
}

/** Check the AI's reading of a question: only known items/cities/intents, real dates. Returns null if unusable. */
export function validateAI(data: unknown, text: string, items: Item[], cities: string[], latest: string): Question | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const ids = new Set(items.map((i) => i.item_id));
  const okDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  const intents: Intent[] = ["price", "change", "cheapest", "priciest", "cities"];
  const q: Question = {
    text, via: "ai",
    itemIds: (Array.isArray(d.item_ids) ? d.item_ids : []).filter((x): x is string => typeof x === "string" && ids.has(x)).slice(0, 3),
    city: typeof d.city === "string" && cities.includes(d.city) ? d.city : "National",
    week: okDate(d.week), since: okDate(d.since),
    intent: intents.includes(d.intent as Intent) ? (d.intent as Intent) : "price",
  };
  if (q.intent === "change" && !q.since) q.since = addWeeks(latest, -52);
  return q;
}

// ── step 2: answering from the exported data ──

interface Point { week: string; price: number }
const seriesFor = (s: Series, city: string): Point[] =>
  s.weeks.map((week, i) => ({ week, price: (city === "National" ? s.national[i] : s.cities[city]?.[i]) ?? NaN }))
    .filter((p) => Number.isFinite(p.price));

/** The last report on or before `when` (the first report if `when` is earlier). */
const nearest = (pts: Point[], when: string | null): Point => {
  if (!when) return pts[pts.length - 1];
  const before = pts.filter((p) => p.week <= when);
  return before.length ? before[before.length - 1] : pts[0];
};
/** Same week a year earlier, or nothing (the site's rule: never borrow a neighbouring week). */
const yearAgo = (pts: Point[], week: string): Point | undefined => {
  const target = addWeeks(week, -52);
  return pts.find((p) => Math.abs(days(p.week, target)) <= 3);
};
const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`; // same as Python's f"{x:+.1f}%"

export const NO_ITEM =
  "I couldn't find an item PBS tracks in that question. Mehngai Watch covers the 51 essentials in PBS's weekly price " +
  "survey (e.g. wheat flour, sugar, petrol, tomatoes), in 17 cities, weekly since Sep 2019. Try: “price of sugar in " +
  "Lahore” or “cheapest city for aata”.";

export async function answer(q: Question, items: Item[], loadSeries: (id: string) => Promise<Series>): Promise<Answer> {
  if (!q.itemIds.length) return { text: NO_ITEM };
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const lines: string[] = [];
  let table: Answer["table"];
  for (const id of q.itemIds) {
    const item = byId[id], s = await loadSeries(id);
    const place = q.city === "National" ? "national average" : q.city;
    const pts = seriesFor(s, q.city);
    if (!pts.length) {
      lines.push(`PBS doesn't report ${item.name.toLowerCase()} for ${q.city}.`);
      continue;
    }
    const now = nearest(pts, q.week);
    const note = q.week && q.week < pts[0].week ? " (our data starts in Sep 2019, so this is the earliest week)" : "";

    if (q.intent === "cheapest" || q.intent === "priciest" || q.intent === "cities") {
      const i = s.weeks.indexOf(now.week);
      const rows = Object.entries(s.cities).map(([city, v]) => ({ city, price: v[i] ?? NaN }))
        .filter((r) => Number.isFinite(r.price)).sort((a, b) => a.price - b.price);
      if (!rows.length) continue;
      const lo = rows[0], hi = rows[rows.length - 1], nat = s.national[i];
      lines.push(`**${item.name}**, week ending ${dateLabel(now.week)}: cheapest in **${lo.city}** (${moneyExact(lo.price)} ${item.unit}), ` +
        `most expensive in **${hi.city}** (${moneyExact(hi.price)})${nat != null ? `; national average ${moneyExact(nat)}` : ""}.${note}`);
      table ??= { item: item.name, rows };
    } else if (q.intent === "change") {
      const then = nearest(pts, q.since);
      lines.push(`**${item.name}** (${place}): ${moneyExact(then.price)} ${item.unit} in the week ending ${dateLabel(then.week)} → ` +
        `${moneyExact(now.price)} in the week ending ${dateLabel(now.week)}, a change of **${pct((now.price / then.price - 1) * 100)}**.${note}`);
    } else {
      const k = pts.findIndex((p) => p.week === now.week);
      const parts = [`**${item.name}** (${place}), week ending ${dateLabel(now.week)}: **${moneyExact(now.price)} ${item.unit}**${note}.`];
      if (k > 0) parts.push(`${pct((now.price / pts[k - 1].price - 1) * 100)} vs the previous report`);
      const ya = yearAgo(pts, now.week);
      if (ya) parts.push(`${pct((now.price / ya.price - 1) * 100)} vs a year earlier (${moneyExact(ya.price)})`);
      lines.push(parts[0] + (parts.length > 1 ? ` ${parts.slice(1).join("; ")}.` : ""));
    }
  }
  return { text: lines.join("\n\n") || NO_ITEM, table };
}
