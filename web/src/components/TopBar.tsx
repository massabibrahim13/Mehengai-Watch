// Fixed header: logo, section links (the "This week" link carries a count of this week's unusual moves), search,
// the day/night switch and the main button. Transparent over the hero, solid once you scroll past it.
import { Moon, Search, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";
import type { Summary } from "../types";

const LINKS = [
  ["This week", "#overview"],
  ["How it works", "#method"],
  ["Prices", "#watchlist"],
  ["Cities", "#cities"],
  ["News", "#news"],
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <a href="#top" className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] text-on-brand shadow-[0_6px_18px_-6px_var(--color-brand)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="M3 14c3-6 6 6 9 0s6-6 9 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="font-display text-[19px] font-bold tracking-[-0.02em]">Mehngai Watch</span>
      <span lang="ur" dir="rtl" className="hidden whitespace-nowrap font-urdu text-[15px] leading-none text-current opacity-55 xl:inline">مہنگائی واچ</span>
    </a>
  );
}

export function TopBar({ overHero, summary, onSearch }: { overHero: boolean; summary: Summary; onSearch: () => void }) {
  const { theme, toggle } = useTheme();
  const alerts = summary.unusual.length;
  const shell = overHero ? "border-transparent bg-transparent text-hero-ink" : "border-line bg-panel/85 text-ink backdrop-blur-xl";
  const link = overHero ? "text-hero-ink/75 hover:text-hero-ink" : "text-muted hover:text-ink";
  const field = overHero ? "border-hero-ink/15 bg-glass text-hero-muted hover:border-hero-ink/35" : "border-line bg-soft text-muted hover:border-accent";

  return (
    <header className={`fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300 ${shell}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-8">
        <Logo />
        <nav aria-label="Sections" className="ml-6 hidden items-center lg:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[15px] font-semibold transition-colors ${link}`}>
              {label}
              {href === "#overview" && alerts > 0 && (
                <span className="rounded-full bg-up px-1.5 text-[11px] font-bold leading-[18px] text-white" aria-label={`${alerts} unusual moves`}>{alerts}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onSearch} aria-label="Search items"
            className={`chip flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm xl:w-56 ${field}`}>
            <Search size={16} aria-hidden="true" />
            <span className="hidden xl:inline">Search items</span>
            <kbd className="ml-auto hidden rounded-md border border-current/25 px-1.5 text-[11px] font-semibold xl:inline">Ctrl K</kbd>
          </button>
          <button type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "day (light)" : "night (dark)"} mode`}
            title={theme === "dark" ? "Day mode" : "Night mode"}
            className={`chip flex h-10 w-10 items-center justify-center rounded-xl border ${field}`}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" onClick={onSearch}
            className="hidden h-10 items-center whitespace-nowrap rounded-xl bg-brand px-4 text-sm font-bold text-on-brand transition hover:brightness-110 sm:inline-flex">
            Check a price
          </button>
        </div>
      </div>
    </header>
  );
}
