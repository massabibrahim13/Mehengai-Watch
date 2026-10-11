// "Prices": every item PBS tracks, as a sortable list or as a heatmap (one section, two views).
import { useState } from "react";
import type { Item } from "../types";
import { Heatmap } from "./Heatmap";
import { Segmented, SectionHead } from "./ui";
import { Watchlist } from "./Watchlist";

const VIEWS = ["List", "Heatmap"] as const;

export function Prices({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const [view, setView] = useState<(typeof VIEWS)[number]>("List");
  return (
    <section>
      <SectionHead id="prices" eyebrow="All 51 items" title="Every price PBS tracks"
        sub="This week's national average price of each item. Sort by any column, or switch to the heatmap; click an item for its history, city prices and news."
        aside={<Segmented value={view} options={VIEWS} onChange={setView} label="View" />} />
      {view === "List" ? <Watchlist items={items} onOpen={onOpen} /> : <Heatmap items={items} onOpen={onOpen} />}
    </section>
  );
}
