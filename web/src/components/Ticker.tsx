// A full-width moving band of all 51 prices, biggest weekly moves first. Pauses on hover; click opens the item.
import { arrow, money, pct, trend } from "../lib/format";
import type { Item } from "../types";
import { ItemIcon } from "./ui";

export function Ticker({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const sorted = [...items].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
  const row = (copy: number) =>
    sorted.map((it) => {
      const t = trend(it.change_pct);
      return (
        <button key={`${copy}-${it.item_id}`} type="button" onClick={() => onOpen(it.item_id)} tabIndex={copy ? -1 : 0} aria-hidden={copy === 1}
          className="flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2 text-sm transition-colors hover:bg-soft">
          <ItemIcon item={it} size="sm" />
          <span className="font-semibold">{it.name}</span>
          <span className="text-muted">{money(it.price)}</span>
          <span className={`font-semibold ${t === "up" ? "text-up" : t === "down" ? "text-down" : "text-muted"}`}>
            {arrow(t)} {pct(Math.abs(it.change_pct)).slice(1)}
          </span>
        </button>
      );
    });
  return (
    <div className="ticker fade-x overflow-hidden border-y border-line bg-panel" aria-label="This week's prices of all 51 items">
      <div className="ticker-track flex w-max animate-ticker py-2">{row(0)}{row(1)}</div>
    </div>
  );
}
