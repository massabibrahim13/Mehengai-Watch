// Hero: flowing line waves (WaveField) behind a left-aligned promise and four "this week" cards
// (unusual / notable rise, a government price change, the biggest fall). Every number comes from the exported JSON.
import { ArrowRight, LayoutGrid } from "lucide-react";
import { m } from "motion/react";
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

const TONE = { up: "text-up", down: "text-down", plain: "text-muted" };

/** The four cards in a flat 2×2 grid; each opens its item. */
function MoveCards({ summary, items, onOpen }: { summary: Summary; items: Item[]; onOpen: (id: string) => void }) {
  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }}>
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-1.5 w-1.5 animate-live bg-live" aria-hidden="true" />
          This week's moves
        </span>
        <span className="font-mono text-xs text-muted">W/E {dateLabel(summary.week).toUpperCase()}</span>
      </div>
      <div className="grid grid-cols-2 gap-px border border-line bg-line">
        {pickMoves(summary, items).map(({ item, label, tone }) => (
          <button key={item.item_id} type="button" onClick={() => onOpen(item.item_id)}
            className="group block bg-bg p-4 text-left transition-colors hover:bg-surface">
            <span className="flex items-start justify-between gap-2">
              <span className={`label leading-tight ${TONE[tone]}`}>{label}</span>
              <Change value={item.change_pct} className="text-xs" />
            </span>
            <span className="mt-3 flex items-center gap-2.5">
              <ItemIcon item={item} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold group-hover:underline group-hover:underline-offset-4">{shortName(item.name)}</span>
                <Price value={item.price} className="text-[13px]" />
              </span>
            </span>
            <Sparkline values={item.spark} className="mt-3 h-10 w-full" />
          </button>
        ))}
      </div>
      <a href="#overview" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline hover:underline-offset-4">
        See the whole week <ArrowRight size={15} aria-hidden="true" />
      </a>
    </m.div>
  );
}

export function Hero({ summary, items, onOpen, onSearch }: {
  summary: Summary; items: Item[]; onOpen: (id: string) => void; onSearch: () => void;
}) {
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] as [number, number, number, number] },
  });
  const alerts = summary.unusual.length;

  return (
    <section id="top" className="hero-bg relative isolate flex min-h-[max(100svh,720px)] items-center overflow-hidden text-ink">
      <WaveField />
      {/* an 85% veil of the page colour: the waves stay interactive but read as a faint watermark */}
      <div className="wave-veil pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-24 pt-28 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-32">
        <div>
          <m.p {...rise(0.05)} className="label flex items-center gap-2">
            <LayoutGrid size={14} aria-hidden="true" />
            Pakistan · weekly essential prices · {summary.weeks_of_data} weeks of PBS data
          </m.p>

          <m.h1 {...rise(0.15)}
            className="mt-6 font-serif text-[clamp(40px,5.2vw,72px)] font-bold leading-[1.06] tracking-[-0.015em]">
            Know when a price rise <span className="text-muted">isn't normal.</span>
          </m.h1>

          <m.p {...rise(0.25)} className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Every week we check 51 essentials in 17 cities against their own history, and flag the moves that are truly
            unusual, explained in plain words.
          </m.p>

          <m.div {...rise(0.35)} className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onSearch}
              className="inline-flex h-11 items-center gap-2 rounded-[2px] bg-ink px-5 text-sm font-semibold text-bg transition-opacity hover:opacity-85">
              Check a price <ArrowRight size={16} aria-hidden="true" />
            </button>
            <a href="#overview"
              className="inline-flex h-11 items-center gap-2 rounded-[2px] border border-line px-5 text-sm font-semibold transition-colors hover:border-ink">
              {alerts ? `See this week's ${alerts} alert${alerts > 1 ? "s" : ""}` : "See this week"}
            </a>
          </m.div>
          <m.p {...rise(0.45)} className="mt-5 font-mono text-xs text-muted">SOURCE: PAKISTAN BUREAU OF STATISTICS, WEEKLY SPI · FREE · NO SIGN-UP</m.p>
        </div>

        <MoveCards summary={summary} items={items} onOpen={onOpen} />
      </div>
    </section>
  );
}
