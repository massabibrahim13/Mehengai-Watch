// "How it works" as one big statement, three ideas with abstract icons, and the size of the data.
import { motion } from "motion/react";
import { dateLabel } from "../lib/format";
import type { Summary } from "../types";

// Abstract icons from overlapping circles, in the brand greens (no clip-art).
const ICONS = {
  // a target: each item is measured against its own normal
  own: (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden="true">
      <circle cx="40" cy="40" r="38" style={{ fill: "var(--color-brand)", opacity: 0.18 }} />
      <circle cx="40" cy="40" r="26" style={{ fill: "var(--color-brand)", opacity: 0.4 }} />
      <circle cx="40" cy="40" r="14" style={{ fill: "var(--color-brand)" }} />
    </svg>
  ),
  // a speech bubble: explained in plain words
  words: (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden="true">
      <path d="M40 4a36 36 0 1 1-24.6 62.3L4 76l4.2-17.4A36 36 0 0 1 40 4Z" style={{ fill: "var(--color-brand-2)", opacity: 0.3 }} />
      <circle cx="26" cy="40" r="6" style={{ fill: "var(--color-brand-2)" }} />
      <circle cx="40" cy="40" r="6" style={{ fill: "var(--color-brand-2)" }} />
      <circle cx="54" cy="40" r="6" style={{ fill: "var(--color-brand-2)" }} />
    </svg>
  ),
  // four circles, one set apart: policy prices kept separate
  apart: (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden="true">
      <circle cx="20" cy="20" r="17" style={{ fill: "var(--color-brand)", opacity: 0.3 }} />
      <circle cx="58" cy="20" r="17" style={{ fill: "var(--color-brand)", opacity: 0.3 }} />
      <circle cx="20" cy="58" r="17" style={{ fill: "var(--color-brand)", opacity: 0.3 }} />
      <circle cx="62" cy="62" r="17" style={{ fill: "var(--color-brand)" }} />
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
