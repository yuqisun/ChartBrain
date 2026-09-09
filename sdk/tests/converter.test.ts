import { describe, expect, it } from "vitest";

import { buildHighcharts, toHighcharts, toECharts } from "../src/index";
import type { ChartSpec, ChartType, Row } from "../src/types";

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

// P1 起 Highcharts 配置由 fork 的 flint-js `assembleHighcharts` 编译，
// 断言只针对语义（图型 / 轴 / 数据 / 标题），不再锁定手写转换器的具体字段。
describe("buildHighcharts: 变换 + 转换（region_bar 用例）", () => {
  it("产出可渲染的 Highcharts column 配置", () => {
    const opt = buildHighcharts(sales, regionBarSpec);
    expect(opt.chart.type).toBe("column");
    expect(opt.title?.text).toBe("各区域营收对比");
    expect(opt.xAxis).toMatchObject({ type: "category", categories: ["华东", "华南"] });
    expect(opt.yAxis).toMatchObject({ type: "linear" });
    expect(opt.series).toHaveLength(1);
    expect(opt.series[0].type).toBe("column");
    expect(opt.series[0].data).toEqual([4700, 1700]);
    expect(opt.chart.width).toBeGreaterThan(0);
    expect(opt.chart.height).toBeGreaterThan(0);
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

  it("line（temporal x → datetime 轴 + [x,y] 点对）", () => {
    const opt = toHighcharts(sales, { ...base, chart: { type: "line", title: "t" } });
    expect(opt.chart.type).toBe("line");
    expect(opt.xAxis).toMatchObject({ type: "datetime" });
    expect(opt.series[0].type).toBe("line");
    // 同一时间点多行求和：2026-01 = 1200 + 900，依此类推
    expect(opt.series[0].data).toEqual([
      [Date.parse("2026-01"), 2100],
      [Date.parse("2026-02"), 2300],
      [Date.parse("2026-03"), 2000],
    ]);
  });

  it("pie（中性 spec 的 x=分类 / y=数值 映射到 Flint 的 color / size）", () => {
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
    expect(opt.series[0].type).toBe("pie");
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
    expect(opt.series[0].type).toBe("scatter");
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
    expect(opt.xAxis).toMatchObject({ type: "datetime" });
    expect(opt.series.map((s) => s.name)).toEqual(["华东", "华南"]);
    expect(opt.series[0].data).toEqual([
      [Date.parse("2026-01"), 1200],
      [Date.parse("2026-02"), 1500],
      [Date.parse("2026-03"), 2000],
    ]);
    // 华南缺 2026-03 → 该点不出现（折线自然断开），而不是补 0
    expect(opt.series[1].data).toEqual([
      [Date.parse("2026-01"), 900],
      [Date.parse("2026-02"), 800],
    ]);
  });

  it("空数据不崩溃", () => {
    const opt = toHighcharts([], base);
    expect(Array.isArray(opt.series)).toBe(true);
    expect(opt.series[0].data).toEqual([]);
    expect(opt.xAxis).toMatchObject({ categories: [] });
  });

  it("donut（x/y 映射到 color/size）", () => {
    const opt = toHighcharts(
      [
        { region: "华东", revenue: 4700 },
        { region: "华南", revenue: 1700 },
      ],
      {
        schema_version: 1,
        chart: { type: "donut", title: "营收占比" },
        encodings: {
          x: { field: "region", value_type: "categorical" },
          y: { field: "revenue", value_type: "numeric" },
        },
      },
    );
    expect(opt.chart.type).toBe("pie");
    // 只断言孔存在（语义），不锁 vendor 模板的默认值——'50%' 由 vendor 套件钉过
    expect(opt.series[0].innerSize).toBeDefined();
    expect(opt.series[0].data).toHaveLength(2);
  });

  it("groupedBar（series 映射到 group 通道，不堆叠）", () => {
    const opt = toHighcharts(sales, {
      schema_version: 1,
      chart: { type: "groupedBar", title: "分组柱" },
      encodings: {
        x: { field: "month", value_type: "categorical" },
        y: { field: "revenue", value_type: "numeric" },
        series: { field: "region" },
      },
    });
    expect(opt.chart.type).toBe("column");
    expect(opt.series).toHaveLength(2);
    expect((opt as any).plotOptions?.series?.stacking).toBeUndefined();
  });

  it("every whitelisted chart type maps to the expected backend shape", () => {
    // 这 11 个键即 ChartType 联合（types.ts）与 prompt/白名单的又一份副本（既有
    // 做法，第 6 处；本轮不引入共享模块）。逐类型断言最小输出：若 groupedBar /
    // stackedBar 的 Flint 名字互换、stackedBar 丢掉堆叠、donut 的 EC 配色回归等，
    // 这里都会红。
    // 键类型绑到 ChartType：漏掉一个图型或写错名字都是编译错误，而不是静默跳过
    const expected: Record<ChartType, { hc: string; ec: string }> = {
      bar: { hc: "column", ec: "bar" },
      stackedBar: { hc: "column", ec: "bar" },
      groupedBar: { hc: "column", ec: "bar" },
      line: { hc: "line", ec: "line" },
      slope: { hc: "line", ec: "line" },
      connectedScatter: { hc: "line", ec: "line" },
      area: { hc: "area", ec: "line" },
      scatter: { hc: "scatter", ec: "scatter" },
      strip: { hc: "scatter", ec: "scatter" },
      pie: { hc: "pie", ec: "pie" },
      donut: { hc: "pie", ec: "pie" },
    };
    for (const [type, want] of Object.entries(expected)) {
      const spec: ChartSpec = {
        schema_version: 1,
        chart: { type: type as ChartSpec["chart"]["type"], title: type },
        encodings: {
          x: { field: "month", value_type: "categorical" },
          y: { field: "revenue", value_type: "numeric" },
          series: { field: "region" },
        },
      };
      const hc = toHighcharts(sales, spec) as any;
      const ec = toECharts(sales, spec) as any;
      expect(hc.chart.type).toBe(want.hc);
      expect(ec.series[0].type).toBe(want.ec);
    }
    // 堆叠语义单独钉住（图型断言只到 column 级，抓不到 stacking 丢失），两端都断言
    const stackedSpec: ChartSpec = {
      schema_version: 1,
      chart: { type: "stackedBar", title: "s" },
      encodings: {
        x: { field: "month", value_type: "categorical" },
        y: { field: "revenue", value_type: "numeric" },
        series: { field: "region" },
      },
    };
    expect((toHighcharts(sales, stackedSpec) as any).plotOptions.series.stacking).toBe("normal");
    expect((toECharts(sales, stackedSpec) as any).series[0].stack).toBe("total");

    // groupedBar 反向：两端都不许堆叠
    const groupedSpec: ChartSpec = { ...stackedSpec, chart: { type: "groupedBar", title: "g" } };
    expect((toHighcharts(sales, groupedSpec) as any).plotOptions?.series?.stacking).toBeUndefined();
    expect((toECharts(sales, groupedSpec) as any).series[0].stack).toBeUndefined();
  });
});
