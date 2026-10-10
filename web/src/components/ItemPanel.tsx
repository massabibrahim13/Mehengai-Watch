// Quick view of one item, sliding in from the right. Opened from anywhere (ticker, cards, map, tags,
// search). Loads that item's history file on demand. Esc or the backdrop closes it.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { Chart, cssVar, useDarkMode, type EChartsOption } from "../lib/charts";
import { useSeries } from "../lib/data";
import { dateLabel, moneyExact, pct, timeAgo } from "../lib/format";
import type { CitiesFile, Item, NewsItem, Series } from "../types";
import { ChangePill, Price, Skeleton } from "./ui";

const GROUP = { market: "Market price", fixed: "Fixed / packaged price", administered: "Government-set price" };

function historyOption(series: Series, item: Item, dark: boolean): EChartsOption {
  const ink = cssVar("--color-ink"), muted = cssVar("--color-muted"), line = cssVar("--color-line");
  const accent = cssVar("--color-accent"), up = cssVar("--color-up"), down = cssVar("--color-down");
  const data = series.weeks.map((w, i) => [w, series.national[i]]);
  const marks = (series.flags ?? []).map((f) => ({
    value: [f.week, series.national[series.weeks.indexOf(f.week)]],
    itemStyle: { color: f.direction === "up" ? up : down },
    symbol: f.direction === "up" ? "triangle" : "path://M0,0 L10,0 L5,10 Z",
    tip: `${f.severity_word} ${f.direction === "up" ? "rise" : "fall"} · ${pct(f.change_pct)}`,
  }));
  const start = series.weeks[Math.max(0, series.weeks.length - 104)];
  return {
    grid: { left: 8, right: 8, top: 16, bottom: 56, containLabel: true },
    tooltip: {
      trigger: "axis", backgroundColor: cssVar("--color-surface"), borderColor: line, textStyle: { color: ink },
      valueFormatter: (v: number) => moneyExact(v),
    },
    xAxis: { type: "time", axisLine: { lineStyle: { color: line } }, axisLabel: { color: muted }, splitLine: { show: false } },
    yAxis: { type: "value", scale: true, axisLabel: { color: muted, formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`) }, splitLine: { lineStyle: { color: line } } },
    dataZoom: [
      { type: "inside", startValue: start },
      { type: "slider", startValue: start, height: 22, bottom: 8, borderColor: line, fillerColor: dark ? "rgba(57,135,229,0.15)" : "rgba(42,120,214,0.12)", handleStyle: { color: accent }, textStyle: { color: muted }, dataBackground: { lineStyle: { color: muted }, areaStyle: { color: "transparent" } } },
    ],
    series: [
      { type: "line", name: item.name, data, showSymbol: false, step: item.price_type === "market" ? false : "end",
        lineStyle: { color: accent, width: 2 }, areaStyle: { color: dark ? "rgba(57,135,229,0.08)" : "rgba(42,120,214,0.07)" } },
      { type: "scatter", name: "Unusual weeks", data: marks, symbolSize: 11, z: 3,
        tooltip: { trigger: "item", formatter: (p: { data: { value: [string, number]; tip: string } }) => `${dateLabel(p.data.value[0])}<br/>${p.data.tip}` } },
    ],
  };
}

export function ItemPanel({ itemId, items, cities, news, onClose, onOpen }: {
  itemId: string | null; items: Item[]; cities: CitiesFile; news: NewsItem[]; onClose: () => void; onOpen: (id: string) => void;
}) {
  const item = items.find((i) => i.item_id === itemId) ?? null;
  const series = useSeries(itemId);
  const dark = useDarkMode();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!itemId) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemId, onClose]);

  const option = useMemo(() => (series && item ? historyOption(series, item, dark) : null), [series, item, dark]);
  const cityRows = item ? Object.entries(cities.prices[item.item_id] ?? {}).filter(([, p]) => p != null).sort((a, b) => a[1]! - b[1]!) : [];
  const related = item ? news.filter((n) => n.item_ids.includes(item.item_id)).slice(0, 4) : [];
  const history = series?.flags ? [...series.flags].reverse().slice(0, 5) : [];
  const changes = series?.changes ? [...series.changes].reverse().slice(0, 6) : [];

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div key="backdrop" className="fixed inset-0 z-40 bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside key="panel" role="dialog" aria-modal="true" aria-label={item.name}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-line bg-paper shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-paper/95 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{item.category} · {GROUP[item.price_type]}</p>
                <h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight">{item.name}</h2>
              </div>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
                className="bubble rounded-full border border-line px-3 py-1.5 text-sm hover:border-accent">Close ✕</button>
            </div>

            <div className="space-y-8 px-6 py-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="col-span-2">
                  <p className="text-sm text-muted">National average, {dateLabel(cities.week)}</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <Price value={item.price} className="text-4xl" />
                    <ChangePill value={item.change_pct} />
                  </p>
                  <p className="text-sm text-muted">{item.unit}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">vs a year ago</p>
                  <p className="mt-1 font-mono text-2xl tabular">{item.yoy_pct === null ? "–" : pct(item.yoy_pct)}</p>
                  {item.year_ago_price && <p className="text-xs text-muted">was {moneyExact(item.year_ago_price)}</p>}
                </div>
                <div>
                  <p className="text-sm text-muted">Typical weekly move</p>
                  <p className="mt-1 font-mono text-2xl tabular">{item.typical_move_pct ?? "–"}%</p>
                  <p className="text-xs text-muted">over the past year</p>
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-3">
                {option ? <Chart option={option} className="h-72 w-full" /> : <Skeleton className="h-72" />}
                <p className="px-2 pb-1 text-xs text-muted">
                  Weekly national average since {series ? dateLabel(series.weeks[0]) : "…"}. Drag the bar to zoom.
                  {item.price_type === "market" && " Triangles mark unusual weeks."}
                </p>
              </div>

              {cityRows.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-muted">This week by city</h3>
                  <div className="flex flex-wrap gap-2">
                    {cityRows.map(([city, price], i) => (
                      <span key={city} className={`rounded-full border px-3 py-1 text-sm ${i === 0 ? "border-down/40 bg-down/10" : i === cityRows.length - 1 ? "border-up/40 bg-up/10" : "border-line"}`}>
                        {city} <span className="font-mono tabular">{moneyExact(price!)}</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">Cheapest first. Blue = cheapest city, red = dearest.</p>
                </div>
              )}

              {history.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-muted">Recent unusual weeks ({series?.flags?.length} since 2019)</h3>
                  <ol className="space-y-3">
                    {history.map((f) => (
                      <li key={f.week} className="rounded-2xl border border-line bg-surface p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{dateLabel(f.week)}</span>
                          <ChangePill value={f.change_pct} />
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-ink/85">{f.explanation}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {changes.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-muted">Recent price changes ({series?.changes?.length} since 2019)</h3>
                  <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                    {changes.map((c) => (
                      <li key={c.week} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span>{dateLabel(c.week)}</span>
                        <span className="font-mono tabular"><span className="text-muted">{moneyExact(c.before)} → </span>{moneyExact(c.after)}</span>
                        <ChangePill value={c.change_pct} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {related.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-muted">In the news</h3>
                  <ul className="space-y-2">
                    {related.map((n) => (
                      <li key={n.link}>
                        <a href={n.link} target="_blank" rel="noopener noreferrer" className="group block rounded-xl p-2 hover:bg-ink/5">
                          <span className="font-serif group-hover:text-accent">{n.title}</span>
                          <span className="block text-xs text-muted">{n.source} · {timeAgo(n.published)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-line pt-6">
                <span className="text-sm text-muted">Also in {item.category}:</span>
                {items.filter((i) => i.category === item.category && i.item_id !== item.item_id).map((i) => (
                  <button key={i.item_id} type="button" onClick={() => onOpen(i.item_id)}
                    className="bubble rounded-full border border-line px-3 py-0.5 text-sm hover:border-accent hover:text-accent">{i.name}</button>
                ))}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
