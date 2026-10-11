// Fixed header: this week's alert bar (folds away once you scroll; can be closed), then the nav — transparent over
// the hero, solid once you scroll past it.
import { Moon, Search, Sun, X, Zap } from "lucide-react";
import { useState } from "react";
import { shortName } from "../lib/format";
import { useTheme } from "../lib/theme";
import type { Item, Summary } from "../types";

const LINKS = [
  ["This week", "#overview"],
  ["How it works", "#method"],
  ["Prices", "#watchlist"],
  ["Cities", "#cities"],
  ["News", "#news"],
];
const DISMISS_KEY = "mw-alert-dismissed";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <a href="#top" className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] text-on-brand shadow-[0_6px_18px_-6px_var(--color-brand)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="M4 16l5-6 4 4 7-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="font-display text-[19px] font-bold tracking-[-0.02em]">Mehngai Watch</span>
      <span lang="ur" dir="rtl" className="hidden whitespace-nowrap font-urdu text-[15px] leading-none text-current opacity-55 xl:inline">مہنگائی واچ</span>
    </a>
  );
}

function AlertBar({ summary, items, hidden, onClose }: { summary: Summary; items: Item[]; hidden: boolean; onClose: () => void }) {
  const byId = Object.fromEntries(items.map((i) => [i.item_id, i]));
  const moves = summary.unusual.slice(0, 3).map((u) => `${shortName(byId[u.item_id].name)} ${u.direction === "up" ? "▲" : "▼"}${Math.abs(u.change_pct).toFixed(1)}%`);
  return (
    <div className={`grid transition-[grid-template-rows] duration-300 ${hidden || !moves.length ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
      <div className="overflow-hidden">
        <div className="relative flex h-10 items-center justify-center gap-3 bg-alert px-10 text-sm font-semibold text-white">
          <Zap size={15} className="shrink-0 fill-current" aria-hidden="true" />
          <span className="truncate sm:hidden">{moves.length} unusual move{moves.length > 1 ? "s" : ""} this week</span>
          <span className="hidden truncate sm:inline">This week: {moves.join(" · ")} moved unusually</span>
          <a href="#overview" className="inline-flex shrink-0 items-center gap-1 font-extrabold uppercase tracking-wide underline-offset-4 hover:underline">See why ›</a>
          <button type="button" onClick={onClose} aria-label="Close this alert" className="absolute right-3 rounded-full p-1 hover:bg-white/15"><X size={16} /></button>
        </div>
      </div>
    </div>
  );
}

export function TopBar({ overHero, scrolled, summary, items, onSearch }: {
  overHero: boolean; scrolled: boolean; summary: Summary; items: Item[]; onSearch: () => void;
}) {
  const { theme, toggle } = useTheme();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const close = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* not critical */ }
  };
  const shell = overHero ? "border-transparent bg-transparent text-hero-ink" : "border-line bg-panel/85 text-ink backdrop-blur-xl";
  const link = overHero ? "text-hero-ink/75 hover:text-hero-ink" : "text-muted hover:text-ink";
  const field = overHero ? "border-hero-ink/15 bg-glass text-hero-muted hover:border-hero-ink/35" : "border-line bg-soft text-muted hover:border-accent";

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <AlertBar summary={summary} items={items} hidden={dismissed || scrolled} onClose={close} />
      <div className={`border-b transition-colors duration-300 ${shell}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-8">
          <Logo />
          <button type="button" onClick={onSearch}
            className={`chip ml-5 hidden h-10 w-52 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm backdrop-blur-md lg:flex ${field}`}>
            <Search size={16} aria-hidden="true" />
            <span>Search (Ctrl+K)</span>
          </button>
          <nav aria-label="Sections" className="ml-3 hidden items-center xl:flex">
            {LINKS.map(([label, href]) => (
              <a key={href} href={href} className={`whitespace-nowrap px-3 py-2 text-[15px] font-semibold transition-colors ${link}`}>{label}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onSearch} aria-label="Search items"
              className={`chip flex h-10 w-10 items-center justify-center rounded-full border lg:hidden ${field}`}>
              <Search size={17} />
            </button>
            <button type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "day (light)" : "night (dark)"} mode`}
              title={theme === "dark" ? "Day mode" : "Night mode"}
              className={`chip flex h-10 w-10 items-center justify-center rounded-full border ${field}`}>
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button type="button" onClick={onSearch}
              className="slant ml-1 hidden h-10 items-center whitespace-nowrap rounded-l-xl bg-[linear-gradient(100deg,var(--color-brand),var(--color-brand-2))] pl-5 pr-3 text-sm font-bold text-on-brand [--tail:var(--color-brand-2)] transition-transform hover:-translate-y-px sm:inline-flex">
              Check a price
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
