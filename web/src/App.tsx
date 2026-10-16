// The home page: a hero with interactive line waves, then five sections in reading order — This week, Prices,
// Cities, News, How it works, How we tested it. Holds "which item is open". Every number comes from public/data/.
import { useCallback, useEffect, useState } from "react";
import { ChatBubble } from "./components/ChatBubble";
import { CityMap } from "./components/CityMap";
import { Evidence } from "./components/Evidence";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { ItemPanel } from "./components/ItemPanel";
import { News } from "./components/News";
import { Overview } from "./components/Overview";
import { Prices } from "./components/Prices";
import { Statement } from "./components/Statement";
import { TopBar } from "./components/TopBar";
import { Skeleton } from "./components/ui";
import { useEvaluation, useGeo, useHomeData } from "./lib/data";

const MAP_DEFAULTS = ["wheat_flour", "sugar", "tomatoes", "onions", "chicken", "milk", "petrol"];

// Shareable item links: "#/item/sugar" opens that item. Section anchors ("#prices") are left alone.
const ITEM_HASH = /^#\/item\/([a-z0-9_]+)$/;
const itemFromHash = (): string | null => window.location.hash.match(ITEM_HASH)?.[1] ?? null;

export default function App() {
  const { data, error } = useHomeData();
  const geo = useGeo();
  const evaluation = useEvaluation();
  const [openItem, setOpenItem] = useState<string | null>(itemFromHash);
  const [mapItem, setMapItem] = useState<string | null>(null);
  const [overHero, setOverHero] = useState(true);
  const [focusSearch, setFocusSearch] = useState(0); // bump to put the cursor in the search box

  // Ctrl/Cmd+K or "/" jumps to the search box (unless you're typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select");
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setFocusSearch((n) => n + 1);
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

  // The address bar follows the open item: Back closes the panel, Forward reopens it, links open it directly.
  useEffect(() => {
    const sync = () => setOpenItem(itemFromHash());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  // A link to an item that doesn't exist: drop it quietly.
  useEffect(() => {
    if (data && openItem && !data.items.some((i) => i.item_id === openItem)) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setOpenItem(null);
    }
  }, [data, openItem]);

  const open = useCallback((id: string) => {
    const url = `#/item/${id}`;
    // switching items inside the panel replaces the entry, so one Back always closes the panel
    if (itemFromHash()) window.history.replaceState({ mwItem: true }, "", url);
    else window.history.pushState({ mwItem: true }, "", url);
    setOpenItem(id);
  }, []);
  const close = useCallback(() => {
    if (window.history.state?.mwItem) window.history.back(); // we added the entry: step back off it
    else window.history.replaceState(null, "", window.location.pathname + window.location.search); // arrived by link
    setOpenItem(null);
  }, []);
  const search = useCallback(() => setFocusSearch((n) => n + 1), []);

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
          <div className="h-12 w-2/3 animate-pulse bg-ink/5" />
          <div className="h-6 w-1/2 animate-pulse bg-ink/5" />
          <Skeleton className="h-14 w-full max-w-xl" />
        </div>
      </div>
    );
  }

  const { summary, items, cities, news, index } = data;
  const featured = [...new Set([...summary.unusual.map((u) => u.item_id), ...MAP_DEFAULTS])].slice(0, 7);

  return (
    <>
      <TopBar overHero={overHero} summary={summary} items={items} onOpen={open} focusSearch={focusSearch} />
      <Hero summary={summary} items={items} onOpen={open} onSearch={search} />
      <main className="relative bg-bg">
        <div className="mx-auto max-w-7xl space-y-28 px-4 pb-32 md:space-y-36 md:px-8">
          <Overview summary={summary} items={items} index={index} onOpen={open} />
          <Prices items={items} onOpen={open} />
          <CityMap cities={cities} items={items} geo={geo} featured={featured} item={mapItem ?? featured[0]} setItem={setMapItem} onOpen={open} />
          <News news={news} items={items} onOpen={open} />
          <Statement summary={summary} items={items.length} cities={cities.cities.length} />
          <Evidence evaluation={evaluation} items={items} />
        </div>
      </main>
      <Footer summary={summary} />
      <ChatBubble show={!overHero && !openItem} items={items} cities={cities} summary={summary} />
      <ItemPanel itemId={openItem} items={items} cities={cities} news={news} onClose={close} onOpen={open} />
    </>
  );
}
