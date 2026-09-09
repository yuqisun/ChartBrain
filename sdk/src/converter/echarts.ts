/**
 * ECharts 后端（D12 候选：SDK 内复用 flint-js `assembleECharts`）。
 *
 * 我们的变换运行时已产出「最终表」；这里把最终表 + 中性 spec 映射为 Flint 的
 * ChartAssemblyInput，交给 flint-chart 编译成 ECharts option。
 *
 * 映射（spike）：
 * - chart.type → Flint chartType（ECharts 模板名，已从源码核实）
 * - encodings.x/y → x/y；encodings.series → color（系列拆分）
 * - 数据直接 inline（Flint 需要 data.values 在场，D12 决定如此）
 * - 未传 semantic_types，由 Flint 从数据推断（后续可细化）
 */

import { assembleECharts } from "flint-chart";

import type { ChartSpec, ChartType, Row } from "../types.js";

const FLINT_CHART_TYPE: Record<ChartType, string> = {
  bar: "Bar Chart",
  line: "Line Chart",
  pie: "Pie Chart",
  scatter: "Scatter Plot",
  area: "Area Chart",
};

type FlintInput = Parameters<typeof assembleECharts>[0];

/** 中性 spec + 变换后的最终表 → ECharts option（对象形状由 Flint 决定）。 */
export function toECharts(data: Row[], spec: ChartSpec): unknown {
  const encodings: Record<string, { field: string }> = {};
  const x = spec.encodings.x;
  const y = spec.encodings.y;
  const s = spec.encodings.series;

  if (spec.chart.type === "pie") {
    // Flint 的饼图模板读 color（扇区）+ size（度量），而中性 spec 用 x=分类、y=数值。
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

  return assembleECharts(input);
}
