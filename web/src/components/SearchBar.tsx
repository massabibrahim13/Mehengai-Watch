// A plain search box: type an item (English, Roman Urdu or Urdu) and matching items appear in a list below.
// ↑/↓ to move, Enter to open, Esc to clear. Ctrl+K or "/" jumps here from anywhere on the page.
import { Search, X } from "lucide-react";
import { useMemo, useState, type RefObject } from "react";
import { money, shortName } from "../lib/format";
import { liveMatches } from "../lib/search";
import type { Item } from "../types";
import { Change } from "./ui";

export function SearchBar({ items, onOpen, inputRef, onDone, className = "" }: {
  items: Item[]; onOpen: (id: string) => void; inputRef: RefObject<HTMLInputElement | null>; onDone?: () => void; className?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => liveMatches(query, items), [query, items]);
  const open = focused && query.trim().length > 0;

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onOpen(item.item_id);
    setQuery("");
    inputRef.current?.blur();
    onDone?.();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault(); // the same key press must not reach the item panel's close button
      choose(results[active] ?? results[0]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      if (query) setQuery("");
      else { inputRef.current?.blur(); onDone?.(); }
    }
  };

  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input ref={inputRef} type="search" value={query} placeholder="Search: sugar, aata, petrol…"
        onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        role="combobox" aria-label="Search items" aria-expanded={open} aria-controls="search-results" aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `search-${results[active].item_id}` : undefined}
        className="h-9 w-full rounded-[2px] border border-line bg-overlay pl-9 pr-9 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-ink focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden" />
      {query && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery("")} aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink"><X size={15} /></button>
      )}
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-[2px] border border-line bg-overlay">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">No item matches "{query}". PBS tracks 51 essentials.</p>
          ) : (
            <ul id="search-results" role="listbox" aria-label="Matching items" className="max-h-[60vh] overflow-auto py-1">
              {results.map((item, i) => (
                <li key={item.item_id} id={`search-${item.item_id}`} role="option" aria-selected={i === active}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(item)}
                    className={`flex w-full items-center gap-3 border-l-2 px-4 py-2 text-left text-sm ${i === active ? "border-accent bg-soft" : "border-transparent"}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{shortName(item.name)}</span>
                      <span className="block truncate text-xs text-muted">{item.category} · {item.unit}</span>
                    </span>
                    <span className="font-mono text-ink">{money(item.price)}</span>
                    <Change value={item.change_pct} className="w-14 justify-end text-xs" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
