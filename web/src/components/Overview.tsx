// "This week": the Essentials index (interactive chart), this week's alerts (expandable), and set-price boards.
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useMemo, useState } from "react";
import { Chart, cssVar, useDarkMode, type EChartsOption } from "../lib/charts";
import { dateLabel, joinNames, shortName } from "../lib/format";
import type { IndexFile, Item, Summary } from "../types";
import { SetPriceBoards } from "./SetPrices";
import { Change, ItemIcon, Price, SectionHead, Segmented } from "./ui";

const RANGES = ["3M", "1Y", "3Y", "All"] as const;
const WEEKS: Record<(typeof RANGES)[number], number> = { "3M": 13, "1Y": 52, "3Y": 156, All: 10_000 };

function IndexCard({ index }: { index: IndexFile }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1Y");
  const dark = useDarkMode();
  const n = Math.min(WEEKS[range], index.values.length);
  const values = index.values.slice(-n), weeks = index.weeks.slice(-n);
  const change = (values[values.length - 1] / values[0] - 1) * 100;

  const option: EChartsOption = useMemo(() => {
    const ink = cssVar("--color-ink"), muted = cssVar("--color-muted"), line = cssVar("--color-line");
    return {
      grid: { left: 0, right: 48, top: 12, bottom: 24 },
      tooltip: {
        trigger: "axis", backgroundColor: cssVar("--color-overlay"), borderColor: line, borderRadius: 2, textStyle: { color: ink },
        axisPointer: { type: "line", lineStyle: { color: muted, width: 1 } },
        formatter: (p: { axisValue: string; value: [string, number] }[]) => `${dateLabel(p[0].value[0])}<br/><b>${p[0].value[1].toFixed(1)}</b>`,
      },
      xAxis: { type: "time", axisLine: { lineStyle: { color: line } }, axisTick: { show: false }, axisLabel: { color: muted, hideOverlap: true }, splitLine: { show: false } },
      yAxis: { type: "value", scale: true, position: "right", axisLabel: { color: muted }, splitLine: { lineStyle: { color: line, width: 1 } } },
      series: [{ type: "line", data: weeks.map((w, i) => [w, values[i]]), showSymbol: false, lineStyle: { color: ink, width: 2 } }],
    };
  }, [weeks, values, dark]);

  return (
    <div className="flex flex-col p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="label">Essentials index</h3>
          <p className="mt-1 text-sm text-muted">All 51 items · {dateLabel(index.base_week).replace(/^\d+ /, "")} = 100</p>
        </div>
        <Segmented value={range} options={RANGES} onChange={setRange} label="Time range" />
      </div>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="font-mono text-4xl font-medium tracking-tight">{index.latest.toFixed(1)}</span>
        <Change value={change} soft className="text-sm" />
        <span className="text-sm text-muted">over {range === "All" ? "all data" : range}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        The typical essential now costs about {(index.latest / 100).toFixed(2)}× what it did in {dateLabel(index.base_week).replace(/^\d+ /, "")}.
      </p>
      <Chart option={option} className="mt-2 min-h-64 w-full flex-1" />
      <p className="text-xs text-muted">Our calculation from PBS data (the typical weekly change of all 51 items, chained week by week), not the official SPI.</p>
    </div>
  );
}

function Signals({ summary, items, onOpen }: { summary: Summary; items: Record<string, Item>; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(summary.unusual[0]?.item_id ?? null);
  const names = summary.unusual.map((u, i) => (i ? shortName(items[u.item_id].name).toLowerCase() : shortName(items[u.item_id].name)));
  return (
    <div className="flex flex-col p-5 md:p-6">
      <div className="flex items-center justify-between">
        <h3 className="label">This week's alerts</h3>
        <span className="rounded-[2px] bg-up/10 px-2 py-0.5 font-mono text-xs font-semibold text-up">{summary.unusual.length} alert{summary.unusual.length === 1 ? "" : "s"}</span>
      </div>
      <p className="mt-1 text-[15px] text-muted">
        {summary.unusual.length ? `${joinNames(names)} moved far outside their normal weekly range.` : "Every market-priced item moved within its normal range."}
      </p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {summary.unusual.map((u) => {
          const item = items[u.item_id];
          const expanded = open === u.item_id;
          return (
            <li key={u.item_id} className={`transition-colors ${expanded ? "bg-soft" : "hover:bg-soft"}`}>
              <button type="button" onClick={() => setOpen(expanded ? null : u.item_id)} aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <ItemIcon item={item} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.name}</span>
                  <span className={`text-xs font-medium ${u.direction === "up" ? "text-up" : "text-down"}`}>{u.severity_word[0].toUpperCase() + u.severity_word.slice(1).toLowerCase()} {u.direction === "up" ? "rise" : "fall"}</span>
                </span>
                <span className="text-right">
                  <Price value={u.price} className="block text-[15px]" />
                  <Change value={u.change_pct} className="text-sm" />
                </span>
                <ChevronDown size={16} className={`text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                    <div className="px-3 pb-3">
                      <p className="text-[15px] leading-relaxed">{u.explanation}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted">{u.explanation_source === "llm" ? "AI-written from the numbers · every number checked" : "Standard summary"}</span>
                        <button type="button" onClick={() => onOpen(u.item_id)} className="chip inline-flex items-center gap-1 rounded-[2px] border border-line px-3 py-1 text-sm font-medium">
                          Details <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto grid grid-cols-2 gap-px border border-line bg-line pt-px text-sm">
        <a href="#set-prices" className="bg-bg px-3 py-2.5 hover:bg-surface">
          <span className="block text-muted">Government changes</span>
          <span className="font-mono text-lg font-medium">{summary.government.length}</span>
        </a>
        <a href="#set-prices" className="bg-bg px-3 py-2.5 hover:bg-surface">
          <span className="block text-muted">Price revisions</span>
          <span className="font-mono text-lg font-medium">{summary.revisions.length}</span>
        </a>
      </div>
    </div>
  );
}

export function Overview({ summary, items, index, onOpen }: { summary: Summary; items: Item[]; index: IndexFile; onOpen: (id: string) => void }) {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  return (
    <section>
      <SectionHead id="overview" eyebrow="This week" title="What changed this week"
        sub={`Week ending ${summary.week_label}, compared with ${summary.previous_label}. "Unusual" means far outside what is normal for that item.`} />
      <div className="panel overflow-hidden">
        <div className="grid divide-y divide-line lg:grid-cols-[1.6fr_1fr] lg:divide-x lg:divide-y-0">
          <IndexCard index={index} />
          <Signals summary={summary} items={byId} onOpen={onOpen} />
        </div>
      </div>
      <SetPriceBoards summary={summary} items={items} onOpen={onOpen} />
    </section>
  );
}
