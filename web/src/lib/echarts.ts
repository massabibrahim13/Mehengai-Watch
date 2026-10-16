// The chart library, imported piece by piece so the site only ships what it uses. It is about 60% of the site's
// JavaScript, so it is loaded on demand when the first chart mounts (see Chart in charts.tsx): the page can draw
// before it arrives.
import { BarChart, LineChart, ScatterChart, TreemapChart } from "echarts/charts";
import {
  DataZoomComponent,
  GeoComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, ScatterChart, TreemapChart, GeoComponent, GridComponent, TooltipComponent,
  DataZoomComponent, MarkLineComponent, VisualMapComponent, SVGRenderer]);

export { echarts };
