// "How it works": one statement, three ideas with fine-line icons, and the size of the data.
import { motion } from "motion/react";
import { dateLabel } from "../lib/format";
import type { Summary } from "../types";

// Fine-line technical icons: one colour, 1.25px strokes, square ends — like figures in a statistics paper.
const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.25, strokeLinecap: "square" as const };
const ICONS = {
  // a bell curve with its typical band, and one flagged point far outside it
  own: (
    <svg viewBox="0 0 64 64" className="h-14 w-14 text-muted" aria-hidden="true">
      <path d="M4 56 H60 M4 56 V8" {...line} />
      <path d="M6 54 C 16 54, 18 22, 28 22 S 40 54, 50 54" {...line} />
      <path d="M20 56 V40 M36 56 V40" {...line} strokeDasharray="2 2" />
      <rect x="52" y="14" width="5" height="5" style={{ fill: "var(--color-up)" }} />
      <path d="M54.5 21 V54" {...line} strokeDasharray="1 3" />
    </svg>
  ),
  // a ruled page with a check mark: the numbers written up, then verified
  words: (
    <svg viewBox="0 0 64 64" className="h-14 w-14 text-muted" aria-hidden="true">
      <path d="M12 6 H44 L52 14 V58 H12 Z M44 6 V14 H52" {...line} />
      <path d="M19 22 H45 M19 29 H45 M19 36 H38" {...line} />
      <path d="M22 47 L28 52 L40 42" {...line} strokeWidth={1.75} />
    </svg>
  ),
  // a 3 × 3 grid with one column ruled off: set prices kept apart from market prices
  apart: (
    <svg viewBox="0 0 64 64" className="h-14 w-14 text-muted" aria-hidden="true">
      {[0, 1, 2].flatMap((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={6 + c * 14} y={8 + r * 16} width="10" height="10" {...line} />))}
      <path d="M38 4 V60" {...line} strokeDasharray="2 2" />
      {[0, 1, 2].map((r) => <rect key={r} x={46} y={8 + r * 16} width="10" height="10" {...line} style={{ fill: "currentColor", fillOpacity: 0.25 }} />)}
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
  const appear = (_i = 0) => ({}); // no scroll animations: content is always visible

  return (
    <section id="method" className="scroll-mt-24">
      <motion.p {...appear()} className="label border-t border-line pt-4">How it works</motion.p>
      <motion.h2 {...appear()} className="mt-4 max-w-4xl font-serif text-[clamp(32px,4.2vw,54px)] font-bold leading-[1.1] tracking-[-0.01em]">
        Built for the kitchen table,<br /><span className="text-muted">not the trading floor.</span>
      </motion.h2>
      <motion.p {...appear()} className="mt-5 max-w-2xl text-lg text-muted">
        Prices rise every week in Pakistan. Mehngai Watch tells you which rises are normal for that item, and which aren't.
      </motion.p>

      <div className="mt-12 grid gap-px border border-line bg-line md:grid-cols-3">
        {IDEAS.map((idea, i) => (
          <motion.div key={idea.title} {...appear(i)} className="bg-bg p-6">
            {ICONS[idea.icon]}
            <h3 className="mt-5 font-serif text-xl font-bold">{idea.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{idea.body}</p>
          </motion.div>
        ))}
      </div>

      <motion.dl {...appear()} className="mt-6 grid grid-cols-2 border border-line text-left md:grid-cols-4">
        {stats.map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse border-line p-6 odd:border-r md:border-r md:last:border-r-0 [&:nth-child(-n+2)]:border-b md:[&:nth-child(-n+2)]:border-b-0">
            <dt className="mt-1 text-sm text-muted">{label}</dt>
            <dd className="font-mono text-3xl font-medium md:text-4xl">{value}</dd>
          </div>
        ))}
      </motion.dl>
    </section>
  );
}
