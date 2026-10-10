// Fixed top bar: transparent over the hero, solid once you scroll past it.
import { Moon, Search, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

const LINKS = [
  ["Overview", "#overview"],
  ["Heatmap", "#heatmap"],
  ["Watchlist", "#watchlist"],
  ["Cities", "#cities"],
  ["News", "#news"],
  ["Method", "#method"],
];

export function TopBar({ overHero, onSearch }: { overHero: boolean; onSearch: () => void }) {
  const { theme, toggle } = useTheme();
  const shell = overHero
    ? "border-transparent bg-transparent text-hero-ink"
    : "border-line bg-panel/90 text-ink shadow-[0_1px_0_0_var(--color-line)] backdrop-blur-md";
  const muted = overHero ? "text-hero-muted hover:text-hero-ink hover:bg-hero-ink/5" : "text-muted hover:text-ink hover:bg-soft";
  const field = overHero ? "border-hero-ink/15 bg-hero-ink/5 text-hero-muted hover:border-hero-ink/30" : "border-line bg-soft text-muted hover:border-accent";

  return (
    <header className={`fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300 ${shell}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-8">
        <a href="#top" className="flex items-center gap-2.5 font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="M4 16l5-6 4 4 7-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="text-[17px]">Mehngai Watch</span>
        </a>
        <nav aria-label="Sections" className="ml-4 hidden items-center gap-0.5 lg:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${muted}`}>{label}</a>
          ))}
        </nav>
        <button type="button" onClick={onSearch}
          className={`chip ml-auto flex h-10 items-center gap-2 rounded-xl border px-3 text-sm md:w-64 ${field}`}>
          <Search size={16} aria-hidden="true" />
          <span className="hidden md:inline">Search items</span>
          <kbd className="ml-auto hidden rounded-md border border-current/20 px-1.5 text-[11px] font-semibold md:inline">Ctrl K</kbd>
        </button>
        <button type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className={`chip flex h-10 w-10 items-center justify-center rounded-xl border ${field}`}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
