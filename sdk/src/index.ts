/**
 * @chartbrain/sdk —— ChartBrain 消费端 SDK（D13）。
 *
 * 确定性步骤全部在本地完成：① 执行声明式变换 ② 中性 spec → 库配置 ③ 数据绑定。
 * MVP 只提供 Highcharts 后端（D11）；ECharts 后端经 flint-js（M5，D12）。
 */

import { toHighcharts } from "./converter/highcharts.js";
import type { HighchartsOption } from "./converter/highcharts.js";
import { toECharts } from "./converter/echarts.js";
import { executeTransform } from "./transform.js";

export { executeTransform } from "./transform.js";
export { toHighcharts } from "./converter/highcharts.js";
export { toECharts } from "./converter/echarts.js";
export type { HighchartsOption, HighchartsSeries } from "./converter/highcharts.js";
export type * from "./types.js";

/**
 * 一站式入口：执行变换（如有）→ 转换出 Highcharts 配置。
 *
 * @param data 消费端本地全量数据（行数组）
 * @param spec 服务端返回的中性 chart spec
 */
export function buildHighcharts(data: Record<string, unknown>[], spec: Parameters<typeof toHighcharts>[1]): HighchartsOption {
  const steps = spec.transform_plan?.steps;
  const rows = steps && steps.length > 0 ? executeTransform(data, steps) : data;
  return toHighcharts(rows, spec);
}

/**
 * 一站式入口（ECharts 后端，D12）：执行变换（如有）→ 交给 flint-js 编译出 ECharts option。
 */
export function buildECharts(data: Record<string, unknown>[], spec: Parameters<typeof toECharts>[1]): unknown {
  const steps = spec.transform_plan?.steps;
  const rows = steps && steps.length > 0 ? executeTransform(data, steps) : data;
  return toECharts(rows, spec);
}
