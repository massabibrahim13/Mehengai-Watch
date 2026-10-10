// Hero (white in light mode, near-black in dark): headline, big search, quick picks, ticker tape, and the real Essentials index drawn across
// the bottom. Every number comes from the exported JSON.
import { Search } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { reducedMotion } from "../lib/charts";
import { arrow, dateLabel, money, pct, trend, trendText } from "../lib/format";
import type { IndexFile, Item, Summary } from "../types";

const QUICK = [["Aata", "wheat_flour"], ["Cheeni", "sugar"], ["Petrol", "petrol"], ["Tamatar", "tomatoes"], ["Chicken", "chicken"], ["Doodh", "milk"]];

function TickerTape({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const sorted = [...items].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
  const row = (copy: number) =>
    sorted.map((it) => {
      const t = trend(it.change_pct);
      return (
        <button key={`${copy}-${it.item_id}`} type="button" onClick={() => onOpen(it.item_id)} tabIndex={copy ? -1 : 0} aria-hidden={copy === 1}
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-1 text-[13px] transition-colors hover:bg-hero-ink/5">
          <span className="font-semibold text-hero-ink">{it.name}</span>
          <span className="text-hero-muted">{money(it.price)}</span>
          <span className={t === "up" ? "text-up" : t === "down" ? "text-down" : "text-hero-muted"}>
            {arrow(t)} {pct(Math.abs(it.change_pct)).slice(1)}
          </span>
        </button>
      );
    });
  return (
    <div className="ticker fade-x overflow-hidden border-y border-hero-line" aria-label="This week's prices of all 51 items">
      <div className="ticker-track flex w-max animate-ticker py-1.5">{row(0)}{row(1)}</div>
    </div>
  );
}

function IndexLine({ index }: { index: IndexFile }) {
  const { line, area } = useMemo(() => {
    const v = index.values;
    const lo = Math.min(...v), hi = Math.max(...v);
    const pts = v.map((y, i) => [(i / (v.length - 1)) * 1000, 190 - ((y - lo) / (hi - lo)) * 160]);
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return { line: d, area: `${d} L1000,220 L0,220 Z` };
  }, [index]);
  const animate = !reducedMotion();
  return (
    <svg viewBox="0 0 1000 220" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-56 w-full md:h-72" aria-hidden="true">
      <defs>
        <linearGradient id="hero-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <motion.path d={area} fill="url(#hero-fill)" initial={{ opacity: animate ? 0 : 1 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, delay: 0.6 }} />
      <motion.path d={line} fill="none" strokeWidth={1.6}
        style={{ stroke: "var(--color-accent)", filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--color-accent) 60%, transparent))" }}
        initial={{ pathLength: animate ? 0 : 1 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }} />
    </svg>
  );
}

export function Hero({ summary, items, index, onOpen, onSearch }: {
  summary: Summary; items: Item[]; index: IndexFile; onOpen: (id: string) => void; onSearch: () => void;
}) {
  return (
    <section id="top" className="relative overflow-hidden bg-hero pt-16 text-hero-ink">
      {/* soft light from below — calm, no neon */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_100%,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_70%)]" />
      <TickerTape items={items} onOpen={onOpen} />

      <div className="relative mx-auto max-w-7xl px-4 pb-64 pt-16 md:px-8 md:pb-80 md:pt-24">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-hero-line bg-hero-ink/5 px-3 py-1.5 text-[13px] font-semibold text-hero-muted">
            <span className="h-2 w-2 animate-live rounded-full bg-live" />
            Week ending {dateLabel(summary.week)} · from PBS weekly price data
          </span>
          <h1 className="mt-6 max-w-5xl text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[64px]">
            Pakistan's essential prices,<br />
            <span className="text-hero-muted">decoded every week.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-hero-muted">
            Track 51 everyday items across 17 cities. See which prices moved unusually this week, explained in plain words.
          </p>

          <button type="button" onClick={onSearch}
            className="mt-8 flex w-full max-w-xl items-center gap-3 rounded-2xl border border-hero-ink/15 bg-hero-ink/[0.06] px-5 py-4 text-left text-hero-muted shadow-[0_8px_40px_-16px_rgb(0_0_0/0.35)] backdrop-blur transition hover:border-hero-ink/30 hover:bg-hero-ink/[0.09]">
            <Search size={20} aria-hidden="true" />
            <span className="flex-1">Search aata, cheeni, petrol, ٹماٹر…</span>
            <kbd className="hidden rounded-md border border-hero-ink/20 px-2 py-0.5 text-xs font-semibold sm:inline">Ctrl K</kbd>
          </button>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-hero-muted">Popular:</span>
            {QUICK.map(([label, id]) => (
              <button key={id} type="button" onClick={() => onOpen(id)}
                className="rounded-full border border-hero-ink/12 bg-hero-ink/[0.04] px-3 py-1 text-sm font-semibold text-hero-ink transition hover:border-hero-ink/30 hover:bg-hero-ink/10">
                {label}
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      <IndexLine index={index} />
      <div className="pointer-events-none absolute bottom-24 right-4 text-right md:bottom-32 md:right-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-hero-muted">Essentials index</p>
        <p className="text-3xl font-bold tracking-tight">{index.latest.toFixed(1)}</p>
        <p className="text-sm text-hero-muted">
          <span className={trendText(trend(index.change_1w_pct))}>{arrow(trend(index.change_1w_pct))} {Math.abs(index.change_1w_pct).toFixed(2)}%</span> this week
          {index.change_1y_pct !== null && <> · {pct(index.change_1y_pct)} in a year</>}
        </p>
      </div>
    </section>
  );
}
