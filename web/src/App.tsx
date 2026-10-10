// The home page: loads the exported JSON, holds "which item is open" and "is search open", and lays
// out the sections. Every number shown comes from the files in public/data/.
import { useCallback, useEffect, useState } from "react";
import { CityMap } from "./components/CityMap";
import { Header } from "./components/Header";
import { Headlines } from "./components/Headlines";
import { Hero } from "./components/Hero";
import { ItemPanel } from "./components/ItemPanel";
import { Method } from "./components/Method";
import { SearchPalette } from "./components/SearchPalette";
import { SetPrices } from "./components/SetPrices";
import { Movers, ThisWeek } from "./components/ThisWeek";
import { PriceTicker } from "./components/Tickers";
import { Skeleton } from "./components/ui";
import { useGeo, useHomeData } from "./lib/data";

const MAP_DEFAULTS = ["wheat_flour", "sugar", "tomatoes", "onions", "chicken", "milk", "petrol", "lpg"];

export default function App() {
  const { data, error } = useHomeData();
  const geo = useGeo();
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapItem, setMapItem] = useState<string | null>(null);

  // Ctrl/Cmd+K or "/" opens search (unless you're typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select");
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = useCallback((id: string) => setOpenItem(id), []);
  const close = useCallback(() => setOpenItem(null), []);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-24">
        <h1 className="font-serif text-3xl font-semibold">Data not found</h1>
        <p className="mt-3 text-muted">Couldn't load the exported data ({error}). Run <code className="font-mono">python -m mehngai.export</code> in the project folder, then reload.</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-16 md:px-8" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-96" />
      </main>
    );
  }

  const { summary, items, cities, news } = data;
  const featured = [...new Set([...summary.unusual.map((u) => u.item_id), ...MAP_DEFAULTS])].slice(0, 8);
  const currentMapItem = mapItem ?? featured[0];

  return (
    <>
      <Header onSearch={() => setSearchOpen(true)} />
      <PriceTicker items={items} onOpen={open} />
      <main className="mx-auto max-w-7xl space-y-20 px-4 pb-16 md:space-y-28 md:px-8">
        <Hero summary={summary} items={items} news={news} />
        <ThisWeek summary={summary} items={items} onOpen={open} />
        <CityMap cities={cities} items={items} geo={geo} featured={featured} item={currentMapItem} setItem={setMapItem} onOpen={open} />
        <Movers summary={summary} items={items} onOpen={open} />
        <SetPrices summary={summary} items={items} onOpen={open} />
        <Headlines news={news} items={items} onOpen={open} />
        <Method summary={summary} />
      </main>
      <ItemPanel itemId={openItem} items={items} cities={cities} news={news} onClose={close} onOpen={open} />
      <SearchPalette open={searchOpen} items={items} onClose={() => setSearchOpen(false)} onOpen={open} />
    </>
  );
}
