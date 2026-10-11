// Shared building blocks for the institutional / editorial data look: flat panels, sharp corners,
// monospace numbers, underlined tabs and sharp segmented controls.
import {
  Bean, Carrot, Cigarette, Drumstick, Droplet, Flame, Fuel, Lightbulb, Milk, Package, Phone, Shirt,
  SprayCan, Trees, UtensilsCrossed, Wheat, Zap, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { arrow, pct, trend } from "../lib/format";
import type { Item } from "../types";

// ── icons: a fine-line glyph per item in a square frame ──
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
  const box = size === "lg" ? "h-11 w-11" : size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const glyph = size === "lg" ? 20 : size === "sm" ? 14 : 16;
  return (
    <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-[2px] border border-line text-muted`}>
      <Icon size={glyph} strokeWidth={1.4} aria-hidden="true" />
    </span>
  );
}

// ── numbers (always monospace) ──
/** "▲ 5.7%" coloured by direction. `soft` adds a flat tinted box. */
export function Change({ value, soft = false, className = "" }: { value: number; soft?: boolean; className?: string }) {
  const t = trend(value);
  const colour = t === "up" ? "text-up" : t === "down" ? "text-down" : "text-muted";
  const tint = soft ? (t === "up" ? "bg-up/10" : t === "down" ? "bg-down/10" : "bg-soft") + " rounded-[2px] px-1.5 py-0.5" : "";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-mono font-medium ${colour} ${tint} ${className}`}>
      <span className="text-[0.7em]">{arrow(t)}</span>
      {pct(Math.abs(value)).slice(1)}
    </span>
  );
}

/** Price with a small "Rs". */
export function Price({ value, className = "", decimals = 2 }: { value: number; className?: string; decimals?: number }) {
  return (
    <span className={`whitespace-nowrap font-mono font-medium ${className}`}>
      <span className="mr-1 font-sans text-[0.68em] font-medium text-muted">Rs</span>
      {value.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

/** Small line chart; colour follows the overall direction of the window (grey if it ends where it began).
 *  A plain 1px line: no fill, no glow. */
export function Sparkline({ values, className = "h-10 w-24", stroke }: { values: (number | null)[]; className?: string; stroke?: string }) {
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
      <polyline points={line} fill="none" stroke={colour} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="miter" />
    </svg>
  );
}

// ── layout ──
export function SectionHead({ id, eyebrow, title, sub, aside }: { id?: string; eyebrow?: string; title: string; sub?: string; aside?: ReactNode }) {
  return (
    <div id={id} className="mb-6 flex scroll-mt-24 flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div>
        {eyebrow && <p className="label mb-2">{eyebrow}</p>}
        <h2 className="font-serif text-[28px] font-bold leading-tight tracking-[-0.01em] md:text-[34px]">{title}</h2>
        {sub && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

export function Card({ children, className = "", interactive = false }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return <div className={`panel ${interactive ? "lift" : ""} ${className}`}>{children}</div>;
}

/** Flat tabs with an underline under the active one (for categories and topics). */
export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex max-w-full gap-5 overflow-x-auto border-b border-line">
      {options.map((o) => (
        <button key={o} type="button" role="tab" aria-selected={o === value} onClick={() => onChange(o)}
          className={`-mb-px whitespace-nowrap border-b-2 pb-2 pt-1 text-sm font-medium transition-colors ${o === value ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Sharp segmented control (for short toggles such as 3M / 1Y / 3Y / All, List / Heatmap). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex shrink-0 overflow-hidden rounded-[2px] border border-line">
      {options.map((o, i) => (
        <button key={o} type="button" role="tab" aria-selected={o === value} onClick={() => onChange(o)}
          className={`px-3 py-1.5 font-mono text-xs font-medium transition-colors ${i ? "border-l border-line" : ""} ${o === value ? "bg-ink text-bg" : "text-muted hover:bg-soft hover:text-ink"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[2px] bg-ink/5 ${className}`} />;
}
