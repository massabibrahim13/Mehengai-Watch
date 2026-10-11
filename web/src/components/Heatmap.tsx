// Heatmap of all 51 items (the "Heatmap" view of the Prices section), grouped by category, coloured by this week's % change
// (diverging: green = cheaper, grey ≈ unchanged, red = dearer; saturates at ±5%). Click a tile to open it.
import { useMemo } from "react";
import { Chart, cssVar, MONO, SANS, useDarkMode, type EChartsOption } from "../lib/charts";
import { money, pct, shortName } from "../lib/format";
import type { Item } from "../types";
import { Card } from "./ui";

const LIMIT = 5; // % where the colour is fully saturated

export function Heatmap({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const dark = useDarkMode();
  const option: EChartsOption = useMemo(() => {
    const groups = [...new Set(items.map((i) => i.category))];
    const panel = cssVar("--color-surface"), ink = cssVar("--color-ink"), muted = cssVar("--color-muted");
    const tileInk = dark ? "#f2f2f2" : "#111111";
    return {
      tooltip: {
        backgroundColor: cssVar("--color-overlay"), borderColor: cssVar("--color-line"), borderRadius: 2, textStyle: { color: ink, fontFamily: MONO },
        formatter: (p: { data: { name: string; item?: Item } }) => {
          const it = p.data.item;
          return it ? `<b>${it.name}</b><br/>${money(it.price)} ${it.unit}<br/>${pct(it.change_pct)} this week` : `<b>${p.data.name}</b>`;
        },
      },
      visualMap: {
        show: false, dimension: 1, min: -LIMIT, max: LIMIT,
        inRange: { color: dark ? ["#2c7a63", "#2a2c2f", "#a8413e"] : ["#7fb8a0", "#e4e1da", "#cf7a74"] },
      },
      series: [{
        type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
        top: 0, left: 0, right: 0, bottom: 0, squareRatio: 1.2,
        label: {
          show: true, fontFamily: SANS, overflow: "truncate",
          formatter: (p: { data: { item?: Item } }) => (p.data.item ? `{n|${shortName(p.data.item.name)}}\n{v|${pct(p.data.item.change_pct)}}` : ""),
          rich: { n: { color: tileInk, fontSize: 12, fontWeight: 500, fontFamily: SANS }, v: { color: tileInk, fontSize: 12, fontWeight: 500, fontFamily: MONO, padding: [3, 0, 0, 0] } },
        },
        // level 0 = the invisible root, 1 = categories (with a header strip), 2 = the item tiles
        levels: [
          { itemStyle: { color: panel, borderColor: panel, borderWidth: 0, gapWidth: 6 }, upperLabel: { show: false } },
          {
            itemStyle: { color: panel, borderColor: panel, borderWidth: 0, gapWidth: 2 },
            upperLabel: { show: true, formatter: "{b}", height: 24, color: muted, fontWeight: 600, fontSize: 11, fontFamily: SANS, padding: [0, 0, 0, 2] },
          },
          { itemStyle: { borderColor: panel, borderWidth: 0 }, emphasis: { itemStyle: { borderColor: ink, borderWidth: 2 } } },
        ],
        data: groups.map((g) => ({
          name: g,
          children: items.filter((i) => i.category === g).map((i) => ({
            name: i.item_id, value: [1, Math.max(-LIMIT, Math.min(LIMIT, i.change_pct))], item: i,
          })),
        })),
      }],
    };
  }, [items, dark]);

  const onReady = (chart: { on: (event: string, cb: (e: { data?: { item?: Item } }) => void) => void }) =>
    chart.on("click", (e) => e.data?.item && onOpen(e.data.item.item_id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>Each tile is an item, grouped by category; its colour is this week's change. Click a tile to open it.</p>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span>−{LIMIT}% cheaper</span>
          <span className="h-2 w-28 bg-[linear-gradient(90deg,#7fb8a0,#e4e1da,#cf7a74)] dark:bg-[linear-gradient(90deg,#2c7a63,#2a2c2f,#a8413e)]" />
          <span>+{LIMIT}% dearer</span>
        </div>
      </div>
      <Card className="p-2">
        <Chart option={option} onReady={onReady as never} className="h-[820px] w-full sm:h-[520px]" />
      </Card>
    </div>
  );
}
