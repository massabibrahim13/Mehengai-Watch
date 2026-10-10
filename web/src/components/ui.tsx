// Small shared building blocks.
import type { ReactNode } from "react";
import { arrow, pct, trend, trendText } from "../lib/format";

/** Section with a small uppercase kicker and a serif headline. */
export function Section({ id, kicker, title, aside, children }: {
  id?: string; kicker: string; title: string; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{kicker}</p>
          <h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** "▲ +5.7%" in a tinted pill, coloured by direction (arrow too, so colour isn't the only signal). */
export function ChangePill({ value, className = "" }: { value: number; className?: string }) {
  const t = trend(value);
  const tint = t === "up" ? "bg-up/10 border-up/30" : t === "down" ? "bg-down/10 border-down/30" : "bg-muted/10 border-line";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-xs font-medium tabular ${tint} ${trendText(t)} ${className}`}>
      {arrow(t)} {pct(value)}
    </span>
  );
}

export function Tag({ children, onClick, title }: { children: ReactNode; onClick?: () => void; title?: string }) {
  const cls = "inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink/80";
  return onClick ? (
    <button type="button" title={title} onClick={onClick} className={`${cls} bubble cursor-pointer hover:border-accent hover:text-accent`}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}

/** Tiny SVG trend line; last point marked in the direction colour. */
export function Sparkline({ values, up, className = "h-10 w-full" }: { values: (number | null)[]; up?: boolean; className?: string }) {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const w = 300, h = 40;
  const pts = v.map((y, i) => [4 + (i * (w - 8)) / (v.length - 1), h - 5 - ((y - lo) / span) * (h - 10)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `4,${h} ${line} ${w - 4},${h}`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <polygon points={area} className="fill-accent/8" />
      <polyline points={line} fill="none" className="stroke-accent" strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3.5} className={up ? "fill-up" : "fill-down"} />
    </svg>
  );
}

/** Big price: small "Rs" in the text font, digits in the rate-board mono. */
export function Price({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`font-mono font-medium tabular tracking-tight ${className}`}>
      <span className="mr-1 align-[0.12em] font-sans text-[0.5em] font-semibold text-muted">Rs</span>
      {value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-ink/5 ${className}`} />;
}
