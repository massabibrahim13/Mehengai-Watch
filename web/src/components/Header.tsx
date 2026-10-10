// Sticky top bar: wordmark, section links, search (Ctrl+K).
export function Header({ onSearch }: { onSearch: () => void }) {
  const links = [
    ["This week", "#this-week"],
    ["Map", "#map"],
    ["Set prices", "#set-prices"],
    ["Headlines", "#headlines"],
    ["Method", "#method"],
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-8">
        <a href="#top" className="flex items-baseline gap-2">
          <span className="whitespace-nowrap font-serif text-xl font-semibold tracking-tight sm:text-2xl">Mehngai Watch</span>
          <span className="hidden text-sm text-muted sm:inline" lang="ur">مہنگائی واچ</span>
        </a>
        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Sections">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <button type="button" onClick={onSearch}
          className="bubble ml-auto flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted hover:border-accent lg:ml-0">
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m14 14 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <span className="hidden sm:inline">Search 51 items</span>
          <span className="sm:hidden">Search</span>
          <kbd className="hidden rounded-md border border-line px-1.5 font-mono text-[11px] sm:inline">Ctrl K</kbd>
        </button>
      </div>
    </header>
  );
}
