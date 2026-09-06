import { describe, expect, it } from "vitest";

import { buildHighcharts, toHighcharts } from "../src/index";
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

describe("buildHighcharts: 变换 + 转换（region_bar 用例）", () => {
  it("产出 Highcharts column 配置（服务端 spec 直接可渲染）", () => {
    const opt = buildHighcharts(sales, regionBarSpec);
    expect(opt).toEqual({
      chart: { type: "column" },
      title: { text: "各区域营收对比" },
      xAxis: { categories: ["华东", "华南"], title: { text: "region" } },
      yAxis: { title: { text: "region_revenue" } },
      series: [{ name: "各区域营收对比", data: [4700, 1700] }],
    });
  });
});

describe("toHighcharts 各图型", () => {
  const base: ChartSpec = {
    schema_version: 1,
    chart: { type: "line", title: "t" },
    encodings: {
      x: { field: "month", value_type: "categorical" },
      y: { field: "revenue", value_type: "numeric" },
    },
  };

  it("line", () => {
    const opt = toHighcharts(sales, { ...base, chart: { type: "line", title: "t" } });
    expect(opt.chart.type).toBe("line");
    expect(opt.xAxis?.categories).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(opt.series[0].data).toEqual([1200, 900, 1500, 800, 2000]);
  });

  it("pie", () => {
    const opt = toHighcharts(
      [
        { region: "华东", revenue: 4700 },
        { region: "华南", revenue: 1700 },
      ],
      {
        schema_version: 1,
        chart: { type: "pie", title: "营收占比" },
        encodings: {
          x: { field: "region", value_type: "categorical" },
          y: { field: "revenue", value_type: "numeric" },
        },
      },
    );
    expect(opt.chart.type).toBe("pie");
    expect(opt.series[0].data).toEqual([
      { name: "华东", y: 4700 },
      { name: "华南", y: 1700 },
    ]);
  });

  it("scatter", () => {
    const opt = toHighcharts(
      [
        { orders: 40, revenue: 1200 },
        { orders: 55, revenue: 1800 },
      ],
      {
        schema_version: 1,
        chart: { type: "scatter", title: "散点" },
        encodings: {
          x: { field: "orders", value_type: "numeric" },
          y: { field: "revenue", value_type: "numeric" },
        },
      },
    );
    expect(opt.chart.type).toBe("scatter");
    expect(opt.series[0].data).toEqual([
      [40, 1200],
      [55, 1800],
    ]);
  });

  it("line with series 拆分", () => {
    const spec: ChartSpec = {
      schema_version: 1,
      chart: { type: "line", title: "月度区域营收" },
      transform_plan: {
        steps: [
          {
            op: "aggregate",
            group_by: ["month", "region"],
            measures: [
              { field: "revenue", agg: "sum", as: "monthly_revenue" },
            ],
          },
        ],
      },
      encodings: {
        x: { field: "month", value_type: "categorical" },
        y: { field: "monthly_revenue", value_type: "numeric" },
        series: { field: "region" },
      },
    };
    const opt = buildHighcharts(sales, spec);
    expect(opt.xAxis?.categories).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(opt.series).toEqual([
      { name: "华东", data: [1200, 1500, 2000] },
      { name: "华南", data: [900, 800, 0] },
    ]);
  });

  it("空数据不崩溃", () => {
    const opt = toHighcharts([], base);
    expect(opt.series[0].data).toEqual([]);
    expect(opt.xAxis?.categories).toEqual([]);
  });
});
