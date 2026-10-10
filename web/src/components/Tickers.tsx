// The two moving strips: all 51 prices, and live price headlines. Both pause on hover/focus and
// stop under "reduce motion". The track is rendered twice so the loop is seamless.
import type { Item, NewsItem } from "../types";
import { arrow, money, pct, timeAgo, trend, trendText } from "../lib/format";

export function PriceTicker({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const sorted = [...items].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
  const track = (copy: number) =>
    sorted.map((it) => {
      const t = trend(it.change_pct);
      return (
        <button key={`${copy}-${it.item_id}`} type="button" onClick={() => onOpen(it.item_id)}
          tabIndex={copy === 0 ? 0 : -1} aria-hidden={copy === 1}
          className="flex shrink-0 items-baseline gap-2 rounded-full px-3 py-1 text-sm transition-colors hover:bg-ink/5">
          <span className="text-ink/80">{it.name}</span>
          <span className="font-mono tabular text-ink">{money(it.price)}</span>
          <span className={`font-mono text-xs tabular ${trendText(t)}`}>{arrow(t)} {pct(it.change_pct).replace(/^[+−±]/, "")}</span>
        </button>
      );
    });
  return (
    <div className="ticker overflow-hidden border-b border-line bg-surface/60" aria-label="This week's prices of all 51 items">
      <div className="ticker-track flex w-max animate-ticker py-1.5" style={{ ["--ticker-speed" as string]: "150s" }}>
        {track(0)}
        {track(1)}
      </div>
    </div>
  );
}

export function NewsStrip({ news }: { news: NewsItem[] }) {
  if (!news.length) return null;
  const list = news.slice(0, 12);
  const track = (copy: number) =>
    list.map((n) => (
      <a key={`${copy}-${n.link}`} href={n.link} target="_blank" rel="noopener noreferrer"
        tabIndex={copy === 0 ? 0 : -1} aria-hidden={copy === 1}
        className="group flex shrink-0 items-baseline gap-2 px-5">
        <span className="font-serif text-[15px] text-ink group-hover:text-accent group-hover:underline group-hover:underline-offset-4">{n.title}</span>
        <span className="text-xs text-muted">{n.source} · {timeAgo(n.published)}</span>
      </a>
    ));
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-3">
      <span className="flex shrink-0 items-center gap-2 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-paper">
        <span className="h-2 w-2 animate-pulse-ring rounded-full bg-live" />
        Live
      </span>
      <div className="ticker min-w-0 flex-1 overflow-hidden" aria-label="Latest price headlines">
        <div className="ticker-track flex w-max animate-ticker" style={{ ["--ticker-speed" as string]: "95s" }}>
          {track(0)}
          {track(1)}
        </div>
      </div>
    </div>
  );
}
