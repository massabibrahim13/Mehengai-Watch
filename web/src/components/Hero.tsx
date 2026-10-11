// Hero: flowing line waves (WaveField) behind a left-aligned promise and four "this week" cards
// (unusual / notable rise, a government price change, the biggest fall). Every number comes from the exported JSON.
import { ArrowRight, LayoutGrid } from "lucide-react";
import { motion } from "motion/react";
import { dateLabel, shortName } from "../lib/format";
import type { Item, Summary } from "../types";
import { Change, ItemIcon, Price, Sparkline } from "./ui";
import { WaveField } from "./WaveField";

interface Move { item: Item; label: string; tone: "up" | "down" | "plain" }

/** Up to four rows: this week's unusual moves, a government price change, the biggest fall, then big movers. */
function pickMoves(summary: Summary, items: Item[]): Move[] {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const moves: Move[] = summary.unusual.slice(0, 2).map((u) => ({
    item: byId[u.item_id],
    label: `${u.severity_word[0].toUpperCase()}${u.severity_word.slice(1)} ${u.direction === "up" ? "rise" : "fall"}`,
    tone: u.direction === "up" ? "up" : "down",
  }));
  if (summary.government[0]) moves.push({ item: byId[summary.government[0].item_id], label: "Government price", tone: "plain" });
  const fall = items.filter((i) => i.price_type === "market").sort((a, b) => a.change_pct - b.change_pct)[0];
  if (fall && fall.change_pct < 0 && !moves.some((x) => x.item.item_id === fall.item_id)) moves.push({ item: fall, label: "Biggest fall", tone: "down" });
  for (const m of [...items].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))) {
    if (moves.length >= 4) break;
    if (!moves.some((x) => x.item.item_id === m.item_id)) moves.push({ item: m, label: "Big mover", tone: "plain" });
  }
  return moves.slice(0, 4);
}

const TONE = { up: "text-up", down: "text-down", plain: "text-hero-muted" };

/** The four cards, in a 2×2 group whose right column sits a little lower; each floats gently and opens its item. */
function MoveCards({ summary, items, onOpen }: { summary: Summary; items: Item[]; onOpen: (id: string) => void }) {
  return (
    <div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }}
        className="mb-4 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-lg font-bold tracking-[-0.01em]">
          <span className="h-2 w-2 animate-live rounded-full bg-live" aria-hidden="true" />
          This week's moves
        </span>
        <span className="text-xs font-semibold text-hero-muted">Week ending {dateLabel(summary.week)}</span>
      </motion.div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {pickMoves(summary, items).map(({ item, label, tone }, i) => (
          <motion.div key={item.item_id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 + i * 0.12, ease: [0.2, 0.7, 0.2, 1] }} className={i % 2 ? "sm:translate-y-8" : ""}>
            <button type="button" onClick={() => onOpen(item.item_id)} style={{ animationDelay: `${i * 1.4}s` }}
              className="drift lift block w-full rounded-2xl border border-glass-line bg-glass p-4 text-left text-hero-ink shadow-[0_24px_60px_-24px_rgb(0_0_0/0.5)] backdrop-blur-md">
              <span className="flex items-start justify-between gap-2">
                <span className={`text-[11px] font-bold uppercase leading-tight tracking-[0.1em] ${TONE[tone]}`}>{label}</span>
                <Change value={item.change_pct} className="text-xs" />
              </span>
              <span className="mt-3 flex items-center gap-2.5">
                <ItemIcon item={item} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold">{shortName(item.name)}</span>
                  <Price value={item.price} className="text-[13px]" />
                </span>
              </span>
              <Sparkline values={item.spark} className="mt-3 h-10 w-full" />
            </button>
          </motion.div>
        ))}
      </div>
      <a href="#overview" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline hover:underline-offset-4 sm:mt-12">
        See the whole week <ArrowRight size={16} aria-hidden="true" />
      </a>
    </div>
  );
}

export function Hero({ summary, items, onOpen, onSearch }: {
  summary: Summary; items: Item[]; onOpen: (id: string) => void; onSearch: () => void;
}) {
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, delay, ease: [0.2, 0.7, 0.2, 1] as [number, number, number, number] },
  });
  const alerts = summary.unusual.length;

  return (
    <section id="top" className="hero-bg relative isolate flex min-h-[max(100svh,720px)] items-center overflow-hidden text-hero-ink">
      <WaveField />
      {/* fades the waves into the page below */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-28 pt-28 md:px-8 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:pt-32">
        <div>
          <motion.span {...rise(0.1)}
            className="inline-flex items-center gap-2 rounded-full border border-glass-line bg-glass px-4 py-2 text-sm font-semibold backdrop-blur-md">
            <LayoutGrid size={16} className="text-brand" aria-hidden="true" />
            {summary.weeks_of_data} weeks of official PBS price data
          </motion.span>

          <motion.h1 {...rise(0.25)}
            className="mt-7 font-display text-[clamp(46px,6.4vw,92px)] font-extrabold leading-[0.95] tracking-[-0.045em]">
            Know when <br className="hidden sm:block" />a price rise <span className="glow-text pr-1">isn't normal.</span>
          </motion.h1>

          <motion.p {...rise(0.4)} className="mt-6 max-w-xl text-lg leading-relaxed text-hero-muted md:text-xl">
            Every week we check 51 essentials in 17 cities against their own history, and flag the moves that are truly
            unusual, explained in plain words.
          </motion.p>

          <motion.div {...rise(0.55)} className="mt-9 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onSearch}
              className="inline-flex h-13 items-center gap-2 rounded-xl bg-brand px-6 text-base font-bold text-on-brand shadow-[0_12px_30px_-12px_var(--color-brand)] transition hover:-translate-y-0.5 hover:brightness-110">
              Check a price <ArrowRight size={18} aria-hidden="true" />
            </button>
            <a href="#overview"
              className="inline-flex h-13 items-center gap-2 rounded-xl border border-hero-ink/20 bg-glass px-6 font-semibold backdrop-blur-md transition-colors hover:border-hero-ink/40">
              {alerts ? `See this week's ${alerts} alert${alerts > 1 ? "s" : ""}` : "See this week"}
            </a>
          </motion.div>
          <motion.p {...rise(0.7)} className="mt-4 text-sm text-hero-muted">Free · official PBS data · no sign-up</motion.p>
        </div>

        <MoveCards summary={summary} items={items} onOpen={onOpen} />
      </div>
    </section>
  );
}
