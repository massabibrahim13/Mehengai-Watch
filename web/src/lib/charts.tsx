// ECharts, imported piece by piece so the site only ships what it uses, plus a small React wrapper.
import { BarChart, LineChart, ScatterChart, TreemapChart } from "echarts/charts";
import {
  DataZoomComponent,
  GeoComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { useTheme } from "./theme";

echarts.use([BarChart, LineChart, ScatterChart, TreemapChart, GeoComponent, GridComponent, TooltipComponent,
  DataZoomComponent, MarkLineComponent, SVGRenderer]);

export { echarts };
export type EChartsOption = echarts.EChartsCoreOption;

/** Current value of a CSS colour token, e.g. cssVar("--color-ink"). Charts can't read Tailwind classes. */
export const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** True while the site is in dark mode (charts re-colour when the theme changes). */
export const useDarkMode = (): boolean => useTheme().theme === "dark";

/** Charts use the monospace font for every number (axes, labels, tooltips). */
export const MONO = '"JetBrains Mono Variable", "IBM Plex Mono", ui-monospace, monospace';
export const SANS = '"Inter Variable", "Helvetica Neue", Arial, sans-serif';

export const reducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface ChartProps {
  option: EChartsOption;
  className?: string;
  onReady?: (chart: echarts.ECharts) => void;
}

/** Mounts one ECharts instance, updates it when `option` changes, resizes with its box. */
export function Chart({ option, className, onReady }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current, undefined, { renderer: "svg" });
    onReady?.(chart.current);
    const resize = new ResizeObserver(() => chart.current?.resize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption({ animation: !reducedMotion(), textStyle: { fontFamily: MONO }, ...option }, { notMerge: false });
  }, [option]);

  return <div ref={ref} className={className} />;
}
