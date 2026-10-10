// "Where it costs more": the 17 survey cities as bubbles on a map of Pakistan, for one item.
// Bubble size = price there; colour = % above/below the national average (blue cheaper, grey ≈ average,
// red dearer — the validated diverging pair with a neutral midpoint). Hovering a city on the map or in
// the ranked list highlights it in both.
import { useMemo, useRef, useState } from "react";
import { VisualMapComponent } from "echarts/components";
import { Chart, cssVar, echarts, useDarkMode, type EChartsOption } from "../lib/charts";
import { moneyExact, pct } from "../lib/format";
import type { CitiesFile, Item } from "../types";
import { Section } from "./ui";

echarts.use([VisualMapComponent]);

interface Row { city: string; price: number; dev: number; lon: number; lat: number }

export function CityMap({ cities, items, geo, featured, item, setItem, onOpen }: {
  cities: CitiesFile; items: Item[]; geo: object | null; featured: string[];
  item: string; setItem: (id: string) => void; onOpen: (id: string) => void;
}) {
  const dark = useDarkMode();
  const chartRef = useRef<echarts.ECharts | null>(null);
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
    if (!echarts.getMap("pakistan")) echarts.registerMap("pakistan", geo as never);
    const lo = Math.min(...rows.map((r) => r.price)), hi = Math.max(...rows.map((r) => r.price));
    // Honest scales: colour saturates at ±10% (or the real spread if wider), so near-identical prices
    // stay grey; size follows price ÷ national average, so equal prices draw equal bubbles.
    const spread = Math.max(...rows.map((r) => Math.abs(r.dev)), 10);
    const ink = cssVar("--color-ink"), surface = cssVar("--color-surface"), muted = cssVar("--color-muted");
    return {
      tooltip: {
        trigger: "item", backgroundColor: surface, borderColor: cssVar("--color-line"), textStyle: { color: ink },
        formatter: (p: { name: string; value: number[] }) =>
          `<b>${p.name}</b><br/>${moneyExact(p.value[2])} ${current.unit}<br/>` +
          `<span style="color:${muted}">${Math.abs(p.value[3]) < 0.5 ? "about the national average" : `${pct(p.value[3])} vs national average`}</span>`,
      },
      geo: {
        // aspectScale ≈ cos(30°N): keeps Pakistan's shape true at its latitude; sized to fit the box
        map: "pakistan", roam: false, silent: true, aspectScale: 0.87, layoutCenter: ["50%", "47%"], layoutSize: "90%",
        itemStyle: { areaColor: dark ? "rgba(255,255,255,0.04)" : "rgba(22,24,27,0.035)", borderColor: dark ? "rgba(255,255,255,0.25)" : "rgba(22,24,27,0.25)", borderWidth: 1 },
      },
      visualMap: {
        type: "continuous", dimension: 3, min: -spread, max: spread, calculable: false, orient: "horizontal",
        left: "left", bottom: 0, itemWidth: 10, itemHeight: 140, textStyle: { color: muted, fontSize: 11 },
        text: [`+${Math.round(spread)}% dearer`, `${Math.round(spread)}% cheaper`],
        inRange: { color: dark ? ["#3987e5", "#6e7176", "#e66767"] : ["#2a78d6", "#b8b6b0", "#e34948"] },
      },
      series: [{
        type: "scatter", coordinateSystem: "geo", universalTransition: true,
        data: rows.map((r) => ({
          name: r.city, value: [r.lon, r.lat, r.price, r.dev],
          label: { show: r.price === lo || r.price === hi },
        })),
        symbolSize: (v: number[]) => Math.min(44, Math.max(8, 20 * (v[2] / current.price) ** 3)),
        itemStyle: { borderColor: surface, borderWidth: 2, opacity: 0.92 },
        label: { formatter: "{b}", position: "right", color: ink, fontSize: 12, fontFamily: "IBM Plex Sans" },
        emphasis: { scale: 1.35, label: { show: true, fontWeight: "bold" }, itemStyle: { borderColor: ink } },
        animationDurationUpdate: 600,
      }],
    };
  }, [geo, rows, dark, current.unit, current.price]);

  const onReady = (chart: echarts.ECharts) => {
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
    <Section id="map" kicker="17 cities" title="Where it costs more"
      aside={
        <div className="flex flex-wrap items-center gap-2">
          {featured.map((id) => (
            <button key={id} type="button" onClick={() => setItem(id)}
              className={`bubble rounded-full border px-3 py-1 text-sm ${id === item ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:border-accent"}`}>
              {byId[id].name.replace(/\s*\(.*\)$/, "")}
            </button>
          ))}
          <select value={featured.includes(item) ? "" : item} onChange={(e) => e.target.value && setItem(e.target.value)}
            aria-label="Choose another item" className="bubble rounded-full border border-line bg-surface px-3 py-1 text-sm">
            <option value="">More items…</option>
            {others.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
          </select>
        </div>
      }>
      <div className="grid gap-6 rounded-3xl border border-line bg-surface p-4 md:grid-cols-[1.35fr_1fr] md:p-6">
        <div className="relative min-h-[420px]">
          {option ? <Chart option={option} onReady={onReady} className="h-[460px] w-full" /> : <div className="h-[460px]" />}
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <button type="button" onClick={() => onOpen(item)} className="text-left hover:text-accent">
              <h3 className="font-serif text-2xl font-semibold">{current.name}</h3>
            </button>
            <span className="text-sm text-muted">{current.unit}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            National average <span className="font-mono tabular text-ink">{moneyExact(current.price)}</span>
            {span > 0 && <> · cities differ by <span className="font-mono tabular text-ink">{moneyExact(span)}</span></>}
          </p>
          <ol className="mt-4 max-h-[380px] space-y-0.5 overflow-auto pr-1">
            {rows.map((r, i) => (
              <li key={r.city}>
                <button type="button" onMouseEnter={() => highlight(r.city)} onMouseLeave={() => highlight(null)}
                  onFocus={() => highlight(r.city)} onBlur={() => highlight(null)}
                  className={`grid w-full grid-cols-[1.5rem_1fr_auto_4.5rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${hovered === r.city ? "bg-ink/5" : ""}`}>
                  <span className="font-mono text-xs text-muted">{i + 1}</span>
                  <span>{r.city}</span>
                  <span className="font-mono tabular">{moneyExact(r.price)}</span>
                  <span className={`text-right font-mono text-xs tabular ${Math.abs(r.dev) < 0.5 ? "text-muted" : r.dev > 0 ? "text-up" : "text-down"}`}>
                    {Math.abs(r.dev) < 0.5 ? "≈ avg" : pct(r.dev)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {rows.length < 17 && <p className="mt-2 text-xs text-muted">{17 - rows.length} cities have no price for this item this week.</p>}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Map outline: Natural Earth (public domain), for orientation only; not an authoritative boundary.</p>
    </Section>
  );
}
