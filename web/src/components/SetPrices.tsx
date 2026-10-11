// Government-set prices and packaged-goods price revisions: "before -> after" lists.
import type { Item, PriceChange, Summary } from "../types";
import { Card, Change, ItemIcon, Price } from "./ui";

function Board({ title, note, rows, empty, items, onOpen }: {
  title: string; note: string; rows: PriceChange[]; empty: string; items: Record<string, Item>; onOpen: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="label text-ink">{title}</h3>
        <p className="mt-1 text-sm text-muted">{note}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-muted">{empty}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.item_id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => onOpen(r.item_id)}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-soft">
                <ItemIcon item={items[r.item_id]} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{items[r.item_id].name}</span>
                  <span className="text-xs text-muted">
                    <Price value={r.previous_price} className="font-medium text-muted" /> → <Price value={r.price} className="text-ink" /> {items[r.item_id].unit}
                  </span>
                </span>
                <Change value={r.change_pct} soft />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Government-set and company-set price changes this week (part of the "This week" section). */
export function SetPriceBoards({ summary, items, onOpen }: { summary: Summary; items: Item[]; onOpen: (id: string) => void }) {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  return (
    <div id="set-prices" className="mt-12 scroll-mt-24">
      <h3 className="font-serif text-2xl font-bold">Prices set by the government or companies</h3>
      <p className="mt-1 max-w-2xl text-[15px] text-muted">These change by decision, not by the market, so they are listed here rather than judged as unusual.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Board title="Government price changes" note={`Petrol, diesel, LPG, electricity, gas, phone · moves of ${summary.thresholds.administered}% or more`}
          rows={summary.government} empty="No government-set price changed this week." items={byId} onOpen={onOpen} />
        <Board title="Price revisions" note={`Packaged, branded and hotel prices · moves of ${summary.thresholds.fixed}% or more`}
          rows={summary.revisions} empty="No packaged or fixed-price item changed this week." items={byId} onOpen={onOpen} />
      </div>
    </div>
  );
}
