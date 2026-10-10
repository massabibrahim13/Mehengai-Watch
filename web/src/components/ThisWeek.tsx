// "This week": unusual-move story cards, then the biggest movers across all 51 items.
import { motion } from "motion/react";
import { moneyExact, pct } from "../lib/format";
import type { Item, Mover, Summary } from "../types";
import { ChangePill, Price, Section, Sparkline } from "./ui";

const SEVERITY_STYLE: Record<string, string> = {
  extreme: "bg-up text-white",
  unusual: "bg-up/15 text-up",
  watch: "bg-ink/8 text-ink",
};

export function ThisWeek({ summary, items, onOpen }: { summary: Summary; items: Item[]; onOpen: (id: string) => void }) {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  return (
    <Section id="this-week" kicker="This week" title="Unusual price moves"
      aside={<p className="max-w-sm text-sm text-muted">Flagged when a weekly change is far outside the item's own normal range over the past year.</p>}>
      {summary.unusual.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-muted">Every market-priced item moved within its normal weekly range.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {summary.unusual.map((u, i) => {
            const item = byId[u.item_id];
            return (
              <motion.article key={u.item_id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.08 }}
                className="group rounded-3xl border border-line bg-surface p-6 transition-shadow hover:shadow-[0_0_0_5px_color-mix(in_srgb,var(--color-accent)_14%,transparent)]">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => onOpen(u.item_id)} className="text-left">
                    <h3 className="font-serif text-2xl font-semibold tracking-tight group-hover:text-accent">{item.name}</h3>
                    <p className="text-sm text-muted">{item.category} · {item.unit}</p>
                  </button>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_STYLE[u.severity]}`}>
                    {u.direction === "up" ? "▲" : "▼"} {u.severity_word} {u.direction === "up" ? "rise" : "fall"}
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-3">
                  <Price value={u.price} className="text-4xl" />
                  <ChangePill value={u.change_pct} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  was {moneyExact(u.previous_price)} · usually moves {u.typical_move_pct ?? "–"}% a week
                </p>
                <Sparkline values={item.spark} up={u.direction === "up"} className="mt-4 h-14 w-full" />
                <p className="text-[11px] uppercase tracking-wider text-muted">last 26 weeks</p>
                <p className="mt-4 leading-relaxed text-ink/85">{u.explanation}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted">
                    {u.explanation_source === "llm" ? "Written by AI from the numbers above · every number checked" : "Standard summary"}
                  </span>
                  <button type="button" onClick={() => onOpen(u.item_id)} className="bubble rounded-full border border-line px-3 py-1 text-sm hover:border-accent hover:text-accent">
                    Open {item.name.replace(/\s*\(.*\)$/, "").toLowerCase()} →
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function MoverList({ title, rows, items, onOpen, max }: { title: string; rows: Mover[]; items: Record<string, Item>; onOpen: (id: string) => void; max: number }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-muted">{title}</h3>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.item_id}>
            <button type="button" onClick={() => onOpen(r.item_id)} className="bubble grid w-full grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-ink/5">
              <span className="truncate text-sm">{items[r.item_id].name}</span>
              <span className="h-2.5 rounded-full bg-ink/5">
                <motion.span className={`block h-full rounded-full ${r.change_pct > 0 ? "bg-up" : "bg-down"}`}
                  initial={{ width: 0 }} whileInView={{ width: `${(Math.abs(r.change_pct) / max) * 100}%` }}
                  viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }} />
              </span>
              <span className={`w-16 text-right font-mono text-sm tabular ${r.change_pct > 0 ? "text-up" : "text-down"}`}>
                {r.change_pct > 0 ? "▲" : "▼"} {pct(Math.abs(r.change_pct)).slice(1)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Movers({ summary, items, onOpen }: { summary: Summary; items: Item[]; onOpen: (id: string) => void }) {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const { rises, falls } = summary.movers;
  const max = Math.max(...[...rises, ...falls].map((m) => Math.abs(m.change_pct)), 0.1);
  return (
    <Section id="movers" kicker="All 51 items" title="Biggest moves this week"
      aside={<p className="max-w-sm text-sm text-muted">Plain % changes. Vegetables top this list most weeks because they always swing; that's why "unusual" is judged per item.</p>}>
      <div className="grid gap-8 rounded-3xl border border-line bg-surface p-6 md:grid-cols-2">
        <MoverList title="Rises" rows={rises} items={byId} onOpen={onOpen} max={max} />
        <MoverList title="Falls" rows={falls} items={byId} onOpen={onOpen} max={max} />
      </div>
    </Section>
  );
}

