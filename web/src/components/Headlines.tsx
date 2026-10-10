// Headlines: topic filter with a sliding indicator, and news cards that re-flow smoothly when filtered.
// Headlines are shown as "possibly related" context, never as the cause of a price move.
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { timeAgo } from "../lib/format";
import type { Item, NewsItem } from "../types";
import { Section, Tag } from "./ui";

const TOPICS = ["All", "Food & goods", "Energy", "Inflation"] as const;

export function Headlines({ news, items, onOpen }: { news: NewsItem[]; items: Item[]; onOpen: (id: string) => void }) {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("All");
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const shown = news.filter((n) => topic === "All" || n.topics.includes(topic.toLowerCase())).slice(0, 9);

  return (
    <Section id="headlines" kicker="Headlines" title="What the news is saying"
      aside={
        <div className="flex rounded-full border border-line bg-surface p-1" role="tablist" aria-label="Filter headlines">
          {TOPICS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={t === topic} onClick={() => setTopic(t)}
              className="relative rounded-full px-3 py-1 text-sm">
              {t === topic && <motion.span layoutId="topic-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className={`relative ${t === topic ? "text-paper" : "text-muted hover:text-ink"}`}>{t}</span>
            </button>
          ))}
        </div>
      }>
      <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {shown.map((n) => (
            <motion.article key={n.link} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }}
              className="bubble group flex flex-col rounded-3xl border border-line bg-surface p-5 hover:border-accent/50">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="rounded-full border border-line px-2 py-0.5">{n.source}</span>
                <span>{timeAgo(n.published)}</span>
              </div>
              <a href={n.link} target="_blank" rel="noopener noreferrer"
                className="mt-3 font-serif text-lg font-medium leading-snug group-hover:text-accent">
                {n.title}
                <span className="ml-1 inline-block text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true">↗</span>
              </a>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                {n.item_ids.filter((id) => byId[id]).map((id) => (
                  <Tag key={id} onClick={() => onOpen(id)} title={`Open ${byId[id].name}`}>{byId[id].name}</Tag>
                ))}
                {n.item_ids.length === 0 && n.topics.includes("inflation") && <Tag>Inflation</Tag>}
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </motion.div>
      {shown.length === 0 && <p className="text-muted">No headlines on this topic in the last few weeks.</p>}
      <p className="mt-4 text-xs text-muted">
        From Dawn, Business Recorder, Express Tribune, ProPakistani, ARY News and APP, matched to tracked items by keywords.
        Shown as possibly related news, not as causes.
      </p>
    </Section>
  );
}
