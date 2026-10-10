// Heatmap of all 51 items, grouped by category, coloured by this week's % change
// (diverging: blue = cheaper, grey ≈ unchanged, red = dearer; saturates at ±5%). Click a tile to open it.
import { useMemo } from "react";
import { Chart, cssVar, useDarkMode, type EChartsOption } from "../lib/charts";
import { money, pct, shortName } from "../lib/format";
import type { Item } from "../types";
import { Card, SectionHead } from "./ui";

const LIMIT = 5; // % where the colour is fully saturated

export function Heatmap({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const dark = useDarkMode();
  const option: EChartsOption = useMemo(() => {
    const groups = [...new Set(items.map((i) => i.category))];
    const panel = cssVar("--color-panel"), ink = cssVar("--color-ink"), muted = cssVar("--color-muted");
    const tileInk = dark ? "#e8eaf0" : "#131722";
    return {
      tooltip: {
        backgroundColor: panel, borderColor: cssVar("--color-line"), textStyle: { color: ink },
        formatter: (p: { data: { name: string; item?: Item } }) => {
          const it = p.data.item;
          return it ? `<b>${it.name}</b><br/>${money(it.price)} ${it.unit}<br/>${pct(it.change_pct)} this week` : `<b>${p.data.name}</b>`;
        },
      },
      visualMap: {
        show: false, dimension: 1, min: -LIMIT, max: LIMIT,
        inRange: { color: dark ? ["#3d7fd6", "#2a2f3b", "#d65756"] : ["#2a78d6", "#d9dce2", "#e34948"] },
      },
      series: [{
        type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
        top: 0, left: 0, right: 0, bottom: 0, squareRatio: 1.2,
        label: {
          show: true, fontFamily: "Manrope Variable", overflow: "truncate",
          formatter: (p: { data: { item?: Item } }) => (p.data.item ? `{n|${shortName(p.data.item.name)}}\n{v|${pct(p.data.item.change_pct)}}` : ""),
          rich: { n: { color: tileInk, fontSize: 12, fontWeight: 600 }, v: { color: tileInk, fontSize: 13, fontWeight: 800, padding: [3, 0, 0, 0] } },
        },
        // level 0 = the invisible root, 1 = categories (with a header strip), 2 = the item tiles
        levels: [
          { itemStyle: { color: panel, borderColor: panel, borderWidth: 0, gapWidth: 6 }, upperLabel: { show: false } },
          {
            itemStyle: { color: panel, borderColor: panel, borderWidth: 0, gapWidth: 2 },
            upperLabel: { show: true, formatter: "{b}", height: 24, color: muted, fontWeight: 700, fontSize: 12, fontFamily: "Manrope Variable", padding: [0, 0, 0, 2] },
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
    <section>
      <SectionHead id="heatmap" title="Heatmap" sub="All 51 items by category, coloured by this week's change. Hover for details, click to open."
        aside={
          <div className="flex items-center gap-2 text-xs font-semibold text-muted">
            <span>−{LIMIT}%</span>
            <span className="h-2.5 w-36 rounded-full bg-[linear-gradient(90deg,var(--color-down),#d9dce2,var(--color-up))] dark:bg-[linear-gradient(90deg,var(--color-down),#2a2f3b,var(--color-up))]" />
            <span>+{LIMIT}%</span>
          </div>
        } />
      <Card className="p-2">
        <Chart option={option} onReady={onReady as never} className="h-[820px] w-full sm:h-[520px]" />
      </Card>
    </section>
  );
}
