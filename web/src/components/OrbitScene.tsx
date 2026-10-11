// The hero's backdrop: Pakistan seen from orbit, drawn in code (no photos). The 17 PBS survey cities light up
// one by one, joined by the Karachi–Peshawar highway corridor. Night in dark mode, day in light mode; CSS in
// index.css (.scene …) crossfades the two. Decorative only: aria-hidden and makes no data claims.
import { useMemo } from "react";
import type { City } from "../types";

// Rough city populations in millions (2017 census, rounded) — only used to size the glow of each city.
const POP: Record<string, number> = {
  Karachi: 16, Lahore: 11, Faisalabad: 3.2, Rawalpindi: 2.1, Gujranwala: 2, Peshawar: 2, Multan: 1.9,
  Hyderabad: 1.7, Islamabad: 1, Quetta: 1, Bahawalpur: 0.8, Sargodha: 0.7, Sialkot: 0.7, Sukkur: 0.5,
  Larkana: 0.5, Khuzdar: 0.2, Bannu: 0.1,
};
// Main roads between survey cities (N-5 spine first, then branches), drawn as glowing lines.
const ROADS = [
  ["Karachi", "Hyderabad", "Sukkur", "Bahawalpur", "Multan", "Lahore", "Gujranwala", "Rawalpindi", "Peshawar"],
  ["Karachi", "Khuzdar", "Quetta", "Sukkur", "Larkana"],
  ["Lahore", "Faisalabad", "Sargodha"],
  ["Faisalabad", "Multan"],
  ["Gujranwala", "Sialkot"],
  ["Rawalpindi", "Islamabad"],
  ["Peshawar", "Bannu"],
];

// Simple equirectangular projection, squeezed by cos(latitude) so the shape is true at Pakistan's latitude.
const K = 60, LON0 = 60.6, LAT0 = 37.3, COS = Math.cos((30.5 * Math.PI) / 180), PAD = 18;
const project = (lon: number, lat: number): [number, number] => [(lon - LON0) * COS * K + PAD, (LAT0 - lat) * K + PAD];

/** Small seeded random generator, so the stars and city sprawl look the same on every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GeoJSON { features: { geometry: { type: string; coordinates: number[][][] } }[] }

function Stars() {
  const stars = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 170 }, (_, i) => ({ x: r() * 1440, y: r() * 640, s: 0.35 + r() ** 3 * 1.4, tw: i % 9 === 0, d: r() * 4 }));
  }, []);
  return (
    <svg className="night absolute inset-x-0 top-0 h-[70%] w-full" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice">
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" opacity={0.35 + s.s / 2.4}
          className={s.tw ? "star-twinkle" : undefined} style={s.tw ? { animationDelay: `${s.d}s` } : undefined} />
      ))}
    </svg>
  );
}

function Land({ geo, cities }: { geo: GeoJSON; cities: City[] }) {
  const { outline, roads, lights } = useMemo(() => {
    const ring = geo.features[0].geometry.coordinates[0];
    const outline = ring.map(([lon, lat], i) => `${i ? "L" : "M"}${project(lon, lat).map((v) => v.toFixed(1)).join(",")}`).join(" ") + " Z";
    const at = Object.fromEntries(cities.map((c) => [c.name, project(c.lon, c.lat)]));
    const roads = ROADS.map((names) => names.filter((n) => at[n]).map((n) => at[n].join(",")).join(" "));
    // light up south → north (near → far), so the scene "switches on" from the viewer outward
    const lights = [...cities].sort((a, b) => a.lat - b.lat).map((c, i) => {
      const p = Math.sqrt(POP[c.name] ?? 0.3);
      const [x, y] = at[c.name];
      const r = rng(i + 11);
      const sprawl = Array.from({ length: Math.round(3 + 5 * p) }, () => {
        const a = r() * Math.PI * 2, d = (0.25 + r() * 0.75) * (8 + 7 * p);
        return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, s: 0.8 + r() * 1.2 };
      });
      return { name: c.name, x, y, halo: 22 + 22 * p, core: 3.2 + 1.8 * p, sprawl, i, d: r() * 5 };
    });
    return { outline, roads, lights };
  }, [geo, cities]);

  return (
    <svg className="land" viewBox="0 0 900 860">
      <defs>
        <radialGradient id="halo">
          <stop offset="0%" style={{ stopColor: "var(--light-halo)", stopOpacity: 0.8 }} />
          <stop offset="35%" style={{ stopColor: "var(--light-halo)", stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: "var(--light-halo)", stopOpacity: 0 }} />
        </radialGradient>
        <filter id="soften" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      <path className="land-shape" d={outline} />
      {roads.map((pts, i) => (
        <g key={i} style={{ opacity: i === 0 ? 1 : 0.55 }}>
          <polyline className="road road-draw" points={pts} pathLength={1} strokeWidth={i === 0 ? 7 : 5} filter="url(#soften)" />
          <polyline className="road road-draw" points={pts} pathLength={1} strokeWidth={i === 0 ? 1.8 : 1.2} />
        </g>
      ))}
      {lights.map((l) => (
        <g key={l.name} className="city" style={{ ["--i" as string]: l.i }}>
          <circle cx={l.x} cy={l.y} r={l.halo} fill="url(#halo)" />
          {l.sprawl.map((s, j) => <circle key={j} cx={s.x} cy={s.y} r={s.s} className="city-core" style={{ ["--d" as string]: `${(l.d + j) % 5}s` }} />)}
          <circle cx={l.x} cy={l.y} r={l.core} className="city-core" style={{ ["--d" as string]: `${l.d}s` }} />
        </g>
      ))}
    </svg>
  );
}

export function OrbitScene({ geo, cities }: { geo: object | null; cities: City[] }) {
  return (
    <div className="scene pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="sky-day day absolute inset-0" />
      <div className="sky-night night absolute inset-0" />
      <div className="depth absolute inset-0" style={{ ["--depth" as string]: 5 }}><Stars /></div>
      <div className="depth absolute inset-0" style={{ ["--depth" as string]: 11 }}>
        <div className="sun sun-day day" />
        <div className="sun sun-night night" />
        <div className="atmo atmo-day day" />
        <div className="atmo atmo-night night" />
        <div className="planet">
          <div className="planet-day day absolute inset-0" />
          <div className="planet-night night absolute inset-0" />
          {geo && <Land geo={geo as GeoJSON} cities={cities} />}
        </div>
      </div>
    </div>
  );
}
