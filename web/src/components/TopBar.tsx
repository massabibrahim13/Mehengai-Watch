// Fixed header: logo, the five sections (the one on screen is highlighted; "This week" carries a count of
// unusual moves), a plain search box, the day/night switch, and a menu on phones.
// Transparent over the hero, solid once you scroll past it.
import { Menu, Moon, Search, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../lib/theme";
import type { Item, Summary } from "../types";
import { SearchBar } from "./SearchBar";

export const SECTIONS = [
  ["This week", "overview"],
  ["Prices", "prices"],
  ["Cities", "cities"],
  ["News", "news"],
  ["How it works", "method"],
] as const;

export function Logo({ className = "" }: { className?: string }) {
  return (
    <a href="#top" className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-[2px] bg-ink text-bg">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true"><path d="M3 17h4V11h4v3h4V7h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" /></svg>
      </span>
      <span className="font-serif text-[18px] font-bold tracking-[-0.01em]">Mehngai Watch</span>
      <span lang="ur" dir="rtl" className="hidden whitespace-nowrap font-urdu text-[15px] leading-none text-current opacity-55 2xl:inline">مہنگائی واچ</span>
    </a>
  );
}

/** Which section is on screen: the last one whose top has passed 35% of the window height. */
function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const onScroll = () => {
      let current: string | null = null;
      for (const [, id] of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.35) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return active;
}

export function TopBar({ overHero, summary, items, onOpen, focusSearch }: {
  overHero: boolean; summary: Summary; items: Item[]; onOpen: (id: string) => void; focusSearch: number;
}) {
  const { theme, toggle } = useTheme();
  const active = useActiveSection();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); // phones: the search row under the bar
  const inputRef = useRef<HTMLInputElement>(null);
  const alerts = summary.unusual.length;
  const solid = !overHero || menuOpen || (searchOpen && window.innerWidth < 1024); // phones: search row needs a solid bar

  // "Check a price", Ctrl+K and "/" ask for the search box
  useEffect(() => {
    if (!focusSearch) return;
    setMenuOpen(false);
    setSearchOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [focusSearch]);

  const link = (id: string) => `relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[14px] font-medium transition-colors ${
    active === id ? "text-ink" : "text-muted hover:text-ink"}`;
  const iconButton = "chip flex h-9 w-9 items-center justify-center rounded-[2px] border border-line text-muted hover:text-ink";

  return (
    <header className={`fixed inset-x-0 top-0 z-40 border-b text-ink transition-colors duration-300 ${solid ? "border-line bg-bg" : "border-transparent bg-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-8">
        <Logo />
        <nav aria-label="Sections" className="ml-4 hidden items-center lg:flex">
          {SECTIONS.map(([label, id]) => (
            <a key={id} href={`#${id}`} className={link(id)} aria-current={active === id ? "true" : undefined}>
              {label}
              {id === "overview" && alerts > 0 && (
                <span className="rounded-[2px] bg-up px-1.5 font-mono text-[11px] font-semibold leading-[18px] text-white" aria-label={`${alerts} price alerts this week`}>{alerts}</span>
              )}
              {active === id && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-accent" aria-hidden="true" />}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {/* one search box: in the bar on wide screens, in a row under the bar on phones */}
          <div className={`${searchOpen ? "block" : "hidden"} absolute inset-x-0 top-16 border-b border-line bg-bg px-4 py-3 text-ink lg:static lg:block lg:w-72 lg:border-0 lg:bg-transparent lg:p-0`}>
            <SearchBar items={items} onOpen={onOpen} inputRef={inputRef} onDone={() => setSearchOpen(false)} />
          </div>
          <button type="button" onClick={() => { setSearchOpen((s) => !s); setMenuOpen(false); requestAnimationFrame(() => inputRef.current?.focus()); }}
            aria-label="Search items" aria-expanded={searchOpen} className={`${iconButton} lg:hidden`}>
            <Search size={17} />
          </button>
          <button type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "day (light)" : "night (dark)"} mode`}
            title={theme === "dark" ? "Day mode" : "Night mode"} className={iconButton}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" onClick={() => { setMenuOpen((m) => !m); setSearchOpen(false); }} aria-label="Menu" aria-expanded={menuOpen}
            className={`${iconButton} lg:hidden`}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav aria-label="Sections" className="border-t border-line bg-panel px-4 pb-4 pt-2 lg:hidden">
          {SECTIONS.map(([label, id]) => (
            <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}
              className={`flex items-center justify-between border-l-2 px-3 py-3 text-base font-medium ${active === id ? "border-accent bg-soft text-ink" : "border-transparent text-muted"}`}>
              {label}
              {id === "overview" && alerts > 0 && <span className="rounded-[2px] bg-up px-2 font-mono text-xs font-semibold leading-5 text-white">{alerts} alert{alerts === 1 ? "" : "s"}</span>}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
