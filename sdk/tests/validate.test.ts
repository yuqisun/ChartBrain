/**
 * 通道完整性校验（M3）：每个图型的必需通道缺失时必须报错，而不是把坏 spec
 * 漏给后端产出垃圾配置。校验器只查 spec 的通道存在性，不看数据——空数据合法。
 */

import { describe, expect, it } from "vitest";

import { toECharts } from "../src/converter/echarts";
import { toHighcharts } from "../src/converter/highcharts";
import { validateChannels } from "../src/converter/validate";
import { buildECharts, buildHighcharts } from "../src/index";
import type { ChartSpec, ChartType, Row } from "../src/types";

const ALL_TYPES: ChartType[] = [
  "bar", "line", "pie", "scatter", "area",
  "groupedBar", "stackedBar", "donut", "slope", "connectedScatter", "strip",
];

const sales: Row[] = [
  { month: "2026-01", region: "华东", revenue: 1200 },
  { month: "2026-02", region: "华南", revenue: 900 },
];

function makeSpec(
  type: ChartType,
  encodings: ChartSpec["encodings"],
): ChartSpec {
  return { schema_version: 1, chart: { type, title: type }, encodings };
}

const xy = {
  x: { field: "month", value_type: "categorical" as const },
  y: { field: "revenue", value_type: "numeric" as const },
};

describe("validateChannels: 11 种图型必需通道齐全时不抛", () => {
  it("全部图型带 x+y 均通过", () => {
    for (const type of ALL_TYPES) {
      expect(() => validateChannels(makeSpec(type, xy)), type).not.toThrow();
    }
  });

  it("series 对所有图型都可选（带上也不抛）", () => {
    for (const type of ALL_TYPES) {
      const enc = {
        ...xy,
        series: { field: "region", value_type: "categorical" as const },
      };
      expect(() => validateChannels(makeSpec(type, enc)), type).not.toThrow();
    }
  });

  it("pie/donut 不强制 series（后端忽略 series，输出不变）", () => {
    for (const type of ["pie", "donut"] as const) {
      expect(() => validateChannels(makeSpec(type, xy)), type).not.toThrow();
    }
  });
});

describe("validateChannels: 缺通道抛错并点名缺失通道", () => {
  it("groupedBar 缺 y（reviewer 的 M3 原样 spec）抛错且消息点名 y", () => {
    const spec = makeSpec("groupedBar", {
      x: { field: "month", value_type: "categorical" },
      series: { field: "region" },
    });
    expect(() => validateChannels(spec)).toThrowError(
      "groupedBar 需要 x 与 y 通道，缺少: y",
    );
  });

  it("line 缺 x 抛错并点名 x", () => {
    const spec = makeSpec("line", { y: xy.y });
    expect(() => validateChannels(spec)).toThrowError(/line 需要 x 与 y 通道，缺少: x/);
  });

  it("strip 缺 x 抛错并点名 x", () => {
    const spec = makeSpec("strip", { y: xy.y });
    expect(() => validateChannels(spec)).toThrowError(/strip 需要 x 与 y 通道，缺少: x/);
  });

  it("donut 缺 y 抛错并点名 y", () => {
    const spec = makeSpec("donut", { x: xy.x });
    expect(() => validateChannels(spec)).toThrowError(/donut 需要 x 与 y 通道，缺少: y/);
  });

  it("pie 缺 x 与 y 两个通道时消息同时点名二者", () => {
    const spec = makeSpec("pie", {});
    expect(() => validateChannels(spec)).toThrowError(
      /pie 需要 x 与 y 通道，缺少: x、y/,
    );
  });

  it("bar 空 encodings（非良构）抛错点名 x、y", () => {
    const spec = makeSpec("bar", {});
    expect(() => validateChannels(spec)).toThrowError(/bar 需要 x 与 y 通道，缺少: x、y/);
  });
});

describe("toHighcharts 与 toECharts 对同一坏 spec 双端抛相同错误", () => {
  const reviewerSpec = makeSpec("groupedBar", {
    x: { field: "month", value_type: "categorical" },
    series: { field: "region" },
  });
  const MSG = "groupedBar 需要 x 与 y 通道，缺少: y";

  const capture = (fn: () => unknown): string | null => {
    try {
      fn();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  it("toHighcharts / toECharts 都抛，消息一致且点名 y", () => {
    const hc = capture(() => toHighcharts(sales, reviewerSpec));
    const ec = capture(() => toECharts(sales, reviewerSpec));
    expect(hc).toBe(MSG);
    expect(ec).toBe(MSG);
  });

  it("buildHighcharts / buildECharts 同样在进入后端前抛错", () => {
    // 一站式入口（变换后再转换）：M3 spec 无 transform_plan，直接进 to* 校验
    const hc = capture(() => buildHighcharts(sales, reviewerSpec));
    const ec = capture(() => buildECharts(sales, reviewerSpec));
    expect(hc).toBe(MSG);
    expect(ec).toBe(MSG);
  });
});

describe("空数据仍合法：通道齐全 + 0 行不抛（回归保护）", () => {
  const barSpec = makeSpec("bar", xy);

  it("toHighcharts([]) 不抛", () => {
    expect(() => toHighcharts([], barSpec)).not.toThrow();
  });

  it("toECharts([]) 不抛", () => {
    expect(() => toECharts([], barSpec)).not.toThrow();
  });
});
