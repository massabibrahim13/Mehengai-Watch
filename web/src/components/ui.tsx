// Shared building blocks for the fintech-style UI.
import {
  Bean, Carrot, Cigarette, Drumstick, Droplet, Flame, Fuel, Lightbulb, Milk, Package, Phone, Shirt,
  SprayCan, Trees, UtensilsCrossed, Wheat, Zap, type LucideIcon,
} from "lucide-react";
import { useId, type ReactNode } from "react";
import { arrow, pct, trend } from "../lib/format";
import type { Item } from "../types";

// ── icons: a calm round badge per item, like the logos next to tickers on trading sites ──
const BY_CATEGORY: Record<string, LucideIcon> = {
  "Staples": Wheat, "Meat & poultry": Drumstick, "Dairy & eggs": Milk, "Oil & ghee": Droplet, "Pulses": Bean,
  "Vegetables & fruit": Carrot, "Household": Package, "Packaged food": Package, "Prepared food": UtensilsCrossed,
  "Clothing & footwear": Shirt, "Energy & utilities": Zap,
};
const BY_ITEM: Record<string, LucideIcon> = {
  petrol: Fuel, diesel: Fuel, lpg: Flame, gas: Flame, electricity: Zap, telephone: Phone, firewood: Trees,
  cigarettes: Cigarette, energy_saver: Lightbulb, washing_soap: SprayCan, toilet_soap: SprayCan, matchbox: Flame,
};

export function ItemIcon({ item, size = "md" }: { item: Pick<Item, "item_id" | "category">; size?: "sm" | "md" | "lg" }) {
  const Icon = BY_ITEM[item.item_id] ?? BY_CATEGORY[item.category] ?? Package;
  const box = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const glyph = size === "lg" ? 22 : size === "sm" ? 14 : 17;
  return (
    <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-soft text-ink ring-1 ring-line`}>
      <Icon size={glyph} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}

// ── numbers ──
/** "▲ 5.7%" coloured by direction. `soft` adds a tinted background. */
export function Change({ value, soft = false, className = "" }: { value: number; soft?: boolean; className?: string }) {
  const t = trend(value);
  const colour = t === "up" ? "text-up" : t === "down" ? "text-down" : "text-muted";
  const tint = soft ? (t === "up" ? "bg-up/10" : t === "down" ? "bg-down/10" : "bg-soft") + " rounded-md px-1.5 py-0.5" : "";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${colour} ${tint} ${className}`}>
      <span className="text-[0.7em]">{arrow(t)}</span>
      {pct(Math.abs(value)).slice(1)}
    </span>
  );
}

/** Price with a small "Rs". */
export function Price({ value, className = "", decimals = 2 }: { value: number; className?: string; decimals?: number }) {
  return (
    <span className={`whitespace-nowrap font-semibold tracking-tight ${className}`}>
      <span className="mr-0.5 text-[0.62em] font-semibold text-muted">Rs</span>
      {value.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

/** Small area sparkline; colour follows the overall direction of the window (grey if it ends where it began). */
export function Sparkline({ values, className = "h-10 w-24", stroke }: { values: (number | null)[]; className?: string; stroke?: string }) {
  const id = `spark${useId().replace(/[^a-zA-Z0-9]/g, "")}`; // unique per sparkline, so gradients never collide
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v), flatLine = hi === lo, span = hi - lo || 1;
  const w = 120, h = 40;
  const pts = v.map((y, i) => [(i * w) / (v.length - 1), flatLine ? h / 2 : h - 3 - ((y - lo) / span) * (h - 6)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const t = trend((v[v.length - 1] / v[0] - 1) * 100);
  const colour = stroke ?? (t === "up" ? "var(--color-up)" : t === "down" ? "var(--color-down)" : "var(--color-muted)");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.22" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={colour} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

// ── layout ──
export function SectionHead({ id, eyebrow, title, sub, aside }: { id?: string; eyebrow?: string; title: string; sub?: string; aside?: ReactNode }) {
  return (
    <div id={id} className="mb-6 flex scroll-mt-24 flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>}
        <h2 className="font-display text-[30px] font-bold leading-tight tracking-[-0.03em] md:text-[40px]">{title}</h2>
        {sub && <p className="mt-2 max-w-2xl text-[15px] text-muted">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

export function Card({ children, className = "", interactive = false }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return <div className={`rounded-2xl border border-line bg-panel ${interactive ? "lift" : ""} ${className}`}>{children}</div>;
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl bg-soft p-1">
      {options.map((o) => (
        <button key={o} type="button" role="tab" aria-selected={o === value} onClick={() => onChange(o)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${o === value ? "bg-panel text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-ink/5 ${className}`} />;
}
