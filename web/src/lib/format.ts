// Formatting only — no calculations that change meaning (those happen in Python).

const en = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const en0 = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

/** Rate-board style: Rs 2,851 for big prices, Rs 7.66 for small ones. */
export const money = (x: number): string => `Rs ${x >= 100 ? en0.format(x) : en.format(x)}`;

/** Always two decimals: Rs 2,851.04. */
export const moneyExact = (x: number): string => `Rs ${en.format(x)}`;

/** +5.7% / −1.4% (true minus sign). */
export const pct = (x: number, digits = 1): string =>
  `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toFixed(digits)}%`;

export type Trend = "up" | "down" | "flat";
export const trend = (x: number): Trend => (x >= 0.05 ? "up" : x <= -0.05 ? "down" : "flat");
export const arrow = (t: Trend): string => (t === "up" ? "▲" : t === "down" ? "▼" : "•");

/** Tailwind text colour for a price move. */
export const trendText = (t: Trend): string =>
  t === "up" ? "text-up" : t === "down" ? "text-down" : "text-muted";

// Names whose plain short form would clash with another item, or would read oddly.
const SHORT: Record<string, string> = {
  "Rice (basmati, broken)": "Basmati rice", "Rice (IRRI-6/9)": "IRRI rice",
  "Vegetable ghee (1 kg pouch)": "Ghee (1 kg)", "Vegetable ghee (2.5 kg tin)": "Ghee (2.5 kg)",
  "Tea (hotel cup)": "Tea (cup)", "Telephone call charges": "Phone calls", "Gents sponge chappal (Bata)": "Sponge chappal",
};

/** "Chicken (farm broiler, live)" → "Chicken" for tight spaces; still unique across all 51 items. */
export const shortName = (name: string): string => SHORT[name] ?? name.replace(/\s*\(.*\)$/, "");

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-08" → "8 Oct 2026" */
export const dateLabel = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
};

export const timeAgo = (iso: string, now = Date.now()): string => {
  const minutes = Math.max(0, (now - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
};

/** "Chana daal and wheat flour", "A, B and C" */
export const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
