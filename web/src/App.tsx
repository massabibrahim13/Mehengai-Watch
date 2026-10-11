// The home page: a hero with interactive line waves, then this week's summary, the statement, and the sections. Holds "which item is open" and "is search open". Every number comes from public/data/.
import { useCallback, useEffect, useState } from "react";
import { CityMap } from "./components/CityMap";
import { FloatingFind } from "./components/FloatingFind";
import { Footer } from "./components/Footer";
import { Heatmap } from "./components/Heatmap";
import { Hero } from "./components/Hero";
import { ItemPanel } from "./components/ItemPanel";
import { News } from "./components/News";
import { Overview } from "./components/Overview";
import { SearchPalette } from "./components/SearchPalette";
import { SetPrices } from "./components/SetPrices";
import { Statement } from "./components/Statement";
import { Ticker } from "./components/Ticker";
import { TopBar } from "./components/TopBar";
import { Skeleton } from "./components/ui";
import { Watchlist } from "./components/Watchlist";
import { useGeo, useHomeData } from "./lib/data";

const MAP_DEFAULTS = ["wheat_flour", "sugar", "tomatoes", "onions", "chicken", "milk", "petrol"];

export default function App() {
  const { data, error } = useHomeData();
  const geo = useGeo();
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapItem, setMapItem] = useState<string | null>(null);
  const [overHero, setOverHero] = useState(true);

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

  // The top bar is transparent over the hero and solid once the hero's faded bottom reaches the 64px bar.
  useEffect(() => {
    const onScroll = () => {
      const hero = document.getElementById("top");
      setOverHero(!!hero && hero.getBoundingClientRect().bottom - 120 > 64);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [data]);

  const open = useCallback((id: string) => setOpenItem(id), []);
  const close = useCallback(() => setOpenItem(null), []);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-24">
        <h1 className="text-3xl font-bold">Data not found</h1>
        <p className="mt-3 text-muted">Couldn't load the exported data ({error}). Run <code>python -m mehngai.export</code> in the project folder, then reload.</p>
      </main>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-hero px-4 pt-32 md:px-8" aria-busy="true">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-hero-ink/5" />
          <div className="h-6 w-1/2 animate-pulse rounded-2xl bg-hero-ink/5" />
          <Skeleton className="h-14 w-full max-w-xl bg-hero-ink/5" />
        </div>
      </div>
    );
  }

  const { summary, items, cities, news, index } = data;
  const featured = [...new Set([...summary.unusual.map((u) => u.item_id), ...MAP_DEFAULTS])].slice(0, 7);

  return (
    <>
      <TopBar overHero={overHero} summary={summary} onSearch={() => setSearchOpen(true)} />
      <Hero summary={summary} items={items} onOpen={open} onSearch={() => setSearchOpen(true)} />
      <main className="relative bg-bg">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Overview summary={summary} items={items} index={index} onOpen={open} />
        </div>
        <div className="mt-14 md:mt-20"><Ticker items={items} onOpen={open} /></div>
        <div className="mx-auto max-w-7xl space-y-24 px-4 pb-28 pt-20 md:space-y-32 md:px-8 md:pt-28">
          <Statement summary={summary} items={items.length} cities={cities.cities.length} />
          <Heatmap items={items} onOpen={open} />
          <Watchlist items={items} onOpen={open} />
          <CityMap cities={cities} items={items} geo={geo} featured={featured} item={mapItem ?? featured[0]} setItem={setMapItem} onOpen={open} />
          <News news={news} items={items} onOpen={open} />
          <SetPrices summary={summary} items={items} onOpen={open} />
        </div>
      </main>
      <Footer summary={summary} />
      <FloatingFind show={!overHero && !openItem && !searchOpen} onSearch={() => setSearchOpen(true)} />
      <ItemPanel itemId={openItem} items={items} cities={cities} news={news} onClose={close} onOpen={open} />
      <SearchPalette open={searchOpen} items={items} onClose={() => setSearchOpen(false)} onOpen={open} />
    </>
  );
}
