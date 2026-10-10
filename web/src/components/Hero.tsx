// The week's story in one headline + four count-up tiles. The headline is assembled from the data
// with fixed rules (not by an AI), so every number in it is exactly what the pipeline exported.
import { animate, motion } from "motion/react";
import { useEffect, useState } from "react";
import { reducedMotion } from "../lib/charts";
import { dateLabel, joinNames, pct } from "../lib/format";
import type { Item, NewsItem, Summary } from "../types";
import { NewsStrip } from "./Tickers";

const short = (name: string) => name.replace(/\s*\(.*\)$/, "");

function CountUp({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  useEffect(() => {
    if (reducedMotion()) return setShown(value);
    const controls = animate(0, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [value]);
  const sign = prefix === "±" ? (value > 0 ? "+" : value < 0 ? "−" : "") : prefix;
  return <span className="font-mono tabular">{sign}{Math.abs(shown).toFixed(decimals)}{suffix}</span>;
}

function Tile({ label, children, note, href }: { label: string; children: React.ReactNode; note: string; href: string }) {
  return (
    <a href={href} className="bubble block rounded-2xl border border-line bg-surface p-4 hover:border-accent/50">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-4xl font-medium tracking-tight">{children}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </a>
  );
}

export function Hero({ summary, items, news }: { summary: Summary; items: Item[]; news: NewsItem[] }) {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const unusual = summary.unusual.map((u) => short(byId[u.item_id].name));
  const headline = unusual.length
    ? `${joinNames(unusual.map((n, i) => (i ? n.toLowerCase() : n)))} moved unusually this week.`
    : "A calm week: no unusual price moves.";
  const gov = summary.government.slice(0, 2).map((g) => `${short(byId[g.item_id].name).toLowerCase()} ${g.change_pct > 0 ? "rose" : "fell"} ${pct(Math.abs(g.change_pct)).slice(1)}`);
  const b = summary.basket_change_pct;
  const dek = [
    gov.length ? `Government-set prices: ${joinNames(gov)}.` : "No government-set price changed.",
    `Across all 51 essentials, the typical price ${b > 0 ? "rose" : b < 0 ? "fell" : "held"} ${Math.abs(b).toFixed(2)}%: ${summary.counts.up} items up, ${summary.counts.down} down, ${summary.counts.unchanged} unchanged.`,
  ].join(" ");

  return (
    <section id="top" className="pt-10 md:pt-14">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Week ending {dateLabel(summary.week)} · compared with {summary.previous_label} · PBS weekly price survey
        </p>
        <h1 className="mt-3 max-w-4xl font-serif text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
          {headline}
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink/80">{dek}</p>
      </motion.div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Unusual price moves" note="far outside the item's own normal range" href="#this-week">
          <CountUp value={summary.unusual.length} />
        </Tile>
        <Tile label="Government price changes" note={`petrol, power, gas… (≥ ${summary.thresholds.administered}%)`} href="#set-prices">
          <CountUp value={summary.government.length} />
        </Tile>
        <Tile label="Price revisions" note={`packaged & fixed prices (≥ ${summary.thresholds.fixed}%)`} href="#set-prices">
          <CountUp value={summary.revisions.length} />
        </Tile>
        <Tile label="All 51 items, typical change" note={`${summary.counts.up} up · ${summary.counts.down} down · ${summary.counts.unchanged} unchanged`} href="#movers">
          <CountUp value={b} decimals={2} prefix="±" suffix="%" />
        </Tile>
      </div>

      <div className="mt-6">
        <NewsStrip news={news} />
      </div>
    </section>
  );
}
