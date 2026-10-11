// Footer: brand, data credit and the one rule (a statistical signal, never an accusation).
import { dateLabel } from "../lib/format";
import type { Summary } from "../types";
import { Logo } from "./TopBar";

export function Footer({ summary }: { summary: Summary }) {
  return (
    <footer className="border-t border-line bg-panel">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:grid-cols-[1.2fr_1fr] md:px-8">
        <div>
          <Logo className="text-ink" />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            An early warning for unusual price moves in Pakistan's essentials. A statistical signal, never an accusation:
            it shows what moved and by how much, not who is to blame.
          </p>
        </div>
        <div className="space-y-2 text-sm text-muted md:text-right">
          <p>
            Data:{" "}
            <a className="font-semibold text-ink underline-offset-4 hover:underline" href="https://www.pbs.gov.pk/price-statistics/" target="_blank" rel="noopener noreferrer">
              Pakistan Bureau of Statistics
            </a>{" "}
            weekly SPI. Not an official PBS product.
          </p>
          <p>Updated {dateLabel(summary.generated_at)} · data from {dateLabel(summary.data_start)}</p>
          <p>Built by Massab Ibrahim · Edversity AI Solutions Engineers course</p>
        </div>
      </div>
    </footer>
  );
}
