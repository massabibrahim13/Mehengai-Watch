// Overview: Essentials index (interactive chart), this week's signals (expandable), and category cards.
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Chart, cssVar, useDarkMode, type EChartsOption } from "../lib/charts";
import { dateLabel, joinNames, shortName } from "../lib/format";
import type { IndexFile, Item, Summary } from "../types";
import { Card, Change, ItemIcon, Price, SectionHead, Sparkline, Tabs } from "./ui";

const RANGES = ["3M", "1Y", "3Y", "All"] as const;
const WEEKS: Record<(typeof RANGES)[number], number> = { "3M": 13, "1Y": 52, "3Y": 156, All: 10_000 };

function IndexCard({ index }: { index: IndexFile }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1Y");
  const dark = useDarkMode();
  const n = Math.min(WEEKS[range], index.values.length);
  const values = index.values.slice(-n), weeks = index.weeks.slice(-n);
  const change = (values[values.length - 1] / values[0] - 1) * 100;

  const option: EChartsOption = useMemo(() => {
    const accent = cssVar("--color-accent"), muted = cssVar("--color-muted"), line = cssVar("--color-line");
    return {
      grid: { left: 0, right: 44, top: 12, bottom: 24 },
      tooltip: {
        trigger: "axis", backgroundColor: cssVar("--color-panel"), borderColor: line, textStyle: { color: cssVar("--color-ink") },
        formatter: (p: { axisValue: string; value: [string, number] }[]) => `${dateLabel(p[0].value[0])}<br/><b>${p[0].value[1].toFixed(1)}</b>`,
      },
      xAxis: { type: "time", axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: muted, hideOverlap: true }, splitLine: { show: false } },
      yAxis: { type: "value", scale: true, position: "right", axisLabel: { color: muted }, splitLine: { lineStyle: { color: line, type: "dashed" } } },
      series: [{
        type: "line", data: weeks.map((w, i) => [w, values[i]]), showSymbol: false, smooth: 0.2,
        lineStyle: { color: accent, width: 2 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: dark ? "rgba(76,143,230,0.28)" : "rgba(42,120,214,0.22)" }, { offset: 1, color: "rgba(42,120,214,0)" }] } },
      }],
    };
  }, [weeks, values, dark]);

  return (
    <Card className="flex flex-col p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-white">51</span>
          <div>
            <h3 className="text-lg font-bold">Essentials index</h3>
            <p className="text-sm text-muted">All 51 items · {dateLabel(index.base_week).replace(/^\d+ /, "")} = 100</p>
          </div>
        </div>
        <Tabs value={range} options={RANGES} onChange={setRange} label="Time range" />
      </div>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="text-4xl font-bold tracking-tight">{index.latest.toFixed(1)}</span>
        <Change value={change} soft className="text-sm" />
        <span className="text-sm text-muted">over {range === "All" ? "all data" : range}</span>
      </div>
      <Chart option={option} className="mt-2 min-h-64 w-full flex-1" />
      <p className="text-xs text-muted">Chained typical weekly price change across all 51 items. Our calculation, not the official SPI.</p>
    </Card>
  );
}

function Signals({ summary, items, onOpen }: { summary: Summary; items: Record<string, Item>; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(summary.unusual[0]?.item_id ?? null);
  const names = summary.unusual.map((u, i) => (i ? shortName(items[u.item_id].name).toLowerCase() : shortName(items[u.item_id].name)));
  return (
    <Card className="flex flex-col p-5 md:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">This week's signals</h3>
        <span className="rounded-full bg-up/10 px-2.5 py-0.5 text-sm font-bold text-up">{summary.unusual.length} unusual</span>
      </div>
      <p className="mt-1 text-[15px] text-muted">
        {summary.unusual.length ? `${joinNames(names)} moved far outside their normal weekly range.` : "Every market-priced item moved within its normal range."}
      </p>
      <ul className="mt-4 space-y-2">
        {summary.unusual.map((u) => {
          const item = items[u.item_id];
          const expanded = open === u.item_id;
          return (
            <li key={u.item_id} className={`rounded-xl border transition-colors ${expanded ? "border-line bg-soft" : "border-transparent hover:bg-soft"}`}>
              <button type="button" onClick={() => setOpen(expanded ? null : u.item_id)} aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <ItemIcon item={item} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.name}</span>
                  <span className={`text-xs font-semibold ${u.direction === "up" ? "text-up" : "text-down"}`}>{u.severity_word[0].toUpperCase() + u.severity_word.slice(1).toLowerCase()} {u.direction === "up" ? "rise" : "fall"}</span>
                </span>
                <span className="text-right">
                  <Price value={u.price} className="block text-[15px]" />
                  <Change value={u.change_pct} className="text-sm" />
                </span>
                <ChevronDown size={16} className={`text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                    <div className="px-3 pb-3">
                      <p className="text-[15px] leading-relaxed">{u.explanation}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted">{u.explanation_source === "llm" ? "AI-written from the numbers · every number checked" : "Standard summary"}</span>
                        <button type="button" onClick={() => onOpen(u.item_id)} className="chip inline-flex items-center gap-1 rounded-lg bg-panel px-3 py-1.5 text-sm font-semibold ring-1 ring-line">
                          Details <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-5 text-sm">
        <a href="#set-prices" className="chip rounded-xl bg-soft px-3 py-2.5">
          <span className="block text-muted">Government changes</span>
          <span className="text-lg font-bold">{summary.government.length}</span>
        </a>
        <a href="#set-prices" className="chip rounded-xl bg-soft px-3 py-2.5">
          <span className="block text-muted">Price revisions</span>
          <span className="text-lg font-bold">{summary.revisions.length}</span>
        </a>
      </div>
    </Card>
  );
}

const GROUPS: { title: string; featured: string; list: string[] }[] = [
  { title: "Food staples", featured: "wheat_flour", list: ["rice_basmati", "sugar", "cooking_oil"] },
  { title: "Vegetables", featured: "tomatoes", list: ["onions", "potatoes", "garlic"] },
  { title: "Meat & dairy", featured: "chicken", list: ["eggs", "milk", "beef"] },
  { title: "Energy", featured: "petrol", list: ["diesel", "lpg", "electricity"] },
];

function GroupCard({ title, featured, list, items, onOpen }: (typeof GROUPS)[number] & { items: Record<string, Item>; onOpen: (id: string) => void }) {
  const f = items[featured];
  return (
    <Card className="flex flex-col overflow-hidden">
      <button type="button" onClick={() => onOpen(featured)} className="group p-5 text-left">
        <p className="text-sm font-semibold text-muted">{title}</p>
        <div className="mt-3 flex items-center gap-2.5">
          <ItemIcon item={f} />
          <span className="truncate font-bold group-hover:text-accent">{shortName(f.name)}</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <Price value={f.price} className="text-2xl" />
          <span className="text-xs text-muted">{f.unit}</span>
        </div>
        <Change value={f.change_pct} className="text-sm" /> <span className="text-xs text-muted">this week</span>
        <Sparkline values={f.spark} className="mt-3 h-20 w-full" />
        <p className="text-center text-[11px] text-muted">6 months</p>
      </button>
      <ul className="mt-auto border-t border-line">
        {list.map((id) => {
          const it = items[id];
          return (
            <li key={id}>
              <button type="button" onClick={() => onOpen(id)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-soft">
                <ItemIcon item={it} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shortName(it.name)}</span>
                <span className="text-right text-sm">
                  <Price value={it.price} className="block" />
                  <Change value={it.change_pct} className="text-xs" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function Overview({ summary, items, index, onOpen }: { summary: Summary; items: Item[]; index: IndexFile; onOpen: (id: string) => void }) {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  return (
    <section>
      <SectionHead id="overview" title="Market summary" sub={`Week ending ${summary.week_label}, compared with ${summary.previous_label}.`} />
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <IndexCard index={index} />
        <Signals summary={summary} items={byId} onOpen={onOpen} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map((g) => <GroupCard key={g.title} {...g} items={byId} onOpen={onOpen} />)}
      </div>
    </section>
  );
}
