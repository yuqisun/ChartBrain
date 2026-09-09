/**
 * Highcharts 后端（D11/D13）——由 fork 的 flint-js `assembleHighcharts` 编译。
 *
 * 我们的变换运行时已产出「最终表」；这里把最终表 + 中性 spec 映射为 Flint 的
 * ChartAssemblyInput，交给 flint-chart 编译成 Highcharts options。
 *
 * 映射：
 * - chart.type → Flint chartType（bar/line/area/scatter/pie 五种白名单）
 * - encodings.x/y → x/y；encodings.series → color（系列拆分）
 * - pie 例外：中性 spec 用 x=分类、y=数值，而 Flint 的饼图模板读 color=分类、size=数值
 * - 数据直接 inline（Flint 需要 data.values 在场，D12 决定如此）
 * - 未传 semantic_types，由 Flint 从数据推断（后续可细化）
 */

import { assembleHighcharts } from "flint-chart";

import type { ChartSpec, ChartType, Row } from "../types.js";

const FLINT_CHART_TYPE: Record<ChartType, string> = {
  bar: "Bar Chart",
  line: "Line Chart",
  pie: "Pie Chart",
  scatter: "Scatter Plot",
  area: "Area Chart",
};

export interface HighchartsSeries {
  name?: string;
  type?: string;
  data: unknown[];
  color?: string;
  pointWidth?: number;
  [key: string]: unknown;
}

export interface HighchartsAxis {
  type?: string;
  categories?: string[];
  title?: { text?: string; [key: string]: unknown };
  labels?: Record<string, unknown>;
  min?: number;
  max?: number;
  [key: string]: unknown;
}

/** Highcharts options 的最小结构（完整形状由 Flint 决定，这里是给消费端的类型提示）。 */
export interface HighchartsOption {
  chart: { type: string; width?: number; height?: number; [key: string]: unknown };
  title?: { text?: string; style?: Record<string, unknown>; [key: string]: unknown };
  xAxis?: HighchartsAxis;
  yAxis?: HighchartsAxis;
  series: HighchartsSeries[];
  tooltip?: Record<string, unknown>;
  legend?: Record<string, unknown>;
  /** 溢出截断等提示，可直接展示给用户。 */
  _warnings?: Array<{ severity: string; code: string; message: string; channel?: string; field?: string }>;
  [key: string]: unknown;
}

type FlintInput = Parameters<typeof assembleHighcharts>[0];

/** 中性 spec + 变换后的最终表 → Highcharts options。 */
export function toHighcharts(data: Row[], spec: ChartSpec): HighchartsOption {
  const encodings: Record<string, { field: string }> = {};
  const x = spec.encodings.x;
  const y = spec.encodings.y;
  const s = spec.encodings.series;

  if (spec.chart.type === "pie") {
    if (x) encodings.color = { field: x.field };
    if (y) encodings.size = { field: y.field };
  } else {
    if (x) encodings.x = { field: x.field };
    if (y) encodings.y = { field: y.field };
    if (s) encodings.color = { field: s.field };
  }

  const input: FlintInput = {
    data: { values: data },
    chart_spec: {
      chartType: FLINT_CHART_TYPE[spec.chart.type],
      title: spec.chart.title ?? "",
      encodings,
      baseSize: { width: 640, height: 400 },
    },
  } as FlintInput;

  return assembleHighcharts(input) as HighchartsOption;
}
