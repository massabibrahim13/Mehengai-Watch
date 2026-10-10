// How it works + credits, on a band that mirrors the hero (white in light mode, near-black in dark).
import { dateLabel } from "../lib/format";
import type { Summary } from "../types";

export function Footer({ summary }: { summary: Summary }) {
  const steps = [
    ["Collected", `Every weekly PBS price report since ${dateLabel(summary.data_start)}: ${summary.weeks_of_data} weeks, 51 items, 17 cities, each number checked.`],
    ["Compared", "Each item against its own past year. A 10% week is ordinary for tomatoes but extreme for sugar. Tested on documented price shocks."],
    ["Explained", "An AI model writes the sentence from the numbers only. Code checks every number and blocks any claimed cause or blame."],
    ["Separated", "Petrol, power, gas and phone prices are set by the government; packaged goods by companies. Their changes are listed, never flagged."],
  ];
  return (
    <footer id="method" className="scroll-mt-16 border-t border-hero-line bg-hero text-hero-ink">
      <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">How Mehngai Watch works</h2>
        <p className="mt-2 max-w-2xl text-hero-muted">Statistics decide what is unusual. AI only puts it into words.</p>
        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-hero-line bg-hero-ink/[0.03] p-5">
              <span className="text-sm font-bold text-accent">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-hero-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-hero-line pt-6 text-sm text-hero-muted">
          <p>
            A statistical signal, not an accusation. Data:{" "}
            <a className="font-semibold text-hero-ink underline-offset-4 hover:underline" href="https://www.pbs.gov.pk/price-statistics/" target="_blank" rel="noopener noreferrer">
              Pakistan Bureau of Statistics
            </a>{" "}
            weekly SPI. Not an official PBS product.
          </p>
          <p>Built by Massab Ibrahim · Edversity AI Solutions Engineers course · updated {dateLabel(summary.generated_at)}</p>
        </div>
      </div>
    </footer>
  );
}
