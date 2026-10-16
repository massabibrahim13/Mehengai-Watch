// "Where it costs more": the 17 survey cities as bubbles on a map of Pakistan, for one item.
// Bubble size = price there; colour = % above/below the national average (green cheaper, grey ≈ average,
// red dearer — the validated diverging pair with a neutral midpoint). Hovering a city on the map or in
// the ranked list highlights it in both.
import { useMemo, useRef, useState } from "react";
import { Chart, cssVar, MONO, SANS, useDarkMode, type ECharts, type EChartsOption } from "../lib/charts";
import { moneyExact, pct, shortName } from "../lib/format";
import type { CitiesFile, Item } from "../types";
import { Card, ItemIcon, Price, SectionHead } from "./ui";

interface Row { city: string; price: number; dev: number; lon: number; lat: number }

export function CityMap({ cities, items, geo, featured, item, setItem, onOpen }: {
  cities: CitiesFile; items: Item[]; geo: object | null; featured: string[];
  item: string; setItem: (id: string) => void; onOpen: (id: string) => void;
}) {
  const dark = useDarkMode();
  const chartRef = useRef<ECharts | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const current = byId[item];

  const rows: Row[] = useMemo(() => {
    const prices = cities.prices[item] ?? {};
    return cities.cities
      .filter((c) => prices[c.name] != null)
      .map((c) => ({ city: c.name, price: prices[c.name]!, dev: (prices[c.name]! / current.price - 1) * 100, lon: c.lon, lat: c.lat }))
      .sort((a, b) => a.price - b.price);
  }, [cities, item, current.price]);

  const option: EChartsOption | null = useMemo(() => {
    if (!geo) return null;
    // label just the cheapest and the dearest city (none if every city pays the same — labels would pile up)
    const labelled = rows.length && rows[0].price !== rows[rows.length - 1].price ? [rows[0].city, rows[rows.length - 1].city] : [];
    // Honest scales: colour saturates at ±10% (or the real spread if wider), so near-identical prices
    // stay grey; size follows price ÷ national average, so equal prices draw equal bubbles.
    const spread = Math.max(...rows.map((r) => Math.abs(r.dev)), 10);
    const ink = cssVar("--color-ink"), surface = cssVar("--color-surface"), muted = cssVar("--color-muted");
    return {
      tooltip: {
        trigger: "item", backgroundColor: cssVar("--color-overlay"), borderColor: cssVar("--color-line"), borderRadius: 2, textStyle: { color: ink, fontFamily: MONO },
        formatter: (p: { name: string; value: number[] }) =>
          `<b>${p.name}</b><br/>${moneyExact(p.value[2])} ${current.unit}<br/>` +
          `<span style="color:${muted}">${Math.abs(p.value[3]) < 0.5 ? "about the national average" : `${pct(p.value[3])} vs national average`}</span>`,
      },
      geo: {
        // aspectScale ≈ cos(30°N): keeps Pakistan's shape true at its latitude; sized to fit the box
        map: "pakistan", roam: false, silent: true, aspectScale: 0.87, layoutCenter: ["50%", "47%"], layoutSize: "90%",
        itemStyle: { areaColor: cssVar("--color-soft"), borderColor: cssVar("--color-line"), borderWidth: 1 },
      },
      visualMap: {
        type: "continuous", dimension: 3, min: -spread, max: spread, calculable: false, orient: "horizontal",
        left: "left", bottom: 0, itemWidth: 10, itemHeight: 140, textStyle: { color: muted, fontSize: 11 },
        text: [`+${Math.round(spread)}% dearer`, `${Math.round(spread)}% cheaper`],
        inRange: { color: dark ? ["#3fa98a", "#6b7178", "#d9534f"] : ["#0f7350", "#9aa0a6", "#b3261e"] },
      },
      series: [{
        type: "scatter", coordinateSystem: "geo", universalTransition: true,
        data: rows.map((r) => ({
          name: r.city, value: [r.lon, r.lat, r.price, r.dev],
          label: { show: labelled.includes(r.city) },
        })),
        symbolSize: (v: number[]) => Math.min(44, Math.max(8, 20 * (v[2] / current.price) ** 3)),
        itemStyle: { borderColor: surface, borderWidth: 1, opacity: 0.7 },
        label: { formatter: "{b}", position: "right", color: ink, fontSize: 11, fontWeight: 500, fontFamily: SANS },
        emphasis: { scale: 1.2, label: { show: true, fontWeight: "bold" }, itemStyle: { borderColor: ink, opacity: 0.9 } },
        animationDurationUpdate: 600,
      }],
    };
  }, [geo, rows, dark, current.unit, current.price]);

  const onReady = (chart: ECharts) => {
    chartRef.current = chart;
    chart.on("mouseover", (e) => setHovered((e as { name: string }).name));
    chart.on("mouseout", () => setHovered(null));
  };
  const highlight = (city: string | null) => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
    if (city) {
      chart.dispatchAction({ type: "highlight", seriesIndex: 0, name: city });
      chart.dispatchAction({ type: "showTip", seriesIndex: 0, name: city });
    } else chart.dispatchAction({ type: "hideTip" });
    setHovered(city);
  };

  const others = items.filter((i) => !featured.includes(i.item_id)).sort((a, b) => a.name.localeCompare(b.name));
  const span = rows.length ? rows[rows.length - 1].price - rows[0].price : 0;

  return (
    <section>
      <SectionHead id="cities" eyebrow="Across Pakistan" title="Where it costs more" sub="Pick an item to compare this week's price in the 17 survey cities. Red = dearer than the national average, green = cheaper; bigger bubble = higher price."
        aside={
          <div className="flex w-full min-w-0 flex-wrap items-end gap-x-5 gap-y-2 lg:w-auto">
            <div role="tablist" aria-label="Item" className="no-scrollbar flex min-w-0 max-w-full gap-4 overflow-x-auto border-b border-line">
              {featured.map((id) => (
                <button key={id} type="button" role="tab" aria-selected={id === item} onClick={() => setItem(id)}
                  className={`-mb-px whitespace-nowrap border-b-2 pb-2 pt-1 text-sm font-medium transition-colors ${id === item ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                  {shortName(byId[id].name)}
                </button>
              ))}
            </div>
            <select value={featured.includes(item) ? "" : item} onChange={(e) => e.target.value && setItem(e.target.value)}
              aria-label="Choose another item" className="h-8 rounded-[2px] border border-line bg-overlay px-2 text-sm text-ink">
              <option value="">More items…</option>
              {others.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
            </select>
          </div>
        } />
      <Card className="grid gap-6 p-4 md:grid-cols-[1.35fr_1fr] md:p-6">
        <div className="relative min-h-[420px]">
          {option && geo ? <Chart option={option} maps={{ pakistan: geo }} onReady={onReady} className="h-[460px] w-full" /> : <div className="h-[460px]" />}
        </div>
        <div>
          <button type="button" onClick={() => onOpen(item)} className="flex items-center gap-3 text-left hover:text-accent">
            <ItemIcon item={current} />
            <span>
              <span className="block font-serif text-xl font-bold">{current.name}</span>
              <span className="text-sm text-muted">{current.unit}</span>
            </span>
          </button>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[2px] bg-soft px-3 py-2">
              <p className="text-xs text-muted">National average</p>
              <Price value={current.price} className="text-lg" />
            </div>
            <div className="rounded-[2px] bg-soft px-3 py-2">
              <p className="text-xs text-muted">Gap between cities</p>
              <Price value={span} className="text-lg" />
            </div>
          </div>
          <ol className="mt-4 max-h-[330px] space-y-0.5 overflow-auto pr-1">
            {rows.map((r, i) => (
              <li key={r.city}>
                <button type="button" onMouseEnter={() => highlight(r.city)} onMouseLeave={() => highlight(null)}
                  onFocus={() => highlight(r.city)} onBlur={() => highlight(null)}
                  className={`grid w-full grid-cols-[1.5rem_1fr_auto_4.5rem] items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-sm transition-colors ${hovered === r.city ? "bg-soft" : ""}`}>
                  <span className="font-mono text-xs text-muted">{i + 1}</span>
                  <span className="font-semibold">{r.city}</span>
                  <Price value={r.price} className="text-[13px]" />
                  <span className={`text-right font-mono text-xs font-medium ${Math.abs(r.dev) < 0.5 ? "text-muted" : r.dev > 0 ? "text-up" : "text-down"}`}>
                    {Math.abs(r.dev) < 0.5 ? "≈ avg" : pct(r.dev)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {rows.length > 0 && span === 0 && <p className="mt-2 text-xs text-muted">Same price in every city this week (a nationally set price).</p>}
          {rows.length < 17 && <p className="mt-2 text-xs text-muted">{17 - rows.length} cities have no price for this item this week.</p>}
        </div>
      </Card>
      <p className="mt-2 text-xs text-muted">Map outline: Natural Earth (public domain), for orientation only; not an authoritative boundary.</p>
    </section>
  );
}
