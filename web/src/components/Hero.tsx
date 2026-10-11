// Hero: a full-screen "Pakistan from orbit" scene (OrbitScene) with one big promise, a search button and a few
// floating price cards for this week's biggest moves. Every number comes from the exported JSON.
import { ArrowRight, LayoutGrid } from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { reducedMotion } from "../lib/charts";
import { dateLabel, shortName } from "../lib/format";
import type { CitiesFile, Item, Summary } from "../types";
import { OrbitScene } from "./OrbitScene";
import { Change, ItemIcon, Price, Sparkline } from "./ui";

interface Chip { item: Item; label: string }

/** Up to four cards: this week's unusual moves, a government price change, the biggest fall. */
function pickChips(summary: Summary, items: Item[]): Chip[] {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const chips: Chip[] = summary.unusual.slice(0, 2).map((u) => ({
    item: byId[u.item_id],
    label: `${u.severity_word[0].toUpperCase()}${u.severity_word.slice(1)} ${u.direction === "up" ? "rise" : "fall"}`,
  }));
  if (summary.government[0]) chips.push({ item: byId[summary.government[0].item_id], label: "Government price" });
  const fall = items.filter((i) => i.price_type === "market").sort((a, b) => a.change_pct - b.change_pct)[0];
  if (fall && fall.change_pct < 0) chips.push({ item: fall, label: "Biggest fall" });
  for (const m of [...items].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))) {
    if (chips.length >= 4) break;
    if (!chips.some((c) => c.item.item_id === m.item_id)) chips.push({ item: m, label: "Big mover" });
  }
  return chips.slice(0, 4);
}

// where each card floats (wide screens only)
const SPOTS = ["left-[2.5vw] top-[27%]", "right-[2.5vw] top-[23%]", "left-[6vw] top-[50%]", "right-[5.5vw] top-[47%]"];

function PriceChip({ chip, spot, i, onOpen }: { chip: Chip; spot: string; i: number; onOpen: (id: string) => void }) {
  const { item } = chip;
  return (
    <div className={`depth absolute z-10 hidden min-[1360px]:block ${spot}`} style={{ ["--depth" as string]: 14 + i * 4 }}>
      <motion.button type="button" onClick={() => onOpen(item.item_id)}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 1.4 + i * 0.15 }}
        className="drift lift block w-[212px] rounded-2xl border border-glass-line bg-glass p-3.5 text-left text-hero-ink shadow-[0_24px_60px_-24px_rgb(0_0_0/0.55)] backdrop-blur-xl"
        style={{ animationDelay: `${i * 1.3}s` }}>
        <span className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-hero-muted">{chip.label}</span>
          <Change value={item.change_pct} className="text-xs" />
        </span>
        <span className="mt-2 flex items-center gap-2.5">
          <ItemIcon item={item} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{shortName(item.name)}</span>
            <Price value={item.price} className="text-[13px]" />
          </span>
        </span>
        <Sparkline values={item.spark} className="mt-2 h-9 w-full" />
      </motion.button>
    </div>
  );
}

export function Hero({ summary, items, cities, geo, onOpen, onSearch }: {
  summary: Summary; items: Item[]; cities: CitiesFile; geo: object | null; onOpen: (id: string) => void; onSearch: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // gentle mouse parallax: the scene and the cards drift with the pointer (not on touch, not with reduced motion)
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, delay, ease: [0.2, 0.7, 0.2, 1] as [number, number, number, number] },
  });
  const alerts = summary.unusual.length;

  return (
    <section id="top" ref={ref} onPointerMove={onMove}
      className="relative isolate flex min-h-[max(100svh,760px)] flex-col overflow-hidden text-hero-ink">
      <OrbitScene geo={geo} cities={cities.cities} />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-[270px] pt-[clamp(140px,21vh,210px)] text-center md:pb-[220px]">
        <motion.span {...rise(0.1)}
          className="inline-flex items-center gap-2 rounded-full border border-glass-line bg-glass px-4 py-2 text-sm font-semibold backdrop-blur-md">
          <LayoutGrid size={16} className="text-brand" aria-hidden="true" />
          {summary.weeks_of_data} weeks of official PBS price data
          <span className="hidden text-hero-muted sm:inline">· updated {dateLabel(summary.week)}</span>
        </motion.span>

        <motion.h1 {...rise(0.25)}
          className="mt-7 font-display text-[clamp(44px,5.9vw,84px)] font-extrabold leading-[0.95] tracking-[-0.045em]">
          Know when a price rise <br className="hidden sm:block" />
          <span className="glow-text pr-1">isn't normal.</span>
        </motion.h1>

        <motion.p {...rise(0.4)} className="mt-6 max-w-2xl text-lg leading-relaxed text-hero-muted md:text-xl">
          Every week we check 51 essentials in 17 cities against their own history, and flag the moves that are truly
          unusual, explained in plain words.
        </motion.p>

        <motion.div {...rise(0.55)} className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <button type="button" onClick={onSearch}
            className="slant mr-1 inline-flex h-14 items-center gap-2 rounded-l-2xl bg-hero-ink pl-7 pr-5 text-lg font-bold text-hero [--tail:var(--color-hero-ink)] transition-transform hover:-translate-y-0.5">
            Check a price <ArrowRight size={20} aria-hidden="true" />
          </button>
          <a href="#overview"
            className="inline-flex h-14 items-center gap-2 rounded-2xl border border-hero-ink/20 bg-glass px-6 font-semibold backdrop-blur-md transition-colors hover:border-hero-ink/40">
            {alerts ? `See this week's ${alerts} alert${alerts > 1 ? "s" : ""}` : "See this week"}
          </a>
        </motion.div>
        <motion.p {...rise(0.7)} className="mt-4 text-sm text-hero-muted">Free · official PBS data · no sign-up</motion.p>
      </div>

      {pickChips(summary, items).map((c, i) => <PriceChip key={c.item.item_id} chip={c} spot={SPOTS[i]} i={i} onOpen={onOpen} />)}

    </section>
  );
}
