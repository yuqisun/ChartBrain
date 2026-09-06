/**
 * ECharts 后端 spike 测试（D12）：我们的 spec → flint-js assembleECharts → 是否产出
 * 结构合法的 ECharts option（不崩、有 series、类型匹配）。
 * 依赖 flint-chart（sdk 的 dependency）。
 */

import { describe, expect, it } from "vitest";

import { buildECharts } from "../src/index";
import type { ChartSpec, Row } from "../src/types";

const sales: Row[] = [
  { month: "2026-01", region: "华东", revenue: 1200 },
  { month: "2026-01", region: "华南", revenue: 900 },
  { month: "2026-02", region: "华东", revenue: 1500 },
  { month: "2026-02", region: "华南", revenue: 800 },
  { month: "2026-03", region: "华东", revenue: 2000 },
];

const regionBarSpec: ChartSpec = {
  schema_version: 1,
  chart: { type: "bar", title: "各区域营收对比" },
  transform_plan: {
    steps: [
      {
        op: "aggregate",
        group_by: ["region"],
        measures: [{ field: "revenue", agg: "sum", as: "region_revenue" }],
      },
      { op: "sort", by: "region_revenue", order: "desc" },
    ],
  },
  encodings: {
    x: { field: "region", value_type: "categorical" },
    y: { field: "region_revenue", value_type: "numeric" },
  },
};

// 不带 transform 的简单图型（直接消费原始表）
function plainSpec(type: ChartSpec["chart"]["type"], x: string, y: string): ChartSpec {
  return {
    schema_version: 1,
    chart: { type, title: type },
    encodings: {
      x: { field: x, value_type: "categorical" },
      y: { field: y, value_type: "numeric" },
    },
  };
}

function seriesType(opt: any): string | undefined {
  return Array.isArray(opt?.series) ? opt.series[0]?.type : undefined;
}

describe("toECharts (flint-js) spike", () => {
  it("bar: 变换+转换产出 ECharts option（series 为 bar）", () => {
    const opt = buildECharts(sales, regionBarSpec);
    expect(Array.isArray(opt.series)).toBe(true);
    expect(opt.series.length).toBeGreaterThan(0);
    expect(seriesType(opt)).toBe("bar");
  });

  it("line", () => {
    const opt = buildECharts(sales, plainSpec("line", "month", "revenue"));
    expect(seriesType(opt)).toBe("line");
  });

  it("area（echarts 用 line + areaStyle）", () => {
    const opt = buildECharts(sales, plainSpec("area", "month", "revenue"));
    expect(seriesType(opt)).toBe("line");
    // 面积图应带 areaStyle
    const s = Array.isArray(opt.series) ? opt.series[0] : undefined;
    expect(s?.areaStyle).toBeDefined();
  });

  it("pie", () => {
    const opt = buildECharts(sales, plainSpec("pie", "region", "revenue"));
    expect(seriesType(opt)).toBe("pie");
  });

  it("scatter", () => {
    const opt = buildECharts(sales, plainSpec("scatter", "month", "revenue"));
    expect(seriesType(opt)).toBe("scatter");
  });
});
