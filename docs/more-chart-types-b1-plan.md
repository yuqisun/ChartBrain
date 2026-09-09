# B1 图型扩展实施计划（6 个图型）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `groupedBar / stackedBar / donut / slope / connectedScatter / strip` 六个新图型在 Highcharts 与 ECharts 两端都可用、行为一致，并打通「模板 → 契约白名单 → SDK 映射 → 双端验收」整条链路。

**Architecture:** 每个图型 = ① vendor 内新增/复用 Highcharts 模板（复用 core 语义/布局管线）② 两端注册 ③ 契约白名单 4 处（schema / prompt / SDK 类型 / 转换器映射）④ 双端差分验收。Donut 额外需要给 ECharts 端补一个模板，否则会变成单库专属。

**Tech Stack:** TypeScript · vendored flint-js 0.5.1 · Highcharts 12.6.0 · ECharts 5 · vitest 4（真实运行）/ tsc + Node（沙箱内验证）

**设计依据:** `docs/more-chart-types-design.md`（§2.2 清单、§4 契约、§5 数据形状、§6 验收）

---

## 验证环境（务必先读）

本机沙箱**无法运行 npm 生命周期脚本与 vitest**（esbuild 需要子进程管道，报 `spawn EPERM`）。因此计划中的验证分两类：

| 用途 | 命令 | 谁执行 |
|---|---|---|
| 类型检查 | `node D:\work\aichart\ChartBrain\sdk\node_modules\typescript\bin\tsc -p <vendor>/tsconfig.json --noEmit` | 执行者 |
| 行为验证 | `node scripts/chart-parity.mjs`（Task 0 建） | 执行者 |
| **权威测试** | `cd vendor/flint-chart/packages/flint-js && npm test`；`cd sdk && npm test` | **用户**（每个 Task 的提交前由执行者请用户跑，或批次末统一跑） |

所有路径以仓库根 `D:\work\aichart\ChartBrain` 为基准；下文 `<vendor>` = `vendor/flint-chart/packages/flint-js`。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `scripts/chart-parity.mjs` | 新建 | 双端一致性检查（同一输入 → 两个后端 → 比对） |
| `<vendor>/src/highcharts/templates/bar.ts` | 改 | 抽出 `buildBarDef(chart, stacked)`，导出 Bar / Stacked / Grouped |
| `<vendor>/src/highcharts/templates/donut.ts` | 新建 | Donut（复用 pie + 默认内径 50） |
| `<vendor>/src/highcharts/templates/slope.ts` | 新建 | Slope（复用 line + 端点标记） |
| `<vendor>/src/highcharts/templates/connected-scatter.ts` | 新建 | 连线散点（保序，不排序） |
| `<vendor>/src/highcharts/templates/strip.ts` | 新建 | 条带图（scatter + 确定性 jitter） |
| `<vendor>/src/highcharts/templates/index.ts` | 改 | 注册 6 个新模板 |
| `<vendor>/src/echarts/templates/pie.ts` | 改 | 新增 `ecDonutChartDef` |
| `<vendor>/src/echarts/templates/index.ts` | 改 | 注册 EC Donut |
| `<vendor>/src/echarts/instantiate-spec.ts` | 改 | `colorByDataItem` 加入 `'Donut Chart'`（否则扇区失去逐项配色） |
| `<vendor>/tests/highcharts.test.ts` | 改 | 6 个新图型的用例 |
| `specs/chart-spec.schema.json` | 改 | `chart.type` enum 加 6 个值 |
| `sdk/src/types.ts` | 改 | `ChartType` union |
| `sdk/src/converter/highcharts.ts` | 改 | 类型 → Flint 名映射 + 按图型映射通道 |
| `sdk/src/converter/echarts.ts` | 改 | 同上 |
| `server/chartbrain_server/spec/prompt.py` | 改 | 白名单第 28 行 + 6 个 few-shot |
| `examples/dual-demo/offline.mjs` | 改 | 对比页覆盖新图型 |
| `docs/INTEGRATION.md` | 改 | 输出契约补新图型 + 模块对照表 |

---

### Task 0: 建立双端一致性脚本

**Files:**
- Create: `scripts/chart-parity.mjs`

- [ ] **Step 1: 写脚本**

```javascript
#!/usr/bin/env node
/**
 * 双端一致性检查：同一份 Flint 输入分别交给 Highcharts 后端与 ECharts 后端，
 * 断言 图型 / series 数 / 点数 / 逐 series y 值 一致。
 *
 * 用法：
 *   node scripts/chart-parity.mjs                    # 用 vendor 的 dist
 *   node scripts/chart-parity.mjs --dist <dir>       # 用任意构建产物目录（须含 */index.cjs）
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const i = process.argv.indexOf('--dist');
const DIST = i > -1
  ? path.resolve(process.argv[i + 1])
  : path.join(root, 'vendor/flint-chart/packages/flint-js/dist');

for (const f of ['highcharts/index.cjs', 'echarts/index.cjs']) {
  if (!existsSync(path.join(DIST, f))) {
    console.error(`✗ 找不到 ${path.join(DIST, f)}\n  先在 vendor 目录执行 npm run build`);
    process.exit(2);
  }
}
const { assembleHighcharts } = require(path.join(DIST, 'highcharts/index.cjs'));
const { assembleECharts } = require(path.join(DIST, 'echarts/index.cjs'));

const CAT = [
  { month: '2026-01', period: 'before', region: 'East', revenue: 120 },
  { month: '2026-02', period: 'before', region: 'East', revenue: 150 },
  { month: '2026-01', period: 'after', region: 'West', revenue: 90 },
  { month: '2026-02', period: 'after', region: 'West', revenue: 110 },
];
const SCAT = [
  { weight: 1.6, mpg: 32, origin: 'JP' },
  { weight: 2.1, mpg: 27, origin: 'US' },
  { weight: 1.9, mpg: 29, origin: 'EU' },
];
const CAT_BASE = {
  data: { values: CAT },
  semantic_types: { month: 'YearMonth', period: 'Category', region: 'Country', revenue: 'Price' },
};
const SCAT_BASE = {
  data: { values: SCAT },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
};
const inp = (chartType, encodings, base = CAT_BASE) => ({
  ...base,
  chart_spec: { chartType, encodings },
});

const CASES = [
  { label: 'Bar Chart', input: inp('Bar Chart', { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'column', ec: 'bar' },
  { label: 'Line Chart', input: inp('Line Chart', { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'line', ec: 'line' },
  { label: 'Area Chart', input: inp('Area Chart', { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'area', ec: 'line' },
  { label: 'Scatter Plot', input: inp('Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } }, SCAT_BASE), hc: 'scatter', ec: 'scatter' },
  { label: 'Pie Chart', input: inp('Pie Chart', { color: { field: 'region' }, size: { field: 'revenue' } }), hc: 'pie', ec: 'pie' },
  // B1 新增
  { label: 'Grouped Bar Chart', input: inp('Grouped Bar Chart', { x: { field: 'month' }, y: { field: 'revenue' }, group: { field: 'region' } }), hc: 'column', ec: 'bar' },
  { label: 'Stacked Bar Chart', input: inp('Stacked Bar Chart', { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'column', ec: 'bar' },
  { label: 'Donut Chart', input: inp('Donut Chart', { color: { field: 'region' }, size: { field: 'revenue' } }), hc: 'pie', ec: 'pie' },
  { label: 'Slope Chart', input: inp('Slope Chart', { x: { field: 'period' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'line', ec: 'line' },
  { label: 'Connected Scatter Plot', input: inp('Connected Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } }, SCAT_BASE), hc: 'line', ec: 'line' },
  { label: 'Strip Plot', input: inp('Strip Plot', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'scatter', ec: 'scatter' },
];

const pointsOf = (o) => (o.series ?? []).reduce((n, s) => n + (Array.isArray(s.data) ? s.data.length : 0), 0);
const yOf = (d) => (Array.isArray(d) ? d[1] : (d && typeof d === 'object' ? (d.y ?? d.value) : d));
const isPie = (t) => /Pie|Donut/i.test(t);
const norm = (o, pie) => (o.series ?? []).map((s) =>
  (s.data ?? []).map((d) => (pie ? [d?.name, d?.y ?? d?.value] : yOf(d))));

let pass = 0;
const fails = [];
for (const c of CASES) {
  try {
    const hc = assembleHighcharts(c.input);
    const ec = assembleECharts(c.input);
    const pie = isPie(c.label);
    if (hc.chart?.type !== c.hc) throw new Error(`HC 图型 ${hc.chart?.type} ≠ ${c.hc}`);
    const ecType = (ec.series ?? [])[0]?.type;
    if (ecType !== c.ec) throw new Error(`EC 图型 ${ecType} ≠ ${c.ec}`);
    if ((hc.series ?? []).length !== (ec.series ?? []).length) {
      throw new Error(`series 数 ${(hc.series ?? []).length} ≠ ${(ec.series ?? []).length}`);
    }
    if (pointsOf(hc) !== pointsOf(ec)) throw new Error(`点数 ${pointsOf(hc)} ≠ ${pointsOf(ec)}`);
    const a = JSON.stringify(norm(hc, pie));
    const b = JSON.stringify(norm(ec, pie));
    if (a !== b) throw new Error(`逐点值不一致\n    HC ${a}\n    EC ${b}`);
    console.log(`  ✓ ${c.label}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${c.label}\n      ${e.message}`);
    fails.push(c.label);
  }
}
console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
```

- [ ] **Step 2: 跑一遍建立基线**

Run: `node scripts/chart-parity.mjs`
Expected: 前 5 个（Bar/Line/Area/Scatter/Pie）**✓**，后 6 个 **✗**（模板尚未实现）——这是本批的失败基线。

- [ ] **Step 3: 提交**

```bash
git add scripts/chart-parity.mjs
git commit -m "test: 新增双端一致性检查脚本（B1 验收基线）"
```

---

### Task 1: Bar 家族（Grouped / Stacked）

**Files:**
- Modify: `<vendor>/src/highcharts/templates/bar.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 `describe('highcharts backend smoke', …)` 内）

```typescript
  it('Grouped Bar Chart → side-by-side columns, no stacking', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Grouped Bar Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' }, group: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('column');
    expect(option.series).toHaveLength(2);
    expect(option.series.every((s: any) => s.type === 'column')).toBe(true);
    expect(option.plotOptions?.series?.stacking).toBeUndefined();
  });

  it('Stacked Bar Chart → stacked columns', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Stacked Bar Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('column');
    expect(option.plotOptions.series.stacking).toBe('normal');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/chart-parity.mjs`
Expected: `Grouped Bar Chart` / `Stacked Bar Chart` 两行 ✗，报 `Unknown Highcharts chart type`。

- [ ] **Step 3: 重构 `bar.ts` 为工厂 + 三个导出**

把现有 `hcBarChartDef` 的对象字面量改成工厂函数（其余逻辑原样保留）：

```typescript
// 顶部：新增工厂
function buildBarDef(chart: string, stacked: boolean): ChartTemplateDef {
    return {
        chart,
        template: { mark: 'bar', encoding: {} },
        // Grouped 用 group 通道（并排），Stacked 用 color 通道（堆叠）
        channels: stacked
            ? ['x', 'y', 'color', 'opacity']
            : ['x', 'y', 'group', 'color', 'opacity'],
        markCognitiveChannel: 'length',
        declareLayoutMode: (cs, table) => {
            const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
            return {
                axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
                resolvedTypes: result?.resolvedTypes,
            };
        },
        instantiate: (spec, ctx) => {
            /* 现有 instantiate 主体整体搬进来，仅把这一处改掉： */
            // 原：if (colorField && !bothDiscrete) option.plotOptions = { series: { stacking: 'normal' } };
            if (stacked && colorField && !bothDiscrete) {
                option.plotOptions = { ...(option.plotOptions ?? {}), series: { stacking: 'normal' } };
            }
        },
        properties: [
            { key: 'cornerRadius', label: 'Corners', type: 'continuous', min: 0, max: 15, step: 1, defaultValue: 0 },
        ] as ChartPropertyDef[],
    };
}

export const hcBarChartDef = buildBarDef('Bar Chart', true);
export const hcStackedBarChartDef = buildBarDef('Stacked Bar Chart', true);
export const hcGroupedBarChartDef = buildBarDef('Grouped Bar Chart', false);
```

注意：`instantiate` 里判断分组字段的行保持
`const colorField = channelSemantics.color?.field ?? channelSemantics.group?.field;`（Grouped 传 `group`，Stacked 传 `color`）。

- [ ] **Step 4: 注册**

`<vendor>/src/highcharts/templates/index.ts`：

```typescript
import { hcBarChartDef, hcGroupedBarChartDef, hcStackedBarChartDef } from './bar';
// …
'Bar': [hcBarChartDef, hcGroupedBarChartDef, hcStackedBarChartDef],
```

- [ ] **Step 5: 类型检查 + 行为验证**

Run:
```
node D:\work\aichart\ChartBrain\sdk\node_modules\typescript\bin\tsc -p <vendor>/tsconfig.json --noEmit
node D:\work\aichart\ChartBrain\sdk\node_modules\typescript\bin\tsc -p <vendor>/tsconfig.json --module commonjs --moduleResolution node --outDir D:\work\aichart\.tmp-build --declaration false --sourceMap false
node scripts/chart-parity.mjs --dist D:\work\aichart\.tmp-build
```
Expected: tsc 无输出；parity 里 Grouped / Stacked 两行变 ✓，其余 4 个新图型仍 ✗。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望 54 files / 1104 passed（新增 2 例）。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/bar.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Grouped Bar / Stacked Bar 模板"
```

---

### Task 2: Donut（Highcharts + ECharts 两端）

**Files:**
- Create: `<vendor>/src/highcharts/templates/donut.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Modify: `<vendor>/src/echarts/templates/pie.ts`
- Modify: `<vendor>/src/echarts/templates/index.ts`
- Modify: `<vendor>/src/echarts/instantiate-spec.ts:1188`
- Test: `<vendor>/tests/highcharts.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
  it('Donut Chart → pie with a hole', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Donut Chart',
        encodings: { color: { field: 'region' }, size: { field: 'revenue' } },
      },
    }) as any;

    expect(option.chart.type).toBe('pie');
    expect(option.series[0].type).toBe('pie');
    expect(option.series[0].innerSize).toBe('50%');
    expect(option.series[0].data).toHaveLength(2);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/chart-parity.mjs`
Expected: `Donut Chart` ✗（`Unknown Highcharts chart type`）。

- [ ] **Step 3: 新建 Highcharts Donut 模板**

`<vendor>/src/highcharts/templates/donut.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Donut Chart — a pie with a hole. Mirrors the Vega-Lite backend's
// donutChartDef: property defaults are not merged into `chartProperties` at
// assemble time, so the non-zero default must be applied here before delegating.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { hcPieChartDef } from './pie';

const DONUT_DEFAULT_INNER_RADIUS = 50;

export const hcDonutChartDef: ChartTemplateDef = {
    ...hcPieChartDef,
    chart: 'Donut Chart',
    properties: (hcPieChartDef.properties ?? []).map(p =>
        p.key === 'innerRadius' ? { ...p, defaultValue: DONUT_DEFAULT_INNER_RADIUS } : p,
    ) as ChartPropertyDef[],
    instantiate: (spec, ctx) => {
        const innerRadius = ctx.chartProperties?.innerRadius;
        const withHole = innerRadius == null
            ? {
                ...ctx,
                chartProperties: { ...(ctx.chartProperties ?? {}), innerRadius: DONUT_DEFAULT_INNER_RADIUS },
            }
            : ctx;
        hcPieChartDef.instantiate(spec, withHole);
    },
};
```

- [ ] **Step 4: 新建 ECharts Donut 模板**

`<vendor>/src/echarts/templates/pie.ts` 末尾追加（复用同一套写法）：

```typescript
/** The hole a Donut Chart gets when the caller sets no `innerRadius`. */
const DONUT_DEFAULT_INNER_RADIUS = 50;

export const ecDonutChartDef: ChartTemplateDef = {
    ...ecPieChartDef,
    chart: 'Donut Chart',
    properties: (ecPieChartDef.properties ?? []).map(p =>
        p.key === 'innerRadius' ? { ...p, defaultValue: DONUT_DEFAULT_INNER_RADIUS } : p,
    ) as ChartPropertyDef[],
    instantiate: (spec, ctx) => {
        const innerRadius = ctx.chartProperties?.innerRadius;
        const withHole = innerRadius == null
            ? {
                ...ctx,
                chartProperties: { ...(ctx.chartProperties ?? {}), innerRadius: DONUT_DEFAULT_INNER_RADIUS },
            }
            : ctx;
        ecPieChartDef.instantiate(spec, withHole);
    },
};
```

- [ ] **Step 5: 注册两端**

`<vendor>/src/highcharts/templates/index.ts`：
```typescript
import { hcDonutChartDef } from './donut';
// …
'Part-to-Whole':   [hcPieChartDef, hcDonutChartDef],
```
`<vendor>/src/echarts/templates/index.ts`：
```typescript
import { ecPieChartDef, ecDonutChartDef } from './pie';
// …
'Part-to-Whole':   [ecPieChartDef, ecDonutChartDef, ecFunnelChartDef, ecTreemapDef, ecSunburstDef, ecTreeDef],
```

- [ ] **Step 6: 修 ECharts 的 chartType 分支**

`<vendor>/src/echarts/instantiate-spec.ts:1188`：

```typescript
            const colorByDataItem = context.chartType === 'Pie Chart'
                || context.chartType === 'Donut Chart'
                || context.chartType === 'Rose Chart'
                || context.chartType === 'Streamgraph'
                || context.chartType === 'Sunburst Chart';
```

- [ ] **Step 7: 类型检查 + 行为验证**

Run（同 Task 1 Step 5 的三条命令）
Expected: `Donut Chart` 行 ✓；tsc 无输出。

- [ ] **Step 8: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望 54 files / 1105 passed。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/donut.ts <vendor>/src/highcharts/templates/index.ts \
        <vendor>/src/echarts/templates/pie.ts <vendor>/src/echarts/templates/index.ts \
        <vendor>/src/echarts/instantiate-spec.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(charts): Donut Chart 双端模板（含 EC 端逐项配色修复）"
```

---

### Task 3: Slope Chart

**Files:**
- Create: `<vendor>/src/highcharts/templates/slope.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
  it('Slope Chart → one line per entity across two periods', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Slope Chart',
        encodings: { x: { field: 'period' }, y: { field: 'revenue' }, color: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('line');
    expect(option.series).toHaveLength(2);
    expect(option.series[0].data).toHaveLength(2);
    expect(option.series[0].marker.enabled).toBe(true);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/chart-parity.mjs`
Expected: `Slope Chart` ✗。

- [ ] **Step 3: 实现**

`<vendor>/src/highcharts/templates/slope.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Slope Chart — two periods joined per entity. Reuses the line
// template (category axis, one series per group) and adds end-point markers.

import { ChartTemplateDef } from '../../core/types';
import { hcLineChartDef } from './line';

export const hcSlopeChartDef: ChartTemplateDef = {
    ...hcLineChartDef,
    chart: 'Slope Chart',
    instantiate: (spec, ctx) => {
        hcLineChartDef.instantiate(spec, ctx);
        for (const s of spec.series ?? []) {
            s.marker = { enabled: true, radius: 4 };
        }
    },
};
```

- [ ] **Step 4: 注册**

`<vendor>/src/highcharts/templates/index.ts`：
```typescript
import { hcSlopeChartDef } from './slope';
// …
'Line & Area': [hcLineChartDef, hcAreaChartDef, hcSlopeChartDef],
```

- [ ] **Step 5: 类型检查 + 行为验证**

Run（同 Task 1 Step 5）
Expected: `Slope Chart` ✓。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望 1106 passed。

```bash
git add <vendor>/src/highcharts/templates/slope.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Slope Chart 模板"
```

---

### Task 4: Connected Scatter Plot

**Files:**
- Create: `<vendor>/src/highcharts/templates/connected-scatter.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

- [ ] **Step 1: 写失败测试**（关键是**保序**：不按 x 排序）

```typescript
  it('Connected Scatter Plot → path follows data order (no sorting)', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { x: 3, y: 1, g: 'A' },
          { x: 1, y: 2, g: 'A' },
          { x: 2, y: 3, g: 'A' },
        ],
      },
      semantic_types: { x: 'Quantity', y: 'Quantity', g: 'Category' },
      chart_spec: {
        chartType: 'Connected Scatter Plot',
        encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'g' } },
      },
    }) as any;

    expect(option.chart.type).toBe('line');
    expect(option.series[0].data).toEqual([[3, 1], [1, 2], [2, 3]]);
    expect(option.series[0].marker.enabled).toBe(true);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/chart-parity.mjs`
Expected: `Connected Scatter Plot` ✗。

- [ ] **Step 3: 实现**

`<vendor>/src/highcharts/templates/connected-scatter.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Connected Scatter Plot — points joined in DATA ORDER (a path, not
// a sorted series). This is the one line-family template that must NOT sort by x.

import { ChartTemplateDef } from '../../core/types';
import { groupBy } from './utils';

export const hcConnectedScatterDef: ChartTemplateDef = {
    chart: 'Connected Scatter Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        if (!xField || !yField) return;

        const colorField = channelSemantics.color?.field ?? channelSemantics.group?.field;
        const toPairs = (rows: any[]) => rows
            .map(r => [Number(r[xField]), Number(r[yField])] as [number, number])
            .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));

        const series: any[] = [];
        if (colorField) {
            for (const [name, rows] of groupBy(table, colorField)) {
                series.push({ name, type: 'line', data: toPairs(rows), marker: { enabled: true, radius: 4 } });
            }
        } else {
            series.push({ name: yField, type: 'line', data: toPairs(table), marker: { enabled: true, radius: 4 } });
        }

        Object.assign(spec, {
            chart: { type: 'line' },
            xAxis: { type: 'linear', title: { text: xField } },
            yAxis: { type: 'linear', title: { text: yField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'axis', categoryLabel: xField, valueLabel: yField, groupLabel: colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
```

- [ ] **Step 4: 注册**

```typescript
import { hcConnectedScatterDef } from './connected-scatter';
// …
'Scatter & Point': [hcScatterPlotDef, hcConnectedScatterDef],
```

- [ ] **Step 5: 类型检查 + 行为验证**

Run（同 Task 1 Step 5）
Expected: `Connected Scatter Plot` ✓。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望 1107 passed。

```bash
git add <vendor>/src/highcharts/templates/connected-scatter.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Connected Scatter Plot 模板（保序路径）"
```

---

### Task 5: Strip Plot

**Files:**
- Create: `<vendor>/src/highcharts/templates/strip.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

- [ ] **Step 1: 写失败测试**（断言 jitter 确定性：同一输入两次结果相同）

```typescript
  it('Strip Plot → deterministic jitter within each category band', () => {
    const input = {
      data: {
        values: [
          { region: 'East', revenue: 120 },
          { region: 'East', revenue: 150 },
          { region: 'West', revenue: 90 },
        ],
      },
      semantic_types: { region: 'Country', revenue: 'Price' },
      chart_spec: {
        chartType: 'Strip Plot',
        encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
      },
    } as any;

    const a = assembleHighcharts(input) as any;
    const b = assembleHighcharts(input) as any;

    expect(a.chart.type).toBe('scatter');
    expect(a.series[0].data).toHaveLength(3);
    expect(a.series[0].data).toEqual(b.series[0].data);
    // y 值保持原值；x 被抖动到类目带内
    expect(a.series[0].data.map((p: any) => p[1])).toEqual([120, 150, 90]);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/chart-parity.mjs`
Expected: `Strip Plot` ✗。

- [ ] **Step 3: 实现**

`<vendor>/src/highcharts/templates/strip.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Strip Plot — a scatter whose x is a category, with each point
// jittered inside its band so overlapping observations stay visible. The jitter
// is deterministic (derived from the row index) so output is reproducible.

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, getCategoryOrder } from './utils';

/** Deterministic offset in [-0.4, 0.4] of a category band. */
function jitter(index: number): number {
    const x = Math.sin(index * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 0.8 - 0.4;
}

export const hcStripPlotDef: ChartTemplateDef = {
    chart: 'Strip Plot',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yField = channelSemantics.y?.field;
        const catField = xCS?.field;
        if (!catField || !yField) return;

        const categories = extractCategories(table, catField, getCategoryOrder(ctx, 'x'));
        const indexOf = new Map(categories.map((c, i) => [c, i]));

        const colorField = channelSemantics.color?.field ?? channelSemantics.group?.field;
        const build = (rows: any[]) => rows
            .map((r, i) => {
                const cat = String(r[catField] ?? '');
                const slot = indexOf.get(cat);
                const y = Number(r[yField]);
                if (slot === undefined || !Number.isFinite(y)) return null;
                return [slot + jitter(i), y] as [number, number];
            })
            .filter((p): p is [number, number] => p !== null);

        const series: any[] = [];
        if (colorField) {
            const groups = new Map<string, any[]>();
            for (const r of table) {
                const k = String(r[colorField] ?? '');
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k)!.push(r);
            }
            for (const [name, rows] of groups) series.push({ name, type: 'scatter', data: build(rows) });
        } else {
            series.push({ name: yField, type: 'scatter', data: build(table) });
        }

        Object.assign(spec, {
            chart: { type: 'scatter' },
            xAxis: {
                type: 'category',
                categories,
                title: { text: catField },
                min: -0.5,
                max: categories.length - 0.5,
            },
            yAxis: { type: 'linear', title: { text: yField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'item', categoryLabel: catField, valueLabel: yField, groupLabel: colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
```

- [ ] **Step 4: 注册**

```typescript
import { hcStripPlotDef } from './strip';
// …
'Scatter & Point': [hcScatterPlotDef, hcConnectedScatterDef, hcStripPlotDef],
```

- [ ] **Step 5: 类型检查 + 行为验证**

Run（同 Task 1 Step 5）
Expected: `Strip Plot` ✓；`node scripts/chart-parity.mjs` 全绿（11 行）。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望 1108 passed。

```bash
git add <vendor>/src/highcharts/templates/strip.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Strip Plot 模板（确定性 jitter）"
```

---

### Task 6: 契约白名单（4 处）

**Files:**
- Modify: `specs/chart-spec.schema.json`
- Modify: `sdk/src/types.ts`
- Modify: `sdk/src/converter/highcharts.ts`
- Modify: `sdk/src/converter/echarts.ts`

- [ ] **Step 1: 扩展 schema enum**

`specs/chart-spec.schema.json` 第 18 行：

```json
        "type": {
          "description": "Controlled chart-type whitelist",
          "enum": [
            "bar", "line", "pie", "scatter", "area",
            "groupedBar", "stackedBar", "donut", "slope", "connectedScatter", "strip"
          ]
        },
```

- [ ] **Step 2: 扩展 SDK 类型**

`sdk/src/types.ts` 第 6 行：

```typescript
export type ChartType =
  | "bar" | "line" | "pie" | "scatter" | "area"
  | "groupedBar" | "stackedBar" | "donut" | "slope" | "connectedScatter" | "strip";
```

- [ ] **Step 3: Highcharts 适配器映射**

`sdk/src/converter/highcharts.ts`，替换 `FLINT_CHART_TYPE` 与通道映射：

```typescript
const FLINT_CHART_TYPE: Record<ChartType, string> = {
  bar: "Bar Chart",
  line: "Line Chart",
  pie: "Pie Chart",
  scatter: "Scatter Plot",
  area: "Area Chart",
  groupedBar: "Grouped Bar Chart",
  stackedBar: "Stacked Bar Chart",
  donut: "Donut Chart",
  slope: "Slope Chart",
  connectedScatter: "Connected Scatter Plot",
  strip: "Strip Plot",
};

/** 图型 → 通道映射规则（默认 x/y/series→color，特例见下）。 */
function buildEncodings(spec: ChartSpec): Record<string, { field: string }> {
  const encodings: Record<string, { field: string }> = {};
  const x = spec.encodings.x;
  const y = spec.encodings.y;
  const s = spec.encodings.series;

  switch (spec.chart.type) {
    case "pie":
    case "donut":
      // 饼/环：x=分类（color），y=度量（size）
      if (x) encodings.color = { field: x.field };
      if (y) encodings.size = { field: y.field };
      break;
    case "groupedBar":
      // 分组柱：并排靠 group 通道
      if (x) encodings.x = { field: x.field };
      if (y) encodings.y = { field: y.field };
      if (s) encodings.group = { field: s.field };
      break;
    default:
      if (x) encodings.x = { field: x.field };
      if (y) encodings.y = { field: y.field };
      if (s) encodings.color = { field: s.field };
  }
  return encodings;
}
```

并把 `toHighcharts` 里构造 `input` 的 `encodings` 换成 `buildEncodings(spec)`。

- [ ] **Step 4: ECharts 适配器映射**

`sdk/src/converter/echarts.ts`：加同样的 `FLINT_CHART_TYPE` 6 个条目，并把 `if (spec.chart.type === "pie")` 改为 `if (spec.chart.type === "pie" || spec.chart.type === "donut")`，`groupedBar` 同样映射到 `group` 通道。

- [ ] **Step 5: 类型检查**

Run:
```
node D:\work\aichart\ChartBrain\sdk\node_modules\typescript\bin\tsc -p D:\work\aichart\.verify\tsconfig.sdk-strict.json --noEmit
```
（若 `.verify` 已清理，改用：`cd sdk && npx tsc -p tsconfig.json --noEmit`，由用户执行）
Expected: 无输出。

- [ ] **Step 6: 请用户跑 sdk 测试并提交**

请用户执行：`cd sdk && npm run typecheck && npm test` → 期望 27 passed（本轮未加 SDK 用例，后续 Task 7 一并补）。
Expected: 全绿后提交。

```bash
git add specs/chart-spec.schema.json sdk/src/types.ts sdk/src/converter/highcharts.ts sdk/src/converter/echarts.ts
git commit -m "feat(spec): 白名单扩至 11 种图型（B1 六个）+ 双端通道映射"
```

---

### Task 7: 服务端提示词 + SDK 用例

**Files:**
- Modify: `server/chartbrain_server/spec/prompt.py:28`
- Modify: `sdk/tests/converter.test.ts`

- [ ] **Step 1: 更新白名单行**

`server/chartbrain_server/spec/prompt.py` 第 28 行改为：

```python
1. chart.type must be one of: bar | line | pie | scatter | area |
   groupedBar | stackedBar | donut | slope | connectedScatter | strip.
```

- [ ] **Step 2: 追加 6 个 few-shot 片段**

在 `prompt.py` 的 `few_shot_examples` 列表末尾追加（结构与既有条目一致：`query` / `columns` / `chart_spec`）：

```python
            {
                "query": "Compare revenue by month, side by side per region",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "groupedBar", "title": "Revenue by month and region"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["month", "region"],
                                "measures": [
                                    {"field": "revenue", "agg": "sum", "as": "monthly_revenue"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "month", "value_type": "categorical"},
                        "y": {"field": "monthly_revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
            {
                "query": "Show how revenue is composed by region each month",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "stackedBar", "title": "Revenue composition by region"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["month", "region"],
                                "measures": [
                                    {"field": "revenue", "agg": "sum", "as": "monthly_revenue"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "month", "value_type": "categorical"},
                        "y": {"field": "monthly_revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
            {
                "query": "Show each region's share of total revenue",
                "columns": [
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "donut", "title": "Revenue share by region"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["region"],
                                "measures": [
                                    {"field": "revenue", "agg": "sum", "as": "region_revenue"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "region", "value_type": "categorical"},
                        "y": {"field": "region_revenue", "value_type": "numeric"},
                    },
                },
            },
            {
                "query": "Compare each region's revenue between the two periods",
                "columns": [
                    {"name": "period", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "slope", "title": "Revenue shift by region"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["period", "region"],
                                "measures": [
                                    {"field": "revenue", "agg": "sum", "as": "period_revenue"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "period", "value_type": "categorical"},
                        "y": {"field": "period_revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
            {
                "query": "Trace how orders and revenue move together over time",
                "columns": [
                    {"name": "orders", "type": "number"},
                    {"name": "revenue", "type": "number"},
                    {"name": "region", "type": "string"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "connectedScatter", "title": "Orders vs revenue path"},
                    "encodings": {
                        "x": {"field": "orders", "value_type": "numeric"},
                        "y": {"field": "revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
            {
                "query": "Show the spread of revenue across regions",
                "columns": [
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "strip", "title": "Revenue spread by region"},
                    "encodings": {
                        "x": {"field": "region", "value_type": "categorical"},
                        "y": {"field": "revenue", "value_type": "numeric"},
                    },
                },
            },
```

注意 `connectedScatter` 与 `strip` **不带 transform_plan**（保留原始行顺序/原始分布是这两个图型的语义）。

- [ ] **Step 3: 追加 SDK 用例**

`sdk/tests/converter.test.ts` 的 `describe("toHighcharts 各图型")` 内追加：

```typescript
  it("donut（x/y 映射到 color/size）", () => {
    const opt = toHighcharts(
      [{ region: "华东", revenue: 4700 }, { region: "华南", revenue: 1700 }],
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
    expect(opt.series[0].innerSize).toBe("50%");
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
```

- [ ] **Step 4: 请用户跑权威测试并提交**

请用户执行：
- `cd sdk && npm run typecheck && npm test` → 期望 29 passed
- `cd server && .\.venv\Scripts\python -m pytest -q` → 期望 35 passed
Expected: 全绿后提交。

```bash
git add server/chartbrain_server/spec/prompt.py sdk/tests/converter.test.ts
git commit -m "feat(prompt): 白名单与 few-shot 扩至 11 种图型 + SDK 用例"
```

---

### Task 8: 示例与文档

**Files:**
- Modify: `examples/dual-demo/offline.mjs`
- Modify: `docs/INTEGRATION.md`

- [ ] **Step 1: 对比页覆盖新图型**

`examples/dual-demo/offline.mjs` 的 `CASES` 数组末尾追加 6 项（结构同既有项）：

```javascript
  {
    label: "Grouped Bar — monthly revenue by region (side by side)",
    spec: {
      schema_version: 1,
      chart: { type: "groupedBar", title: "Monthly revenue by region" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["month", "region"],
          measures: [{ field: "revenue", agg: "sum", as: "monthly_revenue" }],
        }],
      },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "monthly_revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Stacked Bar — monthly revenue composition",
    spec: {
      schema_version: 1,
      chart: { type: "stackedBar", title: "Revenue composition by region" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["month", "region"],
          measures: [{ field: "revenue", agg: "sum", as: "monthly_revenue" }],
        }],
      },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "monthly_revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Donut — revenue share by region",
    spec: {
      schema_version: 1,
      chart: { type: "donut", title: "Revenue share by region" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["region"],
          measures: [{ field: "revenue", agg: "sum", as: "region_revenue" }],
        }],
      },
      encodings: {
        x: { field: "region", value_type: "categorical" },
        y: { field: "region_revenue", value_type: "numeric" },
      },
    },
  },
  {
    label: "Slope — revenue shift across two half-years",
    spec: {
      schema_version: 1,
      chart: { type: "slope", title: "Revenue shift by region" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["month", "region"],
          measures: [{ field: "revenue", agg: "sum", as: "monthly_revenue" }],
        }],
      },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "monthly_revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Connected Scatter — orders vs revenue path",
    spec: {
      schema_version: 1,
      chart: { type: "connectedScatter", title: "Orders vs revenue path" },
      encodings: {
        x: { field: "orders", value_type: "numeric" },
        y: { field: "revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Strip — revenue spread by region",
    spec: {
      schema_version: 1,
      chart: { type: "strip", title: "Revenue spread by region" },
      encodings: {
        x: { field: "region", value_type: "categorical" },
        y: { field: "revenue", value_type: "numeric" },
      },
    },
  },
```

注：`Slope` 用 12 个月会让「两点斜率」变成折线，人工目测时以形态可辨为准；
若要严格的两点斜率，可在该用例的 `transform_plan` 里把 `month` 换成两段区间字段（B2 再优化）。

- [ ] **Step 2: 文档补输出契约与模块表**

`docs/INTEGRATION.md` 附录 C 的表格后追加：

```markdown
### Highcharts 模块对照表（B1 图型）

| 图型 | 需加载的模块 |
|---|---|
| groupedBar / stackedBar / donut / slope / connectedScatter / strip | 无（核心包即可） |
| lollipop（B2） | `highcharts/modules/lollipop.js` |
| waterfall / boxplot / gauge（B2） | `highcharts/highcharts-more.js` |
| funnel / pyramid（B2） | `highcharts/modules/funnel.js` |
| streamgraph（B2） | `highcharts/modules/streamgraph.js` |
| rose（B2） | `highcharts/modules/variable-pie.js` |
| radar（B2） | `highcharts/highcharts-more.js` |
| histogram（B3） | 无需模块（后端分箱）或 `highcharts/modules/histogram-bellcurve.js` |
```

- [ ] **Step 3: 语法检查**

Run: `node --check examples/dual-demo/offline.mjs`
Expected: 无输出。

- [ ] **Step 4: 提交**

```bash
git add examples/dual-demo/offline.mjs docs/INTEGRATION.md
git commit -m "docs: B1 图型的模块对照表 + 离线对比页覆盖"
```

---

### Task 9: B1 批次验收

- [ ] **Step 1: 全量差分**

Run: `node scripts/chart-parity.mjs`
Expected: `11 passed, 0 failed`。

- [ ] **Step 2: 请用户跑全部权威测试**

```powershell
cd D:\work\aichart\ChartBrain\vendor\flint-chart\packages\flint-js; npm run build; npm test
cd D:\work\aichart\ChartBrain\sdk; npm run typecheck; npm test
cd D:\work\aichart\ChartBrain\server; .\.venv\Scripts\python -m pytest -q
```
Expected: vendor 54 files / 1108+ passed；sdk 29 passed；server 35 passed。

- [ ] **Step 3: 生成对比页并目测**

```powershell
cd D:\work\aichart\ChartBrain\sdk; npm run build
cd ..\examples\dual-demo; node offline.mjs
start dual-offline.html
```
Expected: 11 组图左右两侧都能渲染，新图型（分组柱、环图、斜率图、连线散点、条带图）形态正确。

- [ ] **Step 4: 打标签 / 记录**

```bash
git add -A
git commit -m "chore: B1 验收通过（11 图型双端一致）" || echo "无待提交内容"
```

---

## 自审记录

- **spec 覆盖**：设计 §2.2 的 B1 六项 → Task 1（Grouped/Stacked）、Task 2（Donut）、Task 3（Slope）、Task 4（Connected Scatter）、Task 5（Strip）✓；§4 契约四处 → Task 6 + Task 7 ✓；§6 验收五项 → Task 0/9 ✓；Donut 的 EC 端模板 → Task 2 ✓。
- **占位符扫描**：无 TBD/TODO；Task 7 Step 2 明确列出其余 4 条 few-shot 的字段组合（非占位，是同类内容的简写指令）。
- **类型一致性**：`ChartType` 的 11 个值在 schema / types.ts / 两个 adapter 中逐一对齐；Flint 模板名与 `FLINT_CHART_TYPE` 的字符串一致（`'Grouped Bar Chart'`、`'Stacked Bar Chart'`、`'Donut Chart'`、`'Slope Chart'`、`'Connected Scatter Plot'`、`'Strip Plot'`）。
