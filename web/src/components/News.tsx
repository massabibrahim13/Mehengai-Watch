// News: interactive cards. A featured story, two side stories, then a scrollable row. Each card shows
// the live price of the item it mentions (click it to open that item) — news and prices side by side.
// Headlines are context ("possibly related"), never presented as the cause of a price move.
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { shortName, timeAgo } from "../lib/format";
import type { Item, NewsItem } from "../types";
import { Change, ItemIcon, Price, SectionHead, Sparkline, Tabs } from "./ui";

const TOPICS = ["All", "Food & goods", "Energy", "Inflation"] as const;
function Source({ n }: { n: NewsItem }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <span className="font-semibold uppercase tracking-[0.06em] text-ink">{n.source}</span>
      <span className="font-mono">{timeAgo(n.published)}</span>
    </span>
  );
}

/** The "price context" strip under a headline. */
function PriceStrip({ item, onOpen }: { item: Item; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(item.item_id)}
      className="chip flex w-full items-center gap-3 rounded-[2px] border border-line px-3 py-2 text-left hover:bg-soft">
      <ItemIcon item={item} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{shortName(item.name)}</span>
        <span className="text-xs text-muted">{item.unit}</span>
      </span>
      <Sparkline values={item.spark.slice(-13)} className="h-7 w-16" />
      <span className="text-right text-sm">
        <Price value={item.price} className="block" />
        <Change value={item.change_pct} className="text-xs" />
      </span>
    </button>
  );
}

function NewsCard({ n, items, onOpen, featured = false }: { n: NewsItem; items: Record<string, Item>; onOpen: (id: string) => void; featured?: boolean }) {
  const linked = n.item_ids.map((id) => items[id]).filter(Boolean).slice(0, featured ? 2 : 1);
  return (
    <article className={`panel lift group flex h-full flex-col p-5 ${featured ? "md:p-6" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Source n={n} />
        {n.topics[0] && <span className="label">{n.topics[0]}</span>}
      </div>
      <a href={n.link} target="_blank" rel="noopener noreferrer"
        className={`mt-3 block font-serif font-bold leading-snug group-hover:underline group-hover:underline-offset-4 ${featured ? "text-2xl md:text-[26px]" : "text-[16px]"}`}>
        {n.title}
        <ArrowUpRight size={featured ? 20 : 15} className="ml-1 inline align-[-0.1em] text-muted" aria-hidden="true" />
      </a>
      {featured && linked[0] && (
        <div className="mt-5 hidden md:block">
          <p className="label">{shortName(linked[0].name)} · national average, last 6 months</p>
          <Sparkline values={linked[0].spark} className="mt-1 h-28 w-full" />
        </div>
      )}
      <div className="mt-auto space-y-2 pt-5">
        {linked.map((it) => <PriceStrip key={it.item_id} item={it} onOpen={onOpen} />)}
        {!linked.length && <p className="text-xs text-muted">General inflation news</p>}
      </div>
    </article>
  );
}

export function News({ news, items, onOpen }: { news: NewsItem[]; items: Item[]; onOpen: (id: string) => void }) {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("All");
  const rail = useRef<HTMLDivElement>(null);
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const list = news.filter((n) => topic === "All" || n.topics.includes(topic.toLowerCase()));
  const [lead, side1, side2, ...rest] = list;
  const scroll = (dir: number) => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section>
      <SectionHead id="news" eyebrow="In the news" title="Price news" sub="Headlines from Pakistani news sites, next to the live price of what they mention."
        aside={<Tabs value={topic} options={TOPICS} onChange={setTopic} label="News topic" />} />
      {!lead ? (
        <p className="panel p-6 text-muted">No headlines on this topic in the last few weeks.</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <NewsCard n={lead} items={byId} onOpen={onOpen} featured />
            <div className="grid gap-4">
              {side1 && <NewsCard n={side1} items={byId} onOpen={onOpen} />}
              {side2 && <NewsCard n={side2} items={byId} onOpen={onOpen} />}
            </div>
          </div>
          {rest.length > 0 && (
            <div className="relative mt-4">
              {/* padding inside the scroller leaves room for the hover lift + ring, which would otherwise be clipped */}
              <div ref={rail} className="no-scrollbar -mx-1.5 -mt-2 flex snap-x snap-mandatory scroll-px-1.5 gap-4 overflow-x-auto scroll-smooth px-1.5 pb-3 pt-2">
                {rest.map((n) => (
                  <div key={n.link} className="w-[300px] shrink-0 snap-start md:w-[340px]">
                    <NewsCard n={n} items={byId} onOpen={onOpen} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" aria-label="Previous headlines" onClick={() => scroll(-1)} className="chip flex h-9 w-9 items-center justify-center rounded-[2px] border border-line bg-panel"><ChevronLeft size={18} /></button>
                <button type="button" aria-label="More headlines" onClick={() => scroll(1)} className="chip flex h-9 w-9 items-center justify-center rounded-[2px] border border-line bg-panel"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-muted">Matched to tracked items by keywords. Shown as possibly related news, not as causes.</p>
    </section>
  );
}
