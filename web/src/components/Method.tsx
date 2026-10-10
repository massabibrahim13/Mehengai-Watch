// How it works, in plain words, plus sources and credits.
import { dateLabel } from "../lib/format";
import type { Summary } from "../types";
import { Section } from "./ui";

export function Method({ summary }: { summary: Summary }) {
  const blocks = [
    ["Where the numbers come from", `The Pakistan Bureau of Statistics surveys 51 essentials in 17 cities every week. We read every report since ${dateLabel(summary.data_start)} (${summary.weeks_of_data} weeks), check each number, and store it.`],
    ["What “unusual” means", "Each item is compared with its own past year. A 10% week is ordinary for tomatoes but extreme for sugar. Flags: notable, unusual, extreme. Tested against documented price shocks: the same hits as a simple threshold with 60% fewer alerts."],
    ["Who writes the explanations", "An AI model turns the numbers into a sentence. It may only use the numbers it is given; code checks every number and blocks any claim of a cause or blame. If a check fails, a standard sentence is used."],
    ["Set prices", "Petrol, power, gas and phone charges are set by the government; packaged goods by companies. Their changes are listed as decisions, never as anomalies."],
  ];
  return (
    <Section id="method" kicker="Method" title="How Mehngai Watch works">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {blocks.map(([title, body]) => (
          <div key={title} className="rounded-3xl border border-line bg-surface p-5">
            <h3 className="font-serif text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/80">{body}</p>
          </div>
        ))}
      </div>
      <footer className="mt-10 flex flex-wrap items-baseline justify-between gap-4 border-t border-line pt-6 text-sm text-muted">
        <p>
          A statistical signal, not an accusation. Data: <a className="underline underline-offset-2 hover:text-accent" href="https://www.pbs.gov.pk/price-statistics/" target="_blank" rel="noopener noreferrer">Pakistan Bureau of Statistics</a> (weekly SPI).
          Not an official PBS product.
        </p>
        <p>Built by Massab Ibrahim · Edversity AI Solutions Engineers course (Cohort 1) · updated {dateLabel(summary.generated_at)}</p>
      </footer>
    </Section>
  );
}
