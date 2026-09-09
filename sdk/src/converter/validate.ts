/**
 * 通道完整性校验（M3 review 修复）：必需通道缺失时必须抛错，而不是把坏 spec
 * 漏给后端产出垃圾配置（Highcharts 模板对缺通道直接早退 → chart={}、无 series；
 * ECharts 则静默画成另一张图）。
 *
 * 必需通道表依据「后端实际消费什么」推导，双端一致（SDK 映射 + vendor 模板）：
 * - bar / groupedBar / stackedBar：读 x（分类轴）+ y（数值轴）；缺任一 → 模板早退
 *   （vendor .../src/highcharts/templates/bar.ts:50 `if (!catField || !valField) return;`
 *   ——M3 实测的垃圾输出即由此而来；groupedBar 的 series 走 group 通道，可选）
 * - line / slope：读 x + y（slope 委托 line 模板，vendor .../highcharts/templates/line.ts:30
 *   与 slope.ts:21）；series → color 拆分，可选
 * - area：同上（vendor .../highcharts/templates/area.ts:26）
 * - scatter / connectedScatter：读 x + y（vendor .../highcharts/templates/scatter.ts:19、
 *   connected-scatter.ts:19）；series 可选
 * - strip：x 为带（分类）+ y 为度量（vendor .../highcharts/templates/strip.ts:27
 *   `if (!catField || !yField) return;`）——注意：模板不校验 x 的类型，数值 x 也会被当
 *   分类带处理（容忍而非拒绝），故此处只要求通道在场，类型语义留给上层 L2
 * - pie / donut：中性 spec 的 x=分类（映射 color）、y=数值（映射 size），两个都需要
 *   （vendor .../highcharts/templates/pie.ts:17-18 读 color/size，donut 委托 pie；
 *   SDK 映射 highcharts.ts:77-82 / echarts.ts:43-46 只映射 x→color、y→size）
 *   ——series 对 pie/donut 既不必须也不禁止：SDK 映射直接丢弃它，模板也不读 group/color，
 *   多传一个 series 不会改变输出
 * - series：所有图型都可选（有则分组/堆叠，无则单系列）
 *
 * 校验只查通道存在性，不看数据：空数据（0 行）是合法输入，必须照常工作。
 */

import type { ChartSpec, ChartType } from "../types.js";

/** 每个图型必需的通道（series 从未出现在任何列表里——它总是可选的）。 */
export const REQUIRED_CHANNELS: Readonly<Record<ChartType, readonly ("x" | "y")[]>> = {
  bar: ["x", "y"],
  line: ["x", "y"],
  pie: ["x", "y"], // x=分类→color，y=数值→size
  scatter: ["x", "y"],
  area: ["x", "y"],
  groupedBar: ["x", "y"],
  stackedBar: ["x", "y"],
  donut: ["x", "y"], // 同 pie
  slope: ["x", "y"],
  connectedScatter: ["x", "y"],
  strip: ["x", "y"], // x=分类带，y=度量
};

/**
 * 校验 spec 的通道完整性；缺失时抛 `new Error`，消息点名图型与缺失通道。
 * 在两个后端的转换入口（toHighcharts / toECharts）进入任何后端工作前调用。
 */
export function validateChannels(spec: ChartSpec): void {
  const type: ChartType = spec.chart.type;
  const encodings = spec.encodings ?? {};
  const required = REQUIRED_CHANNELS[type] ?? [];
  const missing = required.filter((ch) => !encodings[ch]);
  if (missing.length > 0) {
    throw new Error(
      `${type} 需要 ${required.join(" 与 ")} 通道，缺少: ${missing.join("、")}`,
    );
  }
}
