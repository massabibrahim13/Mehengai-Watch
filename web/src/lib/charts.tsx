// ECharts, imported piece by piece so the site only ships what it uses, plus a small React wrapper.
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GeoComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef, useState } from "react";

echarts.use([BarChart, LineChart, ScatterChart, GeoComponent, GridComponent, TooltipComponent,
  DataZoomComponent, MarkLineComponent, SVGRenderer]);

export { echarts };
export type EChartsOption = echarts.EChartsCoreOption;

/** Current value of a CSS colour token, e.g. cssVar("--color-ink"). Charts can't read Tailwind classes. */
export const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** True while the viewer's system is in dark mode (charts re-colour when it changes). */
export function useDarkMode(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

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
    chart.current?.setOption({ animation: !reducedMotion(), ...option }, { notMerge: false });
  }, [option]);

  return <div ref={ref} className={className} />;
}
