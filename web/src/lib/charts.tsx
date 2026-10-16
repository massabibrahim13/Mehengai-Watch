// A small React wrapper around ECharts. The library itself (lib/echarts.ts) is downloaded only when the first chart
// mounts, so the first screen doesn't wait for it; until then a chart's box is simply empty.
import type { ECharts, EChartsCoreOption } from "echarts/core";
import { useEffect, useRef } from "react";
import { useTheme } from "./theme";

export type { ECharts };
export type EChartsOption = EChartsCoreOption;

const loadECharts = () => import("./echarts").then((m) => m.echarts);

/** Current value of a CSS colour token, e.g. cssVar("--color-ink"). Charts can't read Tailwind classes. */
export const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** True while the site is in dark mode (charts re-colour when the theme changes). */
export const useDarkMode = (): boolean => useTheme().theme === "dark";

/** Charts use the monospace font for every number (axes, labels, tooltips). */
export const MONO = '"JetBrains Mono Variable", "IBM Plex Mono", ui-monospace, monospace';
export const SANS = '"Inter Variable", "Helvetica Neue", Arial, sans-serif';

export const reducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const draw = (chart: ECharts, option: EChartsOption) =>
  chart.setOption({ animation: !reducedMotion(), textStyle: { fontFamily: MONO }, ...option }, { notMerge: false });

interface ChartProps {
  option: EChartsOption;
  className?: string;
  /** Maps the option refers to by name, e.g. { pakistan: geoJson }; registered before the first draw. */
  maps?: Record<string, object>;
  onReady?: (chart: ECharts) => void;
}

/** Mounts one ECharts instance, updates it when `option` changes, resizes with its box. */
export function Chart({ option, className, maps, onReady }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const latest = useRef(option); // the option to draw once the library has arrived

  useEffect(() => {
    let gone = false;
    let resize: ResizeObserver | undefined;
    loadECharts().then((echarts) => {
      if (gone || !ref.current) return;
      for (const [name, geo] of Object.entries(maps ?? {})) {
        if (!echarts.getMap(name)) echarts.registerMap(name, geo as never);
      }
      chart.current = echarts.init(ref.current, undefined, { renderer: "svg" });
      onReady?.(chart.current);
      draw(chart.current, latest.current);
      resize = new ResizeObserver(() => chart.current?.resize());
      resize.observe(ref.current);
    });
    return () => {
      gone = true;
      resize?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    latest.current = option;
    if (chart.current) draw(chart.current, option);
  }, [option]);

  return <div ref={ref} className={className} />;
}
