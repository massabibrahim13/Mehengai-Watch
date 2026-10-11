// "How it works" as one big statement, three ideas with abstract icons, and the size of the data.
import { motion } from "motion/react";
import { dateLabel } from "../lib/format";
import type { Summary } from "../types";

// Line-art icons in the same flowing-line style as the hero waves.
const stroke = { fill: "none", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICONS = {
  // calm lines, one with a spike: an item measured against its own normal
  own: (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden="true">
      {[18, 30, 54, 66].map((y, i) => (
        <path key={y} d={`M6 ${y} C 22 ${y - 5}, 30 ${y + 5}, 44 ${y} S 64 ${y - 5}, 74 ${y}`} {...stroke} style={{ stroke: "var(--color-brand)", opacity: 0.35 + i * 0.1 }} />
      ))}
      <path d="M6 42 C 18 38, 24 46, 34 42 L 40 20 L 46 42 C 56 38, 62 46, 74 42" {...stroke} style={{ stroke: "var(--color-up)" }} />
    </svg>
  ),
  // waves that turn into lines of text: numbers explained in words
  words: (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden="true">
      {[22, 34, 46, 58].map((y, i) => (
        <path key={y} d={`M6 ${y} C 14 ${y - 6}, 20 ${y + 6}, 30 ${y} S 40 ${y}, 44 ${y} L ${74 - i * 9} ${y}`} {...stroke} style={{ stroke: "var(--color-brand-2)", opacity: 1 - i * 0.15 }} />
      ))}
    </svg>
  ),
  // a stepped bundle (set prices) kept apart from a wavy one (market prices)
  apart: (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden="true">
      {[12, 20, 28].map((y) => (
        <path key={y} d={`M6 ${y + 4} H 30 V ${y} H 52 V ${y - 3} H 74`} {...stroke} style={{ stroke: "var(--color-brand)" }} />
      ))}
      {[52, 60, 68].map((y, i) => (
        <path key={y} d={`M6 ${y} C 18 ${y - 7}, 26 ${y + 7}, 40 ${y} S 62 ${y - 7}, 74 ${y}`} {...stroke} style={{ stroke: "var(--color-brand-2)", opacity: 0.45 + i * 0.25 }} />
      ))}
    </svg>
  ),
};

const IDEAS: { icon: keyof typeof ICONS; title: string; body: string }[] = [
  { icon: "own", title: "Measured against its own past",
    body: "A 10% week is ordinary for tomatoes but extreme for sugar. Each item is compared with its own last year, so only real surprises are flagged." },
  { icon: "words", title: "Explained in plain words",
    body: "An AI model turns the numbers into one or two sentences. Code checks every number it writes and blocks any claimed cause or blame." },
  { icon: "apart", title: "Policy prices kept apart",
    body: "Petrol, power, gas and phone prices are set by the government; packaged goods by companies. Their changes are listed, never flagged." },
];

export function Statement({ summary, items, cities }: { summary: Summary; items: number; cities: number }) {
  const stats = [
    [String(summary.weeks_of_data), "weekly PBS reports read"],
    [String(items), "essential items tracked"],
    [String(cities), "cities compared"],
    [dateLabel(summary.data_start).replace(/^\d+ /, ""), "history starts"],
  ];
  const appear = (i = 0) => ({ initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { duration: 0.7, delay: i * 0.1 } });

  return (
    <section id="method" className="scroll-mt-24 text-center">
      <motion.p {...appear()} className="text-xs font-bold uppercase tracking-[0.18em] text-brand">How it works</motion.p>
      <motion.h2 {...appear()} className="mx-auto mt-4 max-w-5xl font-display text-[clamp(38px,5.6vw,76px)] font-bold leading-[1] tracking-[-0.04em]">
        Built for the kitchen table,<br /><span className="text-muted">not the trading floor.</span>
      </motion.h2>
      <motion.p {...appear()} className="mx-auto mt-6 max-w-2xl text-lg text-muted">
        Prices rise every week in Pakistan. Mehngai Watch tells you which rises are normal for that item, and which aren't.
      </motion.p>

      <div className="mt-16 grid gap-12 text-left md:grid-cols-3 md:gap-10">
        {IDEAS.map((idea, i) => (
          <motion.div key={idea.title} {...appear(i)}>
            {ICONS[idea.icon]}
            <h3 className="mt-6 font-display text-2xl font-bold tracking-[-0.02em]">{idea.title}</h3>
            <p className="mt-3 leading-relaxed text-muted">{idea.body}</p>
          </motion.div>
        ))}
      </div>

      <motion.dl {...appear()} className="mt-16 grid grid-cols-2 overflow-hidden rounded-3xl border border-line bg-panel text-left md:grid-cols-4">
        {stats.map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse border-line p-6 odd:border-r md:border-r md:last:border-r-0 [&:nth-child(-n+2)]:border-b md:[&:nth-child(-n+2)]:border-b-0">
            <dt className="mt-1 text-sm text-muted">{label}</dt>
            <dd className="font-display text-4xl font-bold tracking-[-0.03em] md:text-5xl">{value}</dd>
          </div>
        ))}
      </motion.dl>
    </section>
  );
}
