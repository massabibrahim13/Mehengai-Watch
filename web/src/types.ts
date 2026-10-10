// Shapes of the JSON files written by `python -m mehngai.export` (src/mehngai/export.py).
// Keep the two in sync: the website computes nothing, it only shows these values.

export type PriceType = "market" | "fixed" | "administered";
export type Severity = "watch" | "unusual" | "extreme";
export type Direction = "up" | "down";

export interface Item {
  item_id: string;
  name: string;
  unit: string; // "per kg", "per 20 kg bag" …
  category: string;
  price_type: PriceType;
  aliases: string[];
  price: number;
  previous_price: number;
  change_pct: number;
  year_ago_price: number | null;
  yoy_pct: number | null;
  typical_move_pct: number | null;
  spark: (number | null)[]; // last 26 weekly national prices
  flag: Severity | null; // this week's flag, market items only
  flags_since_start: number;
}

export interface UnusualMove {
  item_id: string;
  severity: Severity;
  severity_word: string; // notable / unusual / extreme
  direction: Direction;
  change_pct: number;
  price: number;
  previous_price: number;
  typical_move_pct: number | null;
  explanation: string;
  explanation_source: "llm" | "template";
}

export interface PriceChange {
  item_id: string;
  previous_price: number;
  price: number;
  change_pct: number;
}

export interface Mover {
  item_id: string;
  change_pct: number;
  price: number;
}

export interface Summary {
  generated_at: string;
  week: string;
  week_label: string;
  previous_week: string;
  previous_label: string;
  data_start: string;
  weeks_of_data: number;
  basket_change_pct: number;
  counts: { up: number; down: number; unchanged: number };
  thresholds: { fixed: number; administered: number };
  unusual: UnusualMove[];
  government: PriceChange[];
  revisions: PriceChange[];
  movers: { rises: Mover[]; falls: Mover[] };
}

export interface City {
  name: string;
  province: string;
  lat: number;
  lon: number;
}

export interface CitiesFile {
  week: string;
  cities: City[];
  prices: Record<string, Record<string, number | null>>; // item_id → city → price
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string; // ISO time (UTC)
  item_ids: string[];
  topics: string[]; // inflation, energy, food & goods
}

export interface SeriesFlag {
  week: string;
  severity: Severity;
  severity_word: string;
  direction: Direction;
  change_pct: number;
  explanation: string;
  explanation_source: "llm" | "template";
}

export interface SeriesChange {
  week: string;
  before: number;
  after: number;
  change_pct: number;
}

export interface Series {
  item_id: string;
  weeks: string[];
  national: (number | null)[];
  cities: Record<string, (number | null)[]>;
  flags?: SeriesFlag[];
  changes?: SeriesChange[];
}

/** "Essentials index": weekly typical change of all 51 items, chained from 100 (our calculation). */
export interface IndexFile {
  weeks: string[];
  values: number[];
  base_week: string;
  latest: number;
  change_1w_pct: number;
  change_1y_pct: number | null;
  change_all_pct: number;
}

export interface HomeData {
  summary: Summary;
  items: Item[];
  cities: CitiesFile;
  news: NewsItem[];
  index: IndexFile;
}
