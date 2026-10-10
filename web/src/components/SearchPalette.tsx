// Ctrl+K search: type an item in English, Roman Urdu or Urdu; arrows + Enter to open it.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { money } from "../lib/format";
import { findItems } from "../lib/search";
import type { Item } from "../types";
import { Change } from "./ui";

const SUGGESTIONS = ["aata", "cheeni", "petrol", "tamatar", "doodh", "bijli"];

export function SearchPalette({ open, items, onClose, onOpen }: {
  open: boolean; items: Item[]; onClose: () => void; onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => findItems(query, items), [query, items]);

  useEffect(() => {
    if (open) { setQuery(""); setActive(0); }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    onOpen(item.item_id);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") choose(results[active]);
    else if (e.key === "Escape") onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label="Search items" onClick={(e) => e.stopPropagation()}
            initial={{ y: -12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -12, scale: 0.98 }}
            className="w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Search 51 items: aata, cheeni, petrol, ٹماٹر …" aria-label="Search items"
              className="w-full border-b border-line bg-transparent px-6 py-4 text-lg outline-none placeholder:text-muted" />
            {query && results.length === 0 && (
              <p className="px-6 py-5 text-muted">No tracked item matches “{query}”. PBS's weekly survey covers 51 essentials.</p>
            )}
            {!query && (
              <div className="flex flex-wrap gap-2 px-6 py-5">
                <span className="text-sm text-muted">Try:</span>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => setQuery(s)} className="chip rounded-full border border-line px-3 py-0.5 text-sm hover:border-accent">{s}</button>
                ))}
              </div>
            )}
            <ul role="listbox" className="max-h-[50vh] overflow-auto py-2">
              {results.map((item, i) => (
                <li key={item.item_id} role="option" aria-selected={i === active}>
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(item)}
                    className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-6 py-2.5 text-left ${i === active ? "bg-soft" : ""}`}>
                    <span>
                      <span className="font-medium">{item.name}</span>
                      <span className="block text-xs text-muted">{item.category} · {item.unit}</span>
                    </span>
                    <span className="text-sm">{money(item.price)}</span>
                    <Change soft value={item.change_pct} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-6 py-2 text-xs text-muted">↑ ↓ to move · Enter to open · Esc to close</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
