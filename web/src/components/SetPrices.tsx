// Government-set prices and packaged-goods price revisions: plain "before → after" boards.
import { moneyExact } from "../lib/format";
import type { Item, PriceChange, Summary } from "../types";
import { ChangePill, Section } from "./ui";

function Board({ title, note, rows, empty, items, onOpen }: {
  title: string; note: string; rows: PriceChange[]; empty: string; items: Record<string, Item>; onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-line bg-surface">
      <div className="border-b border-line px-6 py-4">
        <h3 className="font-serif text-xl font-semibold">{title}</h3>
        <p className="text-sm text-muted">{note}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-5 text-muted">{empty}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.item_id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => onOpen(r.item_id)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-6 py-4 text-left transition-colors hover:bg-ink/[0.03] sm:grid-cols-[1fr_auto_auto]">
                <span>
                  <span className="font-medium">{items[r.item_id].name}</span>
                  <span className="block text-xs text-muted">{items[r.item_id].unit}</span>
                </span>
                <span className="order-3 col-span-2 font-mono text-sm tabular sm:order-none sm:col-span-1">
                  <span className="text-muted">{moneyExact(r.previous_price)} → </span>{moneyExact(r.price)}
                </span>
                <ChangePill value={r.change_pct} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SetPrices({ summary, items, onOpen }: { summary: Summary; items: Item[]; onOpen: (id: string) => void }) {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  return (
    <Section id="set-prices" kicker="Set prices" title="Decided, not discovered"
      aside={<p className="max-w-sm text-sm text-muted">These prices are set by the government or by companies, so a change is a decision, never an "anomaly".</p>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Board title="Government price changes" note={`Petrol, diesel, LPG, electricity, gas, phone · changes of ${summary.thresholds.administered}% or more`}
          rows={summary.government} empty="No government-set price changed this week." items={byId} onOpen={onOpen} />
        <Board title="Price revisions" note={`Packaged, branded and hotel prices · changes of ${summary.thresholds.fixed}% or more`}
          rows={summary.revisions} empty="No packaged or fixed-price item changed this week." items={byId} onOpen={onOpen} />
      </div>
    </Section>
  );
}
