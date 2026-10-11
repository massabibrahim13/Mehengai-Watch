// The "List" view of the Prices section: all 51 items in a sortable table with category tabs. Click a row to open it.
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { shortName } from "../lib/format";
import type { Item } from "../types";
import { Card, Change, ItemIcon, Price, Sparkline, Tabs } from "./ui";

type SortKey = "name" | "price" | "change_pct" | "yoy_pct";
const TYPE_LABEL = { market: "Market price", fixed: "fixed price", administered: "set by government" } as const;
// same words as the hero cards and the weekly report (python: explain/facts.py SEVERITY_WORDS)
const SEVERITY_WORD: Record<string, string> = { watch: "notable", unusual: "unusual", extreme: "extreme" };
const FIRST = 10; // rows shown before "Show all"

export function Watchlist({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  const tabs = useMemo(() => ["All", ...[...new Set(items.map((i) => i.category))].sort()], [items]);
  const [tab, setTab] = useState("All");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "change_pct", desc: true });
  const [all, setAll] = useState(false);

  const rows = useMemo(() => {
    const list = items.filter((i) => tab === "All" || i.category === tab);
    const val = (i: Item) => (sort.key === "name" ? i.name : i[sort.key] ?? -Infinity);
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return sort.desc ? -c : c;
    });
  }, [items, tab, sort]);

  const Header = ({ k, label, className = "" }: { k: SortKey; label: string; className?: string }) => (
    <th scope="col" className={`px-3 md:px-4 py-3 font-semibold ${className}`} aria-sort={sort.key === k ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== "name" }))}
        className={`inline-flex items-center gap-1 uppercase hover:text-ink ${sort.key === k ? "text-ink" : ""}`}>
        {label}
        {sort.key === k && (sort.desc ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}
      </button>
    </th>
  );

  return (
    <div>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 pt-3">
          <Tabs value={tab} options={tabs} onChange={setTab} label="Category" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm md:min-w-[760px]">
            <thead className="label">
              <tr className="border-b border-line">
                <Header k="name" label="Item" />
                <Header k="price" label="Price" className="text-right" />
                <Header k="change_pct" label="1 week" className="text-right" />
                <Header k="yoy_pct" label="1 year" className="hidden text-right md:table-cell" />
                <th scope="col" className="hidden px-3 md:px-4 py-3 font-semibold md:table-cell">Last 6 months</th>
              </tr>
            </thead>
            <tbody>
              {(all ? rows : rows.slice(0, FIRST)).map((it) => (
                <tr key={it.item_id} onClick={() => onOpen(it.item_id)} className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-soft">
                  <td className="px-3 md:px-4 py-3">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(it.item_id); }} className="flex items-center gap-3 text-left">
                      <ItemIcon item={it} size="sm" />
                      <span>
                        <span className="block font-semibold">
                          <span className="md:hidden">{shortName(it.name)}</span><span className="hidden md:inline">{it.name}</span>
                          {it.flag && <span className={`ml-2 rounded-[2px] px-1.5 py-0.5 align-[0.1em] text-[11px] font-bold ${it.change_pct >= 0 ? "bg-up/10 text-up" : "bg-down/10 text-down"}`}>{SEVERITY_WORD[it.flag]}</span>}
                        </span>
                        <span className="text-xs text-muted">{it.unit}{it.price_type !== "market" && ` · ${TYPE_LABEL[it.price_type]}`}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 md:px-4 py-3 text-right"><Price value={it.price} /></td>
                  <td className="px-3 md:px-4 py-3 text-right"><Change value={it.change_pct} soft /></td>
                  <td className="hidden px-3 md:px-4 py-3 text-right md:table-cell">{it.yoy_pct === null ? <span className="text-muted">–</span> : <Change value={it.yoy_pct} />}</td>
                  <td className="hidden px-3 md:px-4 py-2 md:table-cell"><Sparkline values={it.spark} className="h-9 w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > FIRST && (
          <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all}
            className="flex w-full items-center justify-center gap-1.5 border-t border-line py-3 text-sm font-medium text-muted transition-colors hover:bg-soft hover:text-ink">
            {all ? "Show fewer" : `Show all ${rows.length} items`}
            <ChevronDown size={16} className={`transition-transform ${all ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        )}
      </Card>
    </div>
  );
}
