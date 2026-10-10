import { useEffect, useState } from "react";
import type { CitiesFile, HomeData, IndexFile, Item, NewsItem, Series, Summary } from "../types";

// All data comes from the JSON files the Python pipeline exports into public/data/.
const BASE = import.meta.env.BASE_URL;

export async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/** Everything the home page needs, loaded in parallel (~70 KB). */
export function useHomeData(): { data: HomeData | null; error: string | null } {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      getJSON<Summary>("data/summary.json"),
      getJSON<Item[]>("data/items.json"),
      getJSON<CitiesFile>("data/cities.json"),
      getJSON<NewsItem[]>("data/news.json"),
      getJSON<IndexFile>("data/index.json"),
    ])
      .then(([summary, items, cities, news, index]) => setData({ summary, items, cities, news, index }))
      .catch((e: Error) => setError(e.message));
  }, []);
  return { data, error };
}

/** One item's full history, fetched only when that item is opened. Cached per session.
 *  `failed` is true if the file couldn't be loaded (so the page can say so instead of loading forever). */
const seriesCache = new Map<string, Series>();

export function useSeries(itemId: string | null): { series: Series | null; failed: boolean } {
  const [series, setSeries] = useState<Series | null>(itemId ? seriesCache.get(itemId) ?? null : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!itemId) return setSeries(null);
    const cached = seriesCache.get(itemId);
    if (cached) return setSeries(cached);
    setSeries(null);
    let alive = true;
    getJSON<Series>(`data/series/${itemId}.json`)
      .then((s) => {
        seriesCache.set(itemId, s);
        if (alive) setSeries(s);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [itemId]);
  return { series, failed };
}

/** Pakistan outline for the map (Natural Earth, public domain). Without it the city list still works. */
export function useGeo(): object | null {
  const [geo, setGeo] = useState<object | null>(null);
  useEffect(() => {
    getJSON<object>("geo/pakistan.json")
      .then(setGeo)
      .catch((e: Error) => console.warn(`Map outline not loaded (${e.message}); showing the city list only.`));
  }, []);
  return geo;
}
