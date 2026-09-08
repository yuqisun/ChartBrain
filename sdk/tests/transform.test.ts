import { describe, expect, it } from "vitest";

import { executeTransform } from "../src/transform";
import type { Row } from "../src/types";

const sales: Row[] = [
  { month: "2026-01", region: "华东", revenue: 1200 },
  { month: "2026-01", region: "华南", revenue: 900 },
  { month: "2026-02", region: "华东", revenue: 1500 },
  { month: "2026-02", region: "华南", revenue: 800 },
  { month: "2026-03", region: "华东", revenue: 2000 },
];

describe("filter", () => {
  it("in 多值过滤", () => {
    const rows = executeTransform(sales, [
      { op: "filter", field: "region", operator: "in", values: ["华东"] },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.region === "华东")).toBe(true);
  });

  it("gt 数值过滤", () => {
    const rows = executeTransform(sales, [
      { op: "filter", field: "revenue", operator: "gt", value: 1000 },
    ]);
    expect(rows.map((r) => r.revenue)).toEqual([1200, 1500, 2000]);
  });

  it("between 区间过滤", () => {
    const rows = executeTransform(sales, [
      { op: "filter", field: "revenue", operator: "between", values: [900, 1500] },
    ]);
    expect(rows).toHaveLength(3);
  });

  it("contains 字符串包含", () => {
    const rows = executeTransform(sales, [
      { op: "filter", field: "month", operator: "contains", value: "-02" },
    ]);
    expect(rows.map((r) => r.month)).toEqual(["2026-02", "2026-02"]);
  });
});

describe("aggregate", () => {
  it("分组求和 + 排序（对应 region_bar 用例）", () => {
    const rows = executeTransform(sales, [
      {
        op: "aggregate",
        group_by: ["region"],
        measures: [{ field: "revenue", agg: "sum", as: "region_revenue" }],
      },
      { op: "sort", by: "region_revenue", order: "desc" },
    ]);
    expect(rows).toEqual([
      { region: "华东", region_revenue: 4700 },
      { region: "华南", region_revenue: 1700 },
    ]);
  });

  it("count（无 field）与 countDistinct", () => {
    const rows = executeTransform(sales, [
      { op: "aggregate", measures: [{ agg: "count", as: "n" }] },
    ]);
    expect(rows).toEqual([{ n: 5 }]);
    const rows2 = executeTransform(sales, [
      {
        op: "aggregate",
        measures: [{ field: "region", agg: "countDistinct", as: "d" }],
      },
    ]);
    expect(rows2).toEqual([{ d: 2 }]);
  });

  it("avg / min / max", () => {
    const rows = executeTransform(sales, [
      {
        op: "aggregate",
        measures: [
          { field: "revenue", agg: "avg", as: "avg_v" },
          { field: "revenue", agg: "min", as: "min_v" },
          { field: "revenue", agg: "max", as: "max_v" },
        ],
      },
    ]);
    expect(rows).toEqual([{ avg_v: 1280, min_v: 800, max_v: 2000 }]);
  });

  it("按月份分组计数", () => {
    const rows = executeTransform(sales, [
      {
        op: "aggregate",
        group_by: ["month"],
        measures: [{ agg: "count", as: "n" }],
      },
    ]);
    expect(rows).toEqual([
      { month: "2026-01", n: 2 },
      { month: "2026-02", n: 2 },
      { month: "2026-03", n: 1 },
    ]);
  });
});

describe("sort / limit", () => {
  it("数值降序 + limit（top2）", () => {
    const rows = executeTransform(sales, [
      { op: "sort", by: "revenue", order: "desc" },
      { op: "limit", n: 2 },
    ]);
    expect(rows.map((r) => r.revenue)).toEqual([2000, 1500]);
  });

  it("字符串排序", () => {
    const rows = executeTransform(sales, [
      { op: "sort", by: "month", order: "asc" },
    ]);
    expect(rows.map((r) => r.month)).toEqual([
      "2026-01",
      "2026-01",
      "2026-02",
      "2026-02",
      "2026-03",
    ]);
  });
});

describe("unknown op", () => {
  it("抛错", () => {
    expect(() =>
      executeTransform(sales, [{ op: "pivot" } as never]),
    ).toThrowError(/Unsupported transform op/);
  });
});

describe("derive / binTime (P1, D14)", () => {
  it("derive: 两步链 subtract + multiply(常量)", () => {
    const rows = executeTransform(
      [{ revenue: 100, cost: 40 }],
      [
        { op: "derive", as: "gross", left: { field: "revenue" }, operator: "subtract", right: { field: "cost" } },
        { op: "derive", as: "after_tax", left: { field: "gross" }, operator: "multiply", right: { value: 0.9 } },
      ],
    );
    expect(rows).toEqual([{ revenue: 100, cost: 40, gross: 60, after_tax: 54 }]);
  });

  it("derive: divide + 除零 → null", () => {
    const rows = executeTransform(
      [
        { a: 10, b: 4 },
        { a: 10, b: 0 },
      ],
      [{ op: "derive", as: "r", left: { field: "a" }, operator: "divide", right: { field: "b" } }],
    );
    expect(rows).toEqual([
      { a: 10, b: 4, r: 2.5 },
      { a: 10, b: 0, r: null },
    ]);
  });

  it("derive: 缺失 operand → null（不抛错）", () => {
    const rows = executeTransform(
      [{ a: 5 }],
      [
        {
          op: "derive",
          as: "r",
          left: { field: "a" },
          operator: "add",
          right: { field: "missing" },
        },
      ],
    );
    expect(rows[0].r).toBeNull();
  });

  it("binTime: month/quarter/year 标签 + 坏日期 → null", () => {
    const rows = executeTransform(
      [{ d: "2026-01-15" }, { d: "2026-04-02" }, { d: "2026-12-01" }, { d: "not-a-date" }],
      [
        { op: "binTime", field: "d", granularity: "month", as: "m" },
        { op: "binTime", field: "d", granularity: "quarter", as: "q" },
        { op: "binTime", field: "d", granularity: "year", as: "y" },
      ],
    );
    expect(rows.map((r) => [r.m, r.q, r.y])).toEqual([
      ["2026-01", "2026-Q1", "2026"],
      ["2026-04", "2026-Q2", "2026"],
      ["2026-12", "2026-Q4", "2026"],
      [null, null, null],
    ]);
  });

  it("binTime: 保留整表并新增列", () => {
    const rows = executeTransform(
      [{ revenue: 10, d: "2025-11-03" }],
      [{ op: "binTime", field: "d", granularity: "month", as: "m" }],
    );
    expect(rows).toEqual([{ revenue: 10, d: "2025-11-03", m: "2025-11" }]);
  });
});
