# B2 图型扩展实施计划（9 个图型 · 依赖 Highcharts 模块/复合结构）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `lollipop / waterfall / funnel / pyramid / gauge / streamgraph / boxplot / rose / radar` 九个图型在 Highcharts 与 ECharts 两端都可用、行为一致，并打通「模块声明机制 → HC 模板 → 契约白名单 → SDK 映射 → 双端差分验收」整条链路。ECharts 端这 9 个模板**上游已全部存在**（已逐一核实其 `chart` 名与 series 结构），本批的模板工作全部在 Highcharts 端。

**Architecture:** 每个图型 = ① HC 端新增模板（镜像既有 EC 模板的数值/排序/配色语义，复用 core 语义/布局管线）② HC 注册 ③ 契约白名单 5 处（schema / `ChartType` union / 两个转换器映射 / prompt 规则 1）+ `REQUIRED_CHANNELS` 通道校验器 + `check-chart-types.mjs` 守卫脚本 ④ 双端差分验收（扩展 `scripts/chart-parity.mjs`，逐类型断言）。新增一个**模块声明机制**：HC 后端按图型名登记所需 Highcharts 模块并以 `_requiredModules` 附在输出 options 上（库本身不 import 任何 HC 运行时，缺模块不会让编译期崩溃）。

**Tech Stack:** TypeScript · vendored flint-js 0.5.1 · Highcharts 12.6.0（核心 8 种 series；`highcharts-more.js` 提供 boxplot/gauge/waterfall/polar；`modules/funnel.js` 提供 funnel；`modules/streamgraph.js` 提供 streamgraph）· ECharts 5 · vitest 4（真实运行）/ tsc + Node（沙箱内验证）

**设计依据:** `docs/more-chart-types-design.md`（§2.2 清单、§4 契约、§5 数据形状、§6 验收、§7 分批）、`docs/more-chart-types-b1-plan.md`（本计划的结构模板）。

---

## 关键约束（务必先读）

1. **只允许修改下列文件**：`vendor/flint-chart/packages/flint-js` 下的 HC 模板/注册/模块表/测试、`scripts/chart-parity.mjs`、五处契约（schema / prompt / SDK types / 两个 adapter）、`sdk/src/converter/validate.ts`、`sdk/tests`（converter/validate 用例）、`examples/dual-demo/offline.mjs`、`docs/INTEGRATION.md`。`scripts/check-chart-types.mjs` 只运行不修改。**不得修改** EC 端任何 src（上游模板已齐备）与 shared core。
2. **ECharts 模板名即契约**：`Lollipop Chart / Waterfall Chart / Funnel Chart / Pyramid Chart / Gauge Chart / Streamgraph / Boxplot / Rose Chart / Radar Chart`（注意 `Boxplot`、`Streamgraph` 无 "Chart" 后缀，来自 `src/echarts/templates/*.ts` 的 `chart:` 字段；HC 注册必须使用完全相同的字符串，否则双端收不到同一个 chartType）。
3. **中性 spec 不加后端通道**：schema 只允许 `x/y/series`（`additionalProperties: false`）。funnel（x=阶段→Flint `y`、y=数值→Flint `size`）与 gauge（y→Flint `size`）的语义借用只发生在 SDK adapter 内，与 B1 的 pie/donut 例外同构。
4. **模板不 import Highcharts 运行时**：HC 后端只产 options 对象；模块由消费端按 `_requiredModules` / INTEGRATION 表加载。库侧「缺模块不崩溃」= 编译/装配阶段完全不触碰 HC 运行时。
5. **HC 模板必须镜像 EC 模板的数值语义**（排序、五数概括、均值取整、缺组补 0 等），否则双端差分断言无法通过。注意「重复 x 的处理」随模板各异、须逐一对齐，不能一概而论：bar/area/line 等对重复 x **求和**，而 waterfall 是 **first-row-wins**（`echarts/templates/waterfall.ts:35-36` 用 `table.find` 取首个匹配行）——HC 逐个复制 EC 各自实现（如 Task 2 的 HC 模板即复制 find-first），模板本身不额外对 x 去重。
6. **沙箱不能跑 npm / vitest / 浏览器**（esbuild 子进程管道 `spawn EPERM`）。权威测试由**用户**执行；沙箱内只跑下方「验证命令速查」中的命令。
7. **tsc 一律 `--noEmit` 或显式 `--outDir` 到沙箱目录**：不带 `--outDir` 的 emit 会写坏 vendor `dist/`（B1 已踩过坑，破坏了 SDK typecheck）。
8. **产出物双端对齐**：新增 HC 模板的 `channels` 与对应 EC 模板一致，仅去掉 facet 通道 `column/row`（HC v1 无 facet，见 FORK.md 范围）；EC 声明但从不读取的通道（如 boxplot 的 `opacity`）也照单保留，保证两端的通道表可逐项对照。

## 验证环境（务必先读）

本机沙箱**无法运行 npm 生命周期脚本与 vitest 本体**（报 `spawn EPERM`）。计划中的验证分两类；下文全部命令在 HEAD `73cdd65` 实测通过（基线见表格末行）。

| 用途 | 命令 | 基线（HEAD 实测） |
|---|---|---|
| vendor 类型检查 | V1 | exit 0 |
| vendor → `.tmp-build` 编译 | V2 | exit 0 |
| 双端差分（对 `.tmp-build`） | V3 | 11 passed / 0 failed（B2 目标 20） |
| SDK 类型检查 | V4 | exit 0 |
| vendor 单元测试 shim | V5 | `files=56 passed=1122 failed=0` + ✅ |
| server 测试 | V6 | 37 passed |
| 白名单五处一致 | V7 | ✅ 5 处白名单一致（11 种）（B2 目标 20 种） |
| SDK 单测 shim | V8 | 44 passed, 0 failed（exit 0） |
| 对比页静态渲染 | V9 | 11/11 用例 ok、0 external CDN refs |
| **权威测试** | `cd vendor/flint-chart/packages/flint-js && npm run build && npm test`；`cd sdk && npm run typecheck && npm test`；`cd server && .\.venv\Scripts\python -m pytest -q` | **用户**（Task 8/11 的用户步骤统一执行；沙箱内各 Task 只跑 V1–V9） |

下文 `<repo>` = `D:\work\aichart\ChartBrain`；`<vendor>` = `<repo>\vendor\flint-chart\packages\flint-js`。

### 验证命令速查（在 `<repo>` 根目录执行）

```powershell
# V1: vendor 全量类型检查（期望：无输出，exit 0）
node sdk\node_modules\typescript\bin\tsc -p vendor\flint-chart\packages\flint-js\tsconfig.json --noEmit

# V2: 编译 vendor → D:\work\aichart\.tmp-build（供 V3 使用；期望：无输出，exit 0）
node sdk\node_modules\typescript\bin\tsc -p vendor\flint-chart\packages\flint-js\tsconfig.json --module commonjs --moduleResolution node --outDir D:\work\aichart\.tmp-build --declaration false --declarationMap false --sourceMap false

# V3: 双端差分（对 .tmp-build 跑；B2 基线 11 → 目标 20）
node scripts\chart-parity.mjs --dist D:\work\aichart\.tmp-build

# V4: SDK 类型检查（期望：无输出，exit 0）
node sdk\node_modules\typescript\bin\tsc -p sdk\tsconfig.json --noEmit

# V5: vendor 单元测试 shim —— 不需要再移开 heatmap-colors.test.ts：
#     编译用 sidecar tsconfig（vega-lite 是 exports-only 的 ESM 包，moduleResolution:node
#     无法解析其类型，故在 .verify 侧加 paths 映射到其 build/index.d.ts；产物仍是 CJS，
#     运行时 heatmap 经 .verify/node_modules/vega-lite CJS stub + ESM preload 加载）。
#     先创建 sidecar（一次性，内容见下）：
#       D:\work\aichart\.verify\tsconfig.vendor-all-tests.cjs.json
#         { "extends": "./tsconfig.vendor-all-tests.json",
#           "compilerOptions": { "baseUrl": "D:/work/aichart/.verify",
#             "paths": { "vega-lite": ["../ChartBrain/vendor/flint-chart/packages/flint-js/node_modules/vega-lite/build/index.d.ts"] } } }
Remove-Item -Recurse -Force D:\work\aichart\.verify\vendor-all-tests -ErrorAction SilentlyContinue
node sdk\node_modules\typescript\bin\tsc -p D:\work\aichart\.verify\tsconfig.vendor-all-tests.cjs.json
$env:NODE_PATH='<vendor>\node_modules;<repo>\sdk\node_modules'
node --import file:///D:/work/aichart/.verify/preload-vega.mjs D:\work\aichart\.verify\run-all-vendor-tests.cjs
# 期望：files=56 passed=1122(+新增) failed=0 + "✅ every shipping vendor test passed"
# 注：沙箱存在一条与 B2 无关的 excel-runtime 异步 rejection（stderr 打
#     "Unsupported Excel chart type: funnel"，使 node 退出码为 1）——以 failed=0 / ✅ 行为绿；
#     权威判定见用户 npm test。

# V6: server 测试（期望：37 passed）
$env:PYTHONPATH='<repo>\server'; python -m pytest <repo>\server\tests -q -p no:cacheprovider

# V7: 白名单五处一致（schema / ChartType union / 两个 FLINT_CHART_TYPE / prompt 规则 1；
#      B2 基线 11 种 → 目标 20 种）
node scripts\check-chart-types.mjs

# V8: SDK 单测 shim（编译：sdk 三件套中含 echarts-spike.test.ts 的既有 strict 噪音，
#      tsc 退出码 2 属预期、产物照常落盘；以 run-sdk-tests 的结果为准）
Remove-Item -Recurse -Force D:\work\aichart\.verify\sdk-tests -ErrorAction SilentlyContinue
node sdk\node_modules\typescript\bin\tsc -p D:\work\aichart\.verify\tsconfig.sdk-tests.json
$env:NODE_PATH='<vendor>\node_modules;<repo>\sdk\node_modules'
node D:\work\aichart\.verify\run-sdk-tests.cjs
# 期望：================ 44 passed, 0 failed ================
# 注：B2 的 SDK 行为用例（Task 8 追加）依赖 vendor dist 重建，重建前在 V8 会红——
#     沙箱内回归以 V4（类型）与既有 44 项为界，新用例由用户权威执行。

# V9: 对比页静态渲染（生成的 examples/dual-demo/dual-offline.html 必须在本地先由 offline.mjs 重新生成）
node D:\work\aichart\.verify\check-html-options.cjs
# 期望：Highcharts.chart 11 次 / echarts 11 次全部 ok、external CDN refs: 0、✅ every case renders
```

> **基线（HEAD `73cdd65` 实测）**：vendor 类型检查 exit 0；vendor shim `files=56 passed=1122`；server `37 passed`；SDK shim `44 passed, 0 failed`；parity `11 passed, 0 failed`；白名单 `✅ 5 处白名单一致（11 种）`；V9 `11/11 ok、0 external refs`。
> 权威测试由**用户**在批次验收（Task 11）统一执行；每个图型 Task 末尾的「请用户跑权威测试」同样由用户执行。

所有路径以 `<repo>` 为基准；下文不再重复前缀。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `<vendor>/src/highcharts/templates/modules.ts` | 新建 | 图型名 → 所需 Highcharts 模块（npm 包内相对路径）登记表 + `hcRequiredModules()` |
| `<vendor>/src/highcharts/templates/index.ts` | 改 | 注册 9 个新模板；re-export `hcRequiredModules` |
| `<vendor>/src/highcharts/assemble.ts` | 改 | 装配末尾按图型名 stamp `hcOption._requiredModules` |
| `<vendor>/src/highcharts/index.ts` | 改 | barrel 导出 `hcRequiredModules` |
| `<vendor>/src/highcharts/templates/lollipop.ts` | 新建 | HC Lollipop（复合：细柱茎 + scatter 圆点，**零模块**） |
| `<vendor>/src/highcharts/templates/waterfall.ts` | 新建 | HC Waterfall（原生 `waterfall` + isSum） |
| `<vendor>/src/highcharts/templates/boxplot.ts` | 新建 | HC Boxplot（模板内自算五数概括） |
| `<vendor>/src/highcharts/templates/gauge.ts` | 新建 | HC Gauge（单表盘均值） |
| `<vendor>/src/highcharts/templates/funnel.ts` | 新建 | HC Funnel（原生 `funnel`） |
| `<vendor>/src/highcharts/templates/pyramid.ts` | 新建 | HC Pyramid（复合：双横向 bar 镜像，**零模块**） |
| `<vendor>/src/highcharts/templates/streamgraph.ts` | 新建 | HC Streamgraph（原生 `streamgraph`） |
| `<vendor>/src/highcharts/templates/radar.ts` | 新建 | HC Radar（polar line） |
| `<vendor>/src/highcharts/templates/rose.ts` | 新建 | HC Rose（原生 `variablepie`，等角 + z=原始值） |
| `<vendor>/tests/highcharts.test.ts` | 改 | 9 个图型的用例 + 模块登记表用例 + 「未知图型」样例改名 |
| `scripts/chart-parity.mjs` | 改 | `generic:false` 支持 + B2 夹具 + 9 个逐类型用例（含自定义 `check(hc, ec)`） |
| `specs/chart-spec.schema.json` | 改 | `chart.type` enum 加 9 个值 |
| `sdk/src/types.ts` | 改 | `ChartType` union 扩 9 |
| `sdk/src/converter/highcharts.ts` | 改 | FLINT 名映射 + funnel/gauge 通道例外 + `HighchartsOption._requiredModules` 类型 |
| `sdk/src/converter/echarts.ts` | 改 | 同上（无类型改动） |
| `sdk/src/converter/validate.ts` | 改 | `REQUIRED_CHANNELS` 补 9 个新图型（gauge 仅 `y`，其余 `x`+`y`，`series` 一律可选） |
| `sdk/tests/converter.test.ts` | 改 | 白名单形状表扩 9 + funnel/gauge 语义用例 |
| `sdk/tests/validate.test.ts` | 改 | 20 种必需通道用例（含 gauge 仅 y / 缺通道抛错点名） |
| `scripts/check-chart-types.mjs` | 跑（不改） | 白名单五处一致性守卫（Task 8/9 后应输出 `20 种`） |
| `server/chartbrain_server/spec/prompt.py` | 改 | 白名单行 + 9 条 few-shot |
| `examples/dual-demo/offline.mjs` | 改 | 9 个对比用例 + 模块 script 标签 |
| `docs/INTEGRATION.md` | 改 | 模块对照表修订 + `_requiredModules` 输出契约 + 图型 FAQ |

---

### Task 0: 模块声明机制 + chart-parity 支持 B2（红基线）

**Files:**
- Create: `<vendor>/src/highcharts/templates/modules.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Modify: `<vendor>/src/highcharts/assemble.ts`
- Modify: `<vendor>/src/highcharts/index.ts`
- Modify: `<vendor>/tests/highcharts.test.ts`
- Modify: `scripts/chart-parity.mjs`

- [ ] **Step 1: 写模块登记表 + 失败测试（登记表先行，模板未实现前即锁定契约）**

新建 `<vendor>/src/highcharts/templates/modules.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Required Highcharts runtime modules per chart type (B2+).
//
// ORDER MATTERS: each array is a load order, not a set — Highcharts module
// files destructure prototype chains from modules loaded earlier in the same
// process. Today every B2 entry has at most one element (order trivially
// satisfied), but entries may grow (e.g. a native `lollipop` needs
// highcharts-more → dumbbell → lollipop) and consumers must require them in
// array order. Loading only part of a chain fails LOUDLY at require time
// (dumbbell alone: `Class extends value undefined is not a constructor`;
// lollipop without dumbbell: `Cannot read properties of undefined (reading
// 'prototype')`) — both measured against the real 12.6.0 bundles. B2 keeps
// Lollipop as a ZERO-module composite template (column stem + scatter dots,
// mirroring the ECharts template) precisely so no consumer ever hits that
// chain; Pyramid likewise needs no module (two mirrored `bar` series).
//
// The backend never imports Highcharts itself — assembled options are pure
// data. Consumers must register these modules with their Highcharts instance
// before rendering; a missing module surfaces as a Highcharts runtime error
// ("Highcharts error #17" naming the missing series type), never as an
// assemble-time crash. Values are package-relative specifiers inside the
// `highcharts` npm package / CDN root, kept in sync with
// docs/INTEGRATION.md's module table (load in array order).

/** Chart type name → module specifiers it needs registered first (ordered). */
export const HC_CHART_MODULES: Record<string, string[]> = {
    // Composite templates (core series only) need no module.
    // 'Lollipop Chart': [],  'Pyramid Chart': [],
    'Waterfall Chart': ['highcharts/highcharts-more.js'],
    'Funnel Chart': ['highcharts/modules/funnel.js'],
    'Gauge Chart': ['highcharts/highcharts-more.js'],
    'Streamgraph': ['highcharts/modules/streamgraph.js'],
    'Boxplot': ['highcharts/highcharts-more.js'],
    'Rose Chart': ['highcharts/modules/variable-pie.js'],
    'Radar Chart': ['highcharts/highcharts-more.js'],
};

/** Modules Highcharts must have loaded for `chartType`, in order, or `[]`. */
export function hcRequiredModules(chartType: string): string[] {
    return HC_CHART_MODULES[chartType] ?? [];
}
```

- [ ] **Step 2: 接线（templates/index.ts、assemble.ts、index.ts）**

`<vendor>/src/highcharts/templates/index.ts` 末尾追加 re-export：

```typescript
export { hcRequiredModules } from './modules';
```

`<vendor>/src/highcharts/assemble.ts`：顶部 import 行后追加

```typescript
import { hcGetTemplateDef, hcRequiredModules } from './templates';
```

（若 `hcGetTemplateDef` 已在 import 中则只加 `hcRequiredModules`。）并在 `assembleHighcharts` 里、`if (chartTemplate.postProcess) …` 之后、`// RESULT` 注释之前插入：

```typescript
    // The assembled options never touch the Highcharts runtime; record which
    // modules the CONSUMER must register before rendering this chart type.
    const requiredModules = hcRequiredModules(chartType);
    if (requiredModules.length > 0) hcOption._requiredModules = requiredModules;
```

`<vendor>/src/highcharts/index.ts` 追加导出：

```typescript
export { hcRequiredModules } from './templates';
```

- [ ] **Step 3: 写登记表用例 + 改「未知图型」样例**

`<vendor>/tests/highcharts.test.ts` 顶部 import 补 `hcRequiredModules`：

```typescript
import { assembleHighcharts, hcAllTemplateDefs, hcGetTemplateDef, hcRequiredModules } from '../src';
```

在 `describe('highcharts backend smoke', …)` 内追加两个用例：

```typescript
  it('B2 模块登记表：复合模板零模块，原生系列声明其模块', () => {
    expect(hcRequiredModules('Lollipop Chart')).toEqual([]);
    expect(hcRequiredModules('Pyramid Chart')).toEqual([]);
    expect(hcRequiredModules('Waterfall Chart')).toEqual(['highcharts/highcharts-more.js']);
    expect(hcRequiredModules('Boxplot')).toEqual(['highcharts/highcharts-more.js']);
    expect(hcRequiredModules('Gauge Chart')).toEqual(['highcharts/highcharts-more.js']);
    expect(hcRequiredModules('Radar Chart')).toEqual(['highcharts/highcharts-more.js']);
    expect(hcRequiredModules('Rose Chart')).toEqual(['highcharts/modules/variable-pie.js']);
    expect(hcRequiredModules('Funnel Chart')).toEqual(['highcharts/modules/funnel.js']);
    expect(hcRequiredModules('Streamgraph')).toEqual(['highcharts/modules/streamgraph.js']);
    expect(hcRequiredModules('Nonexistent Chart')).toEqual([]);
  });

  it('基础图型不携带 _requiredModules（无模块需求不 stamp）', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } },
      },
    }) as any;
    expect(option._requiredModules).toBeUndefined();
  });
```

- [ ] **Step 4: 扩展 chart-parity：`generic:false` 支持 + B2 夹具与 9 个用例**

`scripts/chart-parity.mjs`：
(1) 夹具区（`SCAT_ORD_BASE` 之后、`inp` 之前）追加 B2 夹具：

```javascript
// ── B2 夹具 ─────────────────────────────────────────────────────────────
const LOL = [
  { cat: 'a', grp: 'X', v: 10 },
  { cat: 'b', grp: 'X', v: 20 },
  { cat: 'a', grp: 'Y', v: 3 },
  { cat: 'b', grp: 'Y', v: 7 },
];
const LOL_BASE = {
  data: { values: LOL },
  semantic_types: { cat: 'Category', grp: 'Category', v: 'Price' },
};
const WF = [
  { stage: 'Start', delta: 100 },
  { stage: 'A', delta: 20 },
  { stage: 'B', delta: 30 },
  { stage: 'End', delta: 150 }, // 100+20+30=150：末行是「总额复述」→ totals 推断为 both
];
const WF_BASE = {
  data: { values: WF },
  semantic_types: { stage: 'Category', delta: 'Price' },
};
const BOX = {
  data: {
    values: [
      { grp: 'A', score: 2 }, { grp: 'A', score: 3 }, { grp: 'A', score: 4 },
      { grp: 'A', score: 5 }, { grp: 'A', score: 6 },
      { grp: 'B', score: 10 }, { grp: 'B', score: 11 }, { grp: 'B', score: 12 },
      { grp: 'B', score: 13 }, { grp: 'B', score: 14 },
    ],
  },
  semantic_types: { grp: 'Category', score: 'Price' },
};
const GAUGE_BASE = {
  data: { values: [{ score: 85 }, { score: 95 }] },
  semantic_types: { score: 'Price' },
};
const RADAR = [
  { metric: 'speed', entity: 'A', v: 80 }, { metric: 'range', entity: 'A', v: 70 },
  { metric: 'price', entity: 'A', v: 60 }, { metric: 'size', entity: 'A', v: 50 },
  { metric: 'speed', entity: 'B', v: 60 }, { metric: 'range', entity: 'B', v: 90 },
  { metric: 'price', entity: 'B', v: 40 }, { metric: 'size', entity: 'B', v: 80 },
];
const RADAR_BASE = {
  data: { values: RADAR },
  semantic_types: { metric: 'Category', entity: 'Category', v: 'Price' },
};
const ROSE_BASE = {
  data: { values: [{ cat: 'a', v: 10 }, { cat: 'b', v: 20 }, { cat: 'c', v: 30 }] },
  semantic_types: { cat: 'Category', v: 'Price' },
};
const FUNNEL_BASE = {
  data: { values: [{ stage: 'Visit', n: 1000 }, { stage: 'Signup', n: 400 }, { stage: 'Buy', n: 100 }] },
  semantic_types: { stage: 'Category', n: 'Price' },
};
const PYR = [
  { age: '0-9', side: 'Male', n: 40 }, { age: '0-9', side: 'Female', n: 35 },
  { age: '10-19', side: 'Male', n: 30 }, { age: '10-19', side: 'Female', n: 25 },
  { age: '20-29', side: 'Male', n: 20 }, { age: '20-29', side: 'Female', n: 15 },
];
const PYR_BASE = {
  data: { values: PYR },
  semantic_types: { age: 'Category', side: 'Category', n: 'Price' },
};
const STREAM = [
  { m: '2026-01', region: 'East', v: 10 }, { m: '2026-02', region: 'East', v: 15 },
  { m: '2026-01', region: 'West', v: 20 }, { m: '2026-02', region: 'West', v: 5 },
];
const STREAM_BASE = {
  data: { values: STREAM },
  semantic_types: { m: 'YearMonth', region: 'Country', v: 'Price' },
};
```

(2) 检查循环改为支持 `generic:false`（在 `if (pointsOf(hc) …` 段之后插入开关）：

```javascript
    // generic === false 的用例（复合/多 series 结构无法逐 series 对齐的图型）
    // 跳过「series 数 / 点数 / 逐点值」三项通用断言，改由 c.check 做类型特定的语义比对。
    if (c.generic !== false) {
      if ((hc.series ?? []).length !== (ec.series ?? []).length) {
        throw new Error(`series 数 ${(hc.series ?? []).length} ≠ ${(ec.series ?? []).length}`);
      }
      if (pointsOf(hc) !== pointsOf(ec)) throw new Error(`点数 ${pointsOf(hc)} ≠ ${pointsOf(ec)}`);
      const a = JSON.stringify(norm(hc, pie));
      const b = JSON.stringify(norm(ec, pie));
      if (a !== b) throw new Error(`逐点值不一致\n    HC ${a}\n    EC ${b}`);
    }
```

（把原三行通用断言整体替换为上述带开关的版本，保持「HC 图型 / EC 图型」两项断言对全部用例生效。）

(3) CASES 末尾（Strip Plot 用例之后）追加 9 个 B2 用例（先按依赖顺序全红）：

```javascript
  // ── B2 用例（HC 模板落地前整段为红基线）──────────────────────────────
  { label: 'Lollipop Chart', input: inp('Lollipop Chart', { x: { field: 'cat' }, y: { field: 'v' }, color: { field: 'grp' } }, LOL_BASE), hc: 'column', ec: 'bar' },
  {
    label: 'Waterfall Chart',
    input: inp('Waterfall Chart', { x: { field: 'stage' }, y: { field: 'delta' } }, WF_BASE),
    hc: 'waterfall', ec: 'custom', generic: false,
    check(hc, ec) {
      const mods = hc._requiredModules;
      if (JSON.stringify(mods) !== JSON.stringify(['highcharts/highcharts-more.js'])) {
        throw new Error(`HC _requiredModules=${JSON.stringify(mods)}，期望 ['highcharts/highcharts-more.js']`);
      }
      // 语义前提（fixture 固定）：values=[100,20,30,150]，末行 150 = 之前累计（100+20+30）
      // → resolveTotalsMode 得 'both'：首行 start、末行 end（总额复述）、中间两行 delta。
      // EC Delta series 为每一行（含锚零的 start/end）都推一条 value=[i, lo, hi, v]，
      // 因此 EC 的末行也带原始复述值 150；HC 用 isSum 吸收末行。增量序列比较必须排除
      // EC 末行（否则恒差一项），排除用「行数 - 1」，不用 lo===0——lo===0 同时命中 start
      // 首行，而 start 首行在 HC 是普通点（y=100）、必须参与比较。
      const ecDeltaItems = (ec.series ?? []).find((s) => s.name === 'Delta')?.data ?? [];
      const fixtureVals = WF.map((r) => r.delta); // [100, 20, 30, 150]
      const endIdx = fixtureVals.length - 1;
      if (ecDeltaItems.length !== fixtureVals.length) {
        throw new Error(`EC Delta items=${ecDeltaItems.length} ≠ 行数=${fixtureVals.length}`);
      }
      const ecEnd = ecDeltaItems[endIdx];
      if (ecEnd.value[3] !== fixtureVals[endIdx] || ecEnd.itemStyle?.color !== '#5470c6') {
        throw new Error('EC waterfall 末行应为 end（startEnd 色且仍携带原始复述值 v）');
      }
      const ecDeltas = ecDeltaItems.slice(0, endIdx).map((d) => d.value[3]); // 仅排除 end 末行
      const hcRows = hc.series?.[0]?.data ?? [];
      const hcDeltas = hcRows.filter((d) => d.isSum !== true).map((d) => d.y);
      if (JSON.stringify(hcDeltas) !== JSON.stringify(ecDeltas)) {
        throw new Error(`waterfall 增量序列不一致 HC=${JSON.stringify(hcDeltas)} EC=${JSON.stringify(ecDeltas)}`);
      }
      // isSum 必须恰好出现在末行（end 唯一），不允许提前出现（防假绿）
      const hcSums = hcRows.map((d, i) => (d.isSum === true ? i : -1)).filter((i) => i >= 0);
      if (JSON.stringify(hcSums) !== JSON.stringify([endIdx])) {
        throw new Error(`HC waterfall 应在末行标 isSum（实际 ${JSON.stringify(hcSums)}）`);
      }
    },
  },
  {
    label: 'Boxplot',
    input: inp('Boxplot', { x: { field: 'grp' }, y: { field: 'score' } }, BOX),
    hc: 'boxplot', ec: 'boxplot',
    // generic:false —— HC 点对象 {low,q1,…} 会让通用 yOf（取 d.y ?? d.value）得到 undefined、
    // EC 数组点取 q1，两者逐点比较必然抛错；本用例由下方 five() 归一比较整体接管。
    // 保留 HC 对象点形态：HC 原生 boxplot 以 {low,…,outliers} 承载离群点（数组形态无法表达）。
    generic: false,
    check(hc, ec) {
      const mods = hc._requiredModules;
      if (JSON.stringify(mods) !== JSON.stringify(['highcharts/highcharts-more.js'])) {
        throw new Error(`HC _requiredModules=${JSON.stringify(mods)}，期望 ['highcharts/highcharts-more.js']`);
      }
      // 五数逐类目一致（HC 对象 {low,q1,median,q3,high} ↔ EC 数组 [low,q1,median,q3,high]；'-' 空槽两端同义）
      const five = (d) => (d === '-' ? null
        : (Array.isArray(d)
          ? d
          : (d ? [d.low, d.q1, d.median, d.q3, d.high] : null)));
      const a = JSON.stringify(((hc.series?.[0]?.data) ?? []).map(five));
      const b = JSON.stringify(((ec.series ?? []).find((s) => s.type === 'boxplot')?.data ?? []).map(five));
      if (a !== b) throw new Error(`boxplot 五数不一致\n  HC ${a}\n  EC ${b}`);
      // 离群点契约：本夹具无离群点 → EC 不得追加 Points/custom overlay（boxplot.ts 单系列路径
      // 仅在 pointData 非空时 push），HC 每个点的 outliers 必须为空数组。
      const ecBoxSeries = (ec.series ?? []).filter((s) => s.type === 'boxplot');
      if (ec.series?.some((s) => s.type === 'custom')) {
        throw new Error('本夹具无离群点，EC 不应产出 custom overlay 系列');
      }
      if ((ecBoxSeries.length !== 1) || (ec.series?.length ?? 0) !== 1) {
        throw new Error(`EC boxplot 应只有 1 个 boxplot 系列（实际 ${JSON.stringify((ec.series ?? []).map((s) => s.type))}）`);
      }
      const hcOutliers = ((hc.series?.[0]?.data) ?? []).map((d) => (d && Array.isArray(d.outliers) ? d.outliers : null));
      if (hcOutliers.some((o) => o === null || o.length > 0)) {
        throw new Error(`本夹具无离群点，HC outliers 应全为 []（实际 ${JSON.stringify(hcOutliers)}）`);
      }
    },
  },
  { label: 'Gauge Chart', input: inp('Gauge Chart', { size: { field: 'score' } }, GAUGE_BASE), hc: 'gauge', ec: 'gauge' },
  {
    label: 'Radar Chart',
    input: inp('Radar Chart', { x: { field: 'metric' }, y: { field: 'v' }, color: { field: 'entity' } }, RADAR_BASE),
    hc: 'line', ec: 'radar', generic: false,
    check(hc, ec) {
      const mods = hc._requiredModules;
      if (JSON.stringify(mods) !== JSON.stringify(['highcharts/highcharts-more.js'])) {
        throw new Error(`HC _requiredModules=${JSON.stringify(mods)}，期望 ['highcharts/highcharts-more.js']`);
      }
      if (hc.chart.polar !== true) throw new Error('Radar HC 需 chart.polar=true');
      // EC：单 radar series、data 项 {name, value:[按指标顺序]…}；HC：每实体一条 polar line series。
      const ecMap = new Map((ec.series ?? []).find((s) => s.type === 'radar')?.data?.map((d) => [d.name, d.value]) ?? []);
      const hcMap = new Map((hc.series ?? []).map((s) => [s.name, (s.data ?? []).map((p) => (Array.isArray(p) ? p[1] : p))]));
      if (JSON.stringify([...ecMap].sort()) !== JSON.stringify([...hcMap].sort())) {
        throw new Error(`radar 值矩阵不一致\n  EC ${JSON.stringify([...ecMap])}\n  HC ${JSON.stringify([...hcMap])}`);
      }
    },
  },
  {
    label: 'Rose Chart',
    input: inp('Rose Chart', { x: { field: 'cat' }, y: { field: 'v' } }, ROSE_BASE),
    hc: 'variablepie', ec: 'bar', generic: false,
    check(hc, ec) {
      const mods = hc._requiredModules;
      if (JSON.stringify(mods) !== JSON.stringify(['highcharts/modules/variable-pie.js'])) {
        throw new Error(`HC _requiredModules=${JSON.stringify(mods)}，期望 ['highcharts/modules/variable-pie.js']`);
      }
      if (hc.chart.type !== 'variablepie') throw new Error(`Rose HC chart.type=${hc.chart.type}，期望 variablepie`);
      // EC（flint 模板）是极坐标 bar：半径 = sqrt(value)、_rawValue 存原始值；
      // HC 是 variablepie：data 项 {name, y(等角权重=1), z(半径=原始值)}。逐类目按 name→原始值映射比较。
      const ecBar = (ec.series ?? []).find((s) => s.type === 'bar' && s.coordinateSystem === 'polar');
      const ecMap = new Map((ecBar?.data ?? []).map((d) => [String(d.name), d._rawValue ?? d.value]));
      const hcMap = new Map((hc.series?.[0]?.data ?? []).map((d) => [String(d.name), d.z]));
      const ecKeys = [...ecMap.keys()].sort();
      const hcKeys = [...hcMap.keys()].sort();
      if (JSON.stringify(ecKeys) !== JSON.stringify(hcKeys)) {
        throw new Error(`rose 类目不一致\n  EC ${JSON.stringify(ecKeys)}\n  HC ${JSON.stringify(hcKeys)}`);
      }
      for (const k of ecKeys) {
        if (Math.abs((ecMap.get(k) ?? 0) - (hcMap.get(k) ?? 0)) > 1e-9) {
          throw new Error(`rose 原始值不一致 ${k}: EC=${ecMap.get(k)} HC=${hcMap.get(k)}`);
        }
      }
    },
  },
  {
    label: 'Funnel Chart',
    input: inp('Funnel Chart', { y: { field: 'stage' }, size: { field: 'n' } }, FUNNEL_BASE),
    hc: 'funnel', ec: 'funnel',
    check(hc) {
      const mods = hc._requiredModules;
      if (JSON.stringify(mods) !== JSON.stringify(['highcharts/modules/funnel.js'])) {
        throw new Error(`HC _requiredModules=${JSON.stringify(mods)}，期望 ['highcharts/modules/funnel.js']`);
      }
    },
  },
  {
    label: 'Pyramid Chart',
    input: inp('Pyramid Chart', { x: { field: 'n' }, y: { field: 'age' }, color: { field: 'side' } }, PYR_BASE),
    hc: 'bar', ec: 'bar',
    check(hc) {
      if (hc._requiredModules !== undefined) {
        throw new Error(`Pyramid 为双 bar 复合模板，不应声明模块（_requiredModules=${JSON.stringify(hc._requiredModules)}）`);
      }
    },
  },
  {
    label: 'Streamgraph',
    input: inp('Streamgraph', { x: { field: 'm' }, y: { field: 'v' }, color: { field: 'region' } }, STREAM_BASE),
    hc: 'streamgraph', ec: 'themeRiver', generic: false,
    check(hc, ec) {
      const mods = hc._requiredModules;
      if (JSON.stringify(mods) !== JSON.stringify(['highcharts/modules/streamgraph.js'])) {
        throw new Error(`HC _requiredModules=${JSON.stringify(mods)}，期望 ['highcharts/modules/streamgraph.js']`);
      }
      // EC themeRiver data=[x, value, seriesName]；HC 每系列 data=[x, value]。
      const ecTriples = (ec.series ?? []).find((s) => s.type === 'themeRiver')?.data ?? [];
      const ecMap = new Map(ecTriples.map((t) => [`${String(t[0])}|||${t[2]}`, t[1]]));
      for (const s of hc.series ?? []) {
        for (const p of s.data ?? []) {
          const x = new Date(Array.isArray(p) ? p[0] : p.x).toISOString().slice(0, 7);
          const v = Array.isArray(p) ? p[1] : p.y;
          const want = ecMap.get(`${x}|||${s.name}`);
          if (want === undefined) throw new Error(`streamgraph 多余点 ${x}/${s.name}`);
          if (Math.abs(want - v) > 1e-9) throw new Error(`streamgraph 值不一致 ${x}/${s.name}: HC=${v} EC=${want}`);
        }
      }
      if ((hc.series ?? []).length !== 2) throw new Error('streamgraph 应按 region 拆成 2 个系列');
    },
  },
```

- [ ] **Step 5: 跑一遍建立红基线**

Run: V2（编译到 `.tmp-build`）→ V3
Expected: 原 11 行 ✓；9 个 B2 行全部 ✗（`Unknown Highcharts chart type`）——这是本批的失败基线（与 B1 Task 0 同构）。

- [ ] **Step 6: 真实模块注册探针（沙箱内证明模块接线的唯一方式）**

登记表是纯数据断言，但「模块 → `seriesTypes` 注册」要用真实 Highcharts 12.6.0 bundle 验证。新建临时探针（放 `.verify` 下、不进仓库）：

`D:\work\aichart\.verify\b2-check-modules.cjs`：

```javascript
// 沙箱探针：按序加载 B2 用到的真实 Highcharts 12.6.0 模块，断言 seriesTypes 注册。
// 用法：node D:\work\aichart\.verify\b2-check-modules.cjs
const BASE = 'D:/work/aichart/.verify/libs';
const P = (f) => `${BASE}/${f}`;

// UMD 包装读 window.Highcharts / _Highcharts；核心导出可能是默认导出或对象本身
global.window = global;
const core = require(P('highcharts.js'));
const HC = core.default || core;
if (HC.version !== '12.6.0') throw new Error('期望 Highcharts 12.6.0，实际 ' + HC.version);
global.Highcharts = HC;
global._Highcharts = HC;

const load = (f) => {
  const mod = require(P(`modules/${f}`));
  if (typeof mod === 'function') mod(HC); // 工厂形态的模块导出
};

const has = (t) => Object.prototype.hasOwnProperty.call(HC.seriesTypes, t);
const must = (name, fn) => {
  if (!fn()) throw new Error(`✗ ${name}`);
  console.log(`  ✓ ${name}`);
};

console.log('core series:', Object.keys(HC.seriesTypes).sort().join(', '));

// highcharts-more → waterfall/boxplot/gauge（+ arearange，作为模块已载入的代理）
load('highcharts-more.js');
must('highcharts-more 注册 waterfall', () => has('waterfall'));
must('highcharts-more 注册 boxplot', () => has('boxplot'));
must('highcharts-more 注册 gauge', () => has('gauge'));
must('highcharts-more 注册 arearange（载入代理）', () => has('arearange'));

// funnel.js → funnel（+ pyramid 由同模块注册）
load('funnel.js');
must('funnel.js 注册 funnel', () => has('funnel'));
must('funnel.js 注册 pyramid', () => has('pyramid'));

// streamgraph.js → streamgraph
load('streamgraph.js');
must('streamgraph.js 注册 streamgraph', () => has('streamgraph'));

// variable-pie.js → variablepie（B2 rose）
load('variable-pie.js');
must('variable-pie.js 注册 variablepie', () => has('variablepie'));

// polar 能力不是 series 类型：highcharts-more 载入后 Chart.prototype 出现 polar/radial 成员（B2 radar 依赖）
const protoNames = Object.getOwnPropertyNames(HC.Chart.prototype);
must('highcharts-more 提供 polar/radial 成员（radar 依赖）',
  () => protoNames.some((n) => /polar|radial/i.test(n)));

// histogram-bellcurve.js → histogram + bellcurve（B3 预留登记：本批不用 bellcurve）
load('histogram-bellcurve.js');
must('histogram-bellcurve.js 注册 histogram（B3 预留）', () => has('histogram'));
must('bellcurve 同模块注册（B3 不使用，仅记录）', () => has('bellcurve'));

console.log('\n✅ 模块注册探针全部通过');
```

Run: `node D:\work\aichart\.verify\b2-check-modules.cjs`
Expected: core 8 种 series；随后 11 个 `✓` 断言与末尾 ✅。（依赖项佐证：`lollipop.js` 需要 more→dumbbell→lollipop 链，仅 `dumbbell.js`→`lollipop.js` 抛 `Class extends value undefined is not a constructor`，缺 `dumbbell` 只载 `lollipop.js` 抛 `Cannot read properties of undefined (reading 'prototype')`——均已实测；本批不用该链，故消费端无需加载 `dumbbell.js`（该文件已在本地下载并实测注册）。）`variable-pie.js` / `histogram-bellcurve.js` 已由维护者补下载并在本地实测注册（variablepie / histogram + bellcurve）。

- [ ] **Step 7: V1 + V5 回归**

Run: V1 → 无输出；V5 → `files=56 passed=1124 failed=0` + ✅（新增 2 个用例）
Expected: 全绿（excel-runtime 异步噪音导致 stderr/退出码 1，以 failed=0 为准，见命令速查注）。

- [ ] **Step 8: 提交**

```bash
git add <vendor>/src/highcharts/templates/modules.ts <vendor>/src/highcharts/templates/index.ts <vendor>/src/highcharts/assemble.ts <vendor>/src/highcharts/index.ts <vendor>/tests/highcharts.test.ts scripts/chart-parity.mjs
git commit -m "feat(highcharts): B2 模块声明机制（_requiredModules，有序加载）+ parity 扩展（B2 红基线）"
```

### Task 1: Lollipop Chart（Highcharts 复合模板：细柱茎 + scatter 圆点）

**Files:**
- Create: `<vendor>/src/highcharts/templates/lollipop.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

设计说明：EC 端模板是 `bar`（1.5px 细茎、黑色）+ 每分组一个 `scatter`（圆点）的复合结构（`src/echarts/templates/lollipop.ts`）。HC 端用同一数据语义镜像：`column`（或横向 `bar`）细茎（`pointWidth: 2`、黑）+ `scatter` 圆点，**不需要任何 HC 模块**（核心包 column/scatter 即可）。两端的圆点落在类目槽中心、茎从 0 基线伸出，视觉等价。

> 说明：Highcharts 确实存在原生 `lollipop` 系列（需 `highcharts-more → dumbbell → lollipop` 链，已实测注册），但它是 dumbbell 变体、且无法按 series 结构镜像 EC 的「合计黑茎 + 每分组圆点」两层复合；故本 Task 采用零模块复合方案（连带让消费端永不触碰该模块链的加载失败模式）。完整论证见「模块加载机制（决策与理由）」。

- [ ] **Step 1: 写失败测试**（追加到 `describe('highcharts backend smoke', …)` 内）

```typescript
  it('Lollipop Chart → thin stem column + scatter dot per group', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { cat: 'a', grp: 'X', v: 10 }, { cat: 'b', grp: 'X', v: 20 },
          { cat: 'a', grp: 'Y', v: 3 }, { cat: 'b', grp: 'Y', v: 7 },
        ],
      },
      semantic_types: { cat: 'Category', grp: 'Category', v: 'Price' },
      chart_spec: {
        chartType: 'Lollipop Chart',
        encodings: { x: { field: 'cat' }, y: { field: 'v' }, color: { field: 'grp' } },
      },
    }) as any;

    expect(option.chart.type).toBe('column');
    // 茎（黑色细柱，按类目合计 13/27）+ 每分组一个圆点系列（X/Y）
    expect(option.series).toHaveLength(3);
    expect(option.series[0].type).toBe('column');
    expect(option.series[0].color).toBe('#000000');
    expect(option.series[0].data).toEqual([13, 27]);
    expect(option.series.slice(1).every((s: any) => s.type === 'scatter')).toBe(true);
    expect(option.series.slice(1).map((s: any) => s.name).sort()).toEqual(['X', 'Y']);
    // X/Y 各一个圆点系列，点数与输入行数一致（X 2 行 / Y 2 行）
    const dots = (name: string) => option.series.find((s: any) => s.name === name);
    expect(dots('X').data).toHaveLength(2);
    expect(dots('Y').data).toHaveLength(2);
    // 茎与圆点属于同一条类目轴
    expect(option.xAxis.type).toBe('category');
    expect(option.xAxis.categories).toEqual(['a', 'b']);
    expect(option._requiredModules).toBeUndefined();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: V3
Expected: `Lollipop Chart` 行 ✗（`Unknown Highcharts chart type: Lollipop Chart`）。

- [ ] **Step 3: 实现模板**

`<vendor>/src/highcharts/templates/lollipop.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Lollipop Chart — a composite of a thin stem column (category
// totals, black, ~2px) and one scatter series of dots per color group.
// Mirrors the ECharts template (echarts/templates/lollipop.ts: bar stem of
// 1.5px + scatter dots) so both backends share one value model: stem height =
// per-category total, dot = one row per (category, group). No HC module is
// required (core column + scatter).

import { ChartTemplateDef } from '../../core/types';
import {
    extractCategories, groupBy, detectAxes, getCategoryOrder,
} from './utils';

/** Stem is black (mirror ECharts' STEM_COLOR '#000000'); ~2px wide. */
const STEM_COLOR = '#000000';

export const hcLollipopChartDef: ChartTemplateDef = {
    chart: 'Lollipop Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table) => {
        // Reuse the bar-family band detection: the category axis is banded.
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const colorField = channelSemantics.color?.field;
        const categories = extractCategories(table, catField, getCategoryOrder(ctx, categoryAxis) ?? catCS?.ordinalSortOrder);
        const indexOf = new Map(categories.map((c, i) => [c, i]));
        const isHorizontal = categoryAxis === 'y';
        const markType = isHorizontal ? 'bar' : 'column';

        // Stem height = value summed over ALL rows of the category (all groups).
        const totals = new Map<string, number>();
        for (const row of table) {
            const cat = String(row[catField] ?? '');
            const v = Number(row[valField]);
            if (Number.isFinite(v)) totals.set(cat, (totals.get(cat) ?? 0) + v);
        }
        const stemData = categories.map(cat => totals.get(cat) ?? null);

        // Dot series: one scatter per color group, one point per present row.
        const series: any[] = [{
            type: markType,
            data: stemData,
            color: STEM_COLOR,
            pointWidth: 2,
            enableMouseTracking: false,
            showInLegend: false,
        }];
        const toDots = (rows: any[]) => rows
            .map(r => {
                const idx = indexOf.get(String(r[catField] ?? ''));
                const v = Number(r[valField]);
                if (idx === undefined || !Number.isFinite(v)) return null;
                return isHorizontal ? [v, idx] : [idx, v];
            })
            .filter((p): p is [number, number] => p !== null);

        if (colorField) {
            const groups = groupBy(table, colorField);
            const colorOrder = getCategoryOrder(ctx, 'color');
            const legendKeys = colorOrder && colorOrder.length > 0
                ? colorOrder.filter(k => groups.has(k))
                : [...groups.keys()];
            for (const name of legendKeys) {
                series.push({
                    name, type: 'scatter',
                    data: toDots(groups.get(name) ?? []),
                    marker: { symbol: 'circle', radius: 5 },
                    zIndex: 2,
                });
            }
        } else {
            series.push({
                type: 'scatter',
                data: toDots(table),
                marker: { symbol: 'circle', radius: 5 },
                zIndex: 2,
            });
        }

        Object.assign(spec, {
            chart: { type: markType },
            xAxis: isHorizontal
                ? { type: 'linear', title: { text: valField } }
                : { type: 'category', categories, title: { text: catField } },
            yAxis: isHorizontal
                ? { type: 'category', categories, title: { text: catField } }
                : { type: 'linear', title: { text: valField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'item', categoryLabel: catField, valueLabel: valField, groupLabel: colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
```

顶部补 import：

```typescript
import { detectBandedAxisFromSemantics } from '../../core/axis-detection';
```

（`declareLayoutMode` 依赖它；写法与 `templates/bar.ts` 完全一致。）

- [ ] **Step 4: 注册**

`<vendor>/src/highcharts/templates/index.ts`：

```typescript
import { hcLollipopChartDef } from './lollipop';
// …
'Bar': [hcBarChartDef, hcGroupedBarChartDef, hcStackedBarChartDef, hcLollipopChartDef],
```

- [ ] **Step 5: 类型检查 + 行为验证**

Run: V1（无输出）→ V2 → V3
Expected: `Lollipop Chart` 行 ✓（茎/圆点系列数、点数、逐点值、系列名与 EC 端逐项一致）；其余 8 个 B2 行仍 ✗。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望全部通过（在 1124 基础上 +1，共 1125）。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/lollipop.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Lollipop Chart 复合模板（column 茎 + scatter 圆点，零模块）"
```

---

### Task 2: Waterfall Chart（原生 waterfall + totals 语义）

**Files:**
- Create: `<vendor>/src/highcharts/templates/waterfall.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

语义对齐（与 EC 模板、共享的 `chart-types/waterfall.ts` 一致）：
- 每行 x 是阶段名、y 是**增量**（可负）；
- `resolveTotalsMode(values, chartProperties?.totals)` 数据感知推断首尾是否为总额：首行总是 `start`（锚 0 全柱）；末行仅在「与之前累计对账（0.5% 容差）」时为 `end` 总额；
- HC 原生 `waterfall`：普通点 `y=增量`（从累计基线浮起），`end` 总额点标 `isSum: true`（不写 y，由 Highcharts 画到累计高度——数值上等于 EC 模板 `top = cumulative[i-1]` 的「总额复述柱」）；首行 `start` 即普通增量点（HC 首柱天然从 0 基线画起）；
- 逐点颜色镜像 EC：start/end `#5470c6`、上升 `#91cc75`、下降 `#ee6666`。

- [ ] **Step 1: 写失败测试**

```typescript
  it('Waterfall Chart → native waterfall; reconciling last row becomes isSum', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { stage: 'Start', delta: 100 },
          { stage: 'A', delta: 20 },
          { stage: 'B', delta: 30 },
          { stage: 'End', delta: 150 }, // 100+20+30 = 150 → totals=both
        ],
      },
      semantic_types: { stage: 'Category', delta: 'Price' },
      chart_spec: {
        chartType: 'Waterfall Chart',
        encodings: { x: { field: 'stage' }, y: { field: 'delta' } },
      },
    }) as any;

    expect(option.chart.type).toBe('waterfall');
    expect(option.series[0].type).toBe('waterfall');
    expect(option.series[0].data.map((d: any) => d.y)).toEqual([100, 20, 30, undefined]);
    expect(option.series[0].data[3].isSum).toBe(true);
    expect(option.series[0].data.map((d: any) => d.color)).toEqual([
      '#5470c6', '#91cc75', '#91cc75', '#5470c6',
    ]);
    expect(option._requiredModules).toEqual(['highcharts/highcharts-more.js']);
  });

  it('Waterfall Chart → non-reconciling last row stays a floating delta', () => {
    const option = assembleHighcharts({
      data: { values: [
        { stage: 'Start', delta: 100 },
        { stage: 'A', delta: -30 },
        { stage: 'B', delta: 10 },
      ] },
      semantic_types: { stage: 'Category', delta: 'Price' },
      chart_spec: {
        chartType: 'Waterfall Chart',
        encodings: { x: { field: 'stage' }, y: { field: 'delta' } },
      },
    }) as any;
    expect(option.series[0].data.map((d: any) => (d.isSum === true ? 'sum' : d.y)))
      .toEqual([100, -30, 10]);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: V3
Expected: `Waterfall Chart` ✗（`Unknown Highcharts chart type: Waterfall Chart`）。

- [ ] **Step 3: 实现模板**

`<vendor>/src/highcharts/templates/waterfall.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Waterfall Chart — native `waterfall` series. Shares the totals
// semantics with every other backend via chart-types/waterfall.ts: each row is
// a signed delta; the first row anchors at zero (a plain delta drawn from the
// baseline, like ECharts' 'start' bar); a reconciling last row (grand-total
// restatement) becomes an `isSum` point so Highcharts draws the running total
// and absorbs the restated value — the numeric equivalent of the ECharts
// template's `end` bar (top = cumulative[i-1]).

import { ChartTemplateDef } from '../../core/types';
import { resolveTotalsMode } from '../../chart-types/waterfall';
import { extractCategories } from './utils';

/** Mirrors the ECharts template's COLOR map. */
const COLOR = { startEnd: '#5470c6', increase: '#91cc75', decrease: '#ee6666' };

export const hcWaterfallChartDef: ChartTemplateDef = {
    chart: 'Waterfall Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { x: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        if (!xField || !yField) return;

        const categories = extractCategories(table, xField, undefined);
        const rows = categories
            .map(cat => table.find((r: any) => String(r[xField]) === cat))
            .filter(Boolean);
        const values = rows.map((r: any) => Number(r[yField]) || 0);

        const totalsMode = resolveTotalsMode(values, chartProperties?.totals);
        const wantFirst = totalsMode === 'first' || totalsMode === 'both';
        const wantLast = totalsMode === 'last' || totalsMode === 'both';

        const data: any[] = [];
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            const isStart = wantFirst && i === 0;
            const isEnd = wantLast && i === values.length - 1;
            if (isEnd) {
                // Grand-total restatement: let Highcharts draw the running total
                // (equals ECharts' end-bar top = cumulative[i-1] when v reconciles).
                data.push({ name: categories[i], isSum: true, color: COLOR.startEnd });
            } else {
                const color = isStart ? COLOR.startEnd : (v >= 0 ? COLOR.increase : COLOR.decrease);
                data.push({ name: categories[i], y: v, color });
            }
        }

        Object.assign(spec, {
            chart: { type: 'waterfall' },
            xAxis: { type: 'category', categories, title: { text: xField } },
            yAxis: { type: 'linear', title: { text: yField } },
            series: [{ name: yField, type: 'waterfall', data }],
            _hcTooltip: { trigger: 'axis', categoryLabel: xField, valueLabel: yField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
```

- [ ] **Step 4: 注册**

`<vendor>/src/highcharts/templates/index.ts`：

```typescript
import { hcWaterfallChartDef } from './waterfall';
// …
'Other': [hcWaterfallChartDef],
```

（新增分类键 `'Other'`。分类键仅为 UI 分组，两端允许不同，图型归属不要求与 EC 逐键一致：例如 EC 的 Boxplot 在 `'Scatter & Point'`、Rose 在 `'Polar'`，HC 按几何就近归类（Waterfall→Other、Boxplot→Statistical、Gauge→Indicator、Radar/Rose→Polar/Part-to-Whole），不影响双端模板解析与 parity。）

- [ ] **Step 5: 类型检查 + 行为验证**

Run: V1（无输出）→ V2 → V3
Expected: `Waterfall Chart` ✓；`Lollipop Chart` 保持 ✓；其余 7 个 B2 行仍 ✗。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望全部通过（+2）。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/waterfall.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Waterfall Chart 模板（共享 totals 语义 + isSum 复述柱）"
```

---

### Task 3: Boxplot（模板内自算五数概括 + Tukey 须）

**Files:**
- Create: `<vendor>/src/highcharts/templates/boxplot.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

语义对齐：EC 模板由**原始样本**在客户端算五数概括（分位线性插值、Tukey 须 ±1.5×IQR、`whiskerMethod: 'minmax'` 可选、越界点作为离群值）。HC 端复制同一算法（保证双端数值逐位一致），每个类目生成一个 boxplot 点对象 `{ low, q1, median, q3, high, outliers }`——`outliers` 交给 Highcharts 原生离群点渲染，因此不需要 EC 那种额外 scatter/custom 系列，series 结构保持「一 boxplot 系列」。

- [ ] **Step 1: 写失败测试**

```typescript
  it('Boxplot → five-number summary per category, Tukey whiskers', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { grp: 'A', score: 2 }, { grp: 'A', score: 3 }, { grp: 'A', score: 4 },
          { grp: 'A', score: 5 }, { grp: 'A', score: 6 },
          { grp: 'B', score: 10 }, { grp: 'B', score: 11 }, { grp: 'B', score: 12 },
          { grp: 'B', score: 13 }, { grp: 'B', score: 14 },
        ],
      },
      semantic_types: { grp: 'Category', score: 'Price' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'grp' }, y: { field: 'score' } },
      },
    }) as any;

    expect(option.chart.type).toBe('boxplot');
    expect(option.series).toHaveLength(1);
    const p0 = option.series[0].data[0];
    // 与 ECharts 模板同一算法：A=[2..6] → [2, 3, 4, 5, 6]
    expect([p0.low, p0.q1, p0.median, p0.q3, p0.high]).toEqual([2, 3, 4, 5, 6]);
    expect(p0.outliers).toEqual([]);
    expect(option._requiredModules).toEqual(['highcharts/highcharts-more.js']);
  });

  it('Boxplot with color → one series per color group', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { grp: 'A', sex: 'm', score: 2 }, { grp: 'A', sex: 'm', score: 3 },
          { grp: 'A', sex: 'f', score: 4 }, { grp: 'A', sex: 'f', score: 5 },
          { grp: 'B', sex: 'm', score: 10 }, { grp: 'B', sex: 'm', score: 11 },
          { grp: 'B', sex: 'f', score: 12 }, { grp: 'B', sex: 'f', score: 13 },
        ],
      },
      semantic_types: { grp: 'Category', sex: 'Category', score: 'Price' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'grp' }, y: { field: 'score' }, color: { field: 'sex' } },
      },
    }) as any;

    expect(option.series.map((s: any) => s.name).sort()).toEqual(['f', 'm']);
    expect(option.series.every((s: any) => s.type === 'boxplot')).toBe(true);
    expect(option.series.every((s: any) => s.data.length === 2)).toBe(true);
    expect(option.legend.enabled).toBe(true);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: V3
Expected: `Boxplot` ✗（`Unknown Highcharts chart type: Boxplot`）。

- [ ] **Step 3: 实现模板**

`<vendor>/src/highcharts/templates/boxplot.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Boxplot — five-number summaries computed in the template from raw
// observations, using the EXACT algorithm of the ECharts template
// (echarts/templates/boxplot.ts: linear-interpolated quantiles, Tukey 1.5×IQR
// whiskers, optional Min–Max whiskers, outliers per box). Highcharts renders
// box + whisker + native outlier markers from each point object, so no extra
// point series is needed (series shape stays one boxplot series).

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import {
    extractCategories, groupBy, detectAxes, getCategoryOrder, isDiscrete,
} from './utils';

/** Linear-interpolated quantile (copy of the ECharts template's quantile). */
function quantile(sorted: number[], p: number): number {
    const n = sorted.length;
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function fiveNumberSummary(
    values: number[],
    whiskerMethod: 'iqr' | 'minmax' = 'iqr',
): { low: number; q1: number; median: number; q3: number; high: number; outliers: number[] } {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return { low: 0, q1: 0, median: 0, q3: 0, high: 0, outliers: [] };
    if (n === 1) return { low: sorted[0], q1: sorted[0], median: sorted[0], q3: sorted[0], high: sorted[0], outliers: [] };

    const median = quantile(sorted, 0.5);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);

    if (whiskerMethod === 'minmax') {
        return { low: sorted[0], q1, median, q3, high: sorted[n - 1], outliers: [] };
    }
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const whiskerLow = sorted.find(v => v >= lowerFence) ?? sorted[0];
    const whiskerHigh = [...sorted].reverse().find(v => v <= upperFence) ?? sorted[n - 1];
    const outliers = values.filter(v => v < lowerFence || v > upperFence);
    return { low: whiskerLow, q1, median, q3, high: whiskerHigh, outliers };
}

export const hcBoxplotDef: ChartTemplateDef = {
    chart: 'Boxplot',
    template: { mark: 'boxplot', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity'], // EC 声明但从不读 opacity，此处照单保留以逐项对照
    markCognitiveChannel: 'position',
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
            paramOverrides: { defaultBandSize: 28 },
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        // Whisker convention: Tukey (iqr, default) or Min–Max.
        const whiskerMethod: 'iqr' | 'minmax' =
            ctx.chartProperties?.whiskerMethod === 'minmax' ? 'minmax' : 'iqr';

        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const colorField = channelSemantics.color?.field;
        const categories = extractCategories(
            table, catField, getCategoryOrder(ctx, categoryAxis) ?? channelSemantics[categoryAxis]?.ordinalSortOrder,
        );
        const isHorizontal = categoryAxis === 'y';
        const indexOf = new Map(categories.map((c, i) => [c, i]));
        const summaryFor = (rows: any[]) => {
            const values = rows.map(r => Number(r[valField])).filter(v => Number.isFinite(v));
            return values.length > 0 ? fiveNumberSummary(values, whiskerMethod) : null;
        };

        const series: any[] = [];
        if (colorField && isDiscrete(channelSemantics.color?.type)) {
            const groups = groupBy(table, colorField);
            const order = getCategoryOrder(ctx, 'color');
            const names = order && order.length > 0 ? order.filter(k => groups.has(k)) : [...groups.keys()];
            for (const name of names) {
                const catGroups = groupBy(groups.get(name) ?? [], catField);
                series.push({
                    name,
                    type: 'boxplot',
                    data: categories.map(cat => summaryFor(catGroups.get(cat) ?? [])),
                });
            }
        } else {
            const catGroups = groupBy(table, catField);
            series.push({
                type: 'boxplot',
                data: categories.map(cat => summaryFor(catGroups.get(cat) ?? [])),
            });
        }

        Object.assign(spec, {
            chart: { type: 'boxplot' },
            xAxis: isHorizontal
                ? { type: 'linear', title: { text: valField } }
                : { type: 'category', categories, title: { text: catField } },
            yAxis: isHorizontal
                ? { type: 'category', categories, title: { text: catField } }
                : { type: 'linear', title: { text: valField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'item', categoryLabel: catField, valueLabel: valField, groupLabel: colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'whiskerMethod', label: 'Whiskers', type: 'discrete',
            options: [
                { value: 'iqr', label: 'Tukey (1.5 × IQR)' },
                { value: 'minmax', label: 'Min–Max' },
            ],
            defaultValue: 'iqr',
        } as ChartPropertyDef,
    ],
};
```

顶部补 import：

```typescript
import { detectBandedAxisFromSemantics } from '../../core/axis-detection';
```

- [ ] **Step 4: 注册**

`<vendor>/src/highcharts/templates/index.ts`：

```typescript
import { hcBoxplotDef } from './boxplot';
// …
'Statistical': [hcBoxplotDef],
```

- [ ] **Step 5: 类型检查 + 行为验证**

Run: V1（无输出）→ V2 → V3
Expected: `Boxplot` ✓（该用例 `generic:false`：整体断言由 `check` 接管——五数 `five()` 归一比较 + 无离群点时 EC 不产 overlay 且 HC `outliers` 全为 `[]`）；`Lollipop Chart` / `Waterfall Chart` 保持 ✓。

注：parity 的 Boxplot 用例（Task 0）已设 `generic: false`——HC 对象点 `{low,q1,…}` 在通用 `yOf` 下会得到 `undefined`（与 EC 数组点的 `d[1]=q1` 不匹配），因此必须跳过通用逐点比较，由 `five()` 归一比较整体接管；对象点形态保留（HC 原生 boxplot 靠 `{low,…,outliers}` 承载离群点）。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望全部通过（+2）。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/boxplot.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Boxplot 模板（五数概括镜像 EC + 原生离群点）"
```

### Task 4: Gauge Chart（单表盘均值）

**Files:**
- Create: `<vendor>/src/highcharts/templates/gauge.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

语义对齐：EC 模板读 `size` 通道，多行取均值（四舍五入 2 位），量程 `min`（默认 0）/`max`（默认对数据最大值向上取整到 1/2/5/10 × 10ⁿ——2.5 阶梯是 radar 的 `niceMax` 在用，gauge 不用）。HC 端单表盘镜像同一语义（中性 spec 的 gauge 只映射 y→size，无 column 多表盘，B2 不做多表盘）。

- [ ] **Step 1: 写失败测试**

```typescript
  it('Gauge Chart → single dial with mean value', () => {
    const option = assembleHighcharts({
      data: { values: [{ score: 85 }, { score: 95 }] },
      semantic_types: { score: 'Price' },
      chart_spec: {
        chartType: 'Gauge Chart',
        encodings: { size: { field: 'score' } },
      },
    }) as any;

    expect(option.chart.type).toBe('gauge');
    expect(option.series[0].type).toBe('gauge');
    // 均值 90；max 向上取整到 100
    expect(option.series[0].data[0]).toBe(90);
    expect(option.yAxis.max).toBe(100);
    expect(option.yAxis.min).toBe(0);
    expect(option._requiredModules).toEqual(['highcharts/highcharts-more.js']);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: V3
Expected: `Gauge Chart` ✗（`Unknown Highcharts chart type: Gauge Chart`）。

- [ ] **Step 3: 实现模板**

`<vendor>/src/highcharts/templates/gauge.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Gauge Chart — one dial whose value is the rounded mean of the
// `size` channel over all rows (mirror echarts/templates/gauge.ts: single
// dial, no `column` faceting in B2). Axis min/max mirror the ECharts template:
// min defaults to 0; max defaults to the data max rounded up to 1/2/5/10 × 10ⁿ
// (the 2.5 rung belongs to the radar template's niceMax, not the gauge).

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';

/** Round up to a nice gauge maximum (copy of the ECharts template helper). */
function niceGaugeMax(v: number): number {
    if (v <= 0) return 100;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const mantissa = v / pow;
    const nice = mantissa <= 1 ? 1
        : mantissa <= 2 ? 2
        : mantissa <= 5 ? 5
        : 10;
    return nice * pow;
}

export const hcGaugeChartDef: ChartTemplateDef = {
    chart: 'Gauge Chart',
    template: { mark: 'point', encoding: {} },
    channels: ['size'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const valueField = channelSemantics.size?.field;
        if (!valueField) return;

        const allValues = table.map(r => Number(r[valueField])).filter(v => Number.isFinite(v));
        const dataMax = allValues.length > 0 ? Math.max(...allValues) : 100;
        const avg = allValues.length > 0
            ? Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length * 100) / 100
            : 0;

        const option: any = {
            chart: { type: 'gauge' },
            yAxis: {
                min: chartProperties?.min ?? 0,
                max: chartProperties?.max ?? niceGaugeMax(dataMax),
                title: { text: valueField },
            },
            series: [{ type: 'gauge', data: [avg] }],
            tooltip: { pointFormat: `<b>${valueField}</b>: {point.y}` },
        };

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'min', label: 'Min', type: 'continuous', min: 0, max: 1000, step: 10, defaultValue: 0 } as ChartPropertyDef,
        { key: 'max', label: 'Max', type: 'continuous', min: 0, max: 10000, step: 100, defaultValue: 100 } as ChartPropertyDef,
    ],
};
```

- [ ] **Step 4: 注册**

`<vendor>/src/highcharts/templates/index.ts`：

```typescript
import { hcGaugeChartDef } from './gauge';
// …
'Indicator': [hcGaugeChartDef],
```

- [ ] **Step 5: 类型检查 + 行为验证**

Run: V1（无输出）→ V2 → V3
Expected: `Gauge Chart` ✓（通用断言：series 数 1、点数 1、均值 90 双端一致）；`Lollipop / Waterfall / Boxplot` 保持 ✓。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望全部通过（+1）。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/gauge.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Gauge Chart 模板（均值 + nice max 量程）"
```

---

### Task 5: Funnel Chart + Pyramid Chart

**Files:**
- Create: `<vendor>/src/highcharts/templates/funnel.ts`
- Create: `<vendor>/src/highcharts/templates/pyramid.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

**Funnel（HC 原生 `funnel`）**：通道 `y=阶段、size=数值`（与 EC funnel 一致）；每阶段值求和（无数值列则计数）；默认 `sort: 'descending'` 按值降序排阶段（镜像 EC 模板，把排序做在数据上——HC funnel 按数据顺序自上而下渲染，不自动排序）；原生 funnel 按 `y` 线性决定梯形宽度，与 EC 同一数值语义。

**Pyramid（复合：两条横向 bar 镜像）**：**不使用** HC 原生 `pyramid`（它是漏斗式三角，与 EC「人口金字塔=双镜像条形」语义完全不同）。镜像 EC：离散通道为 y 类目轴、数值通道为对称 x 值轴；颜色分组的前两个组值分列左右（左侧存负数），`plotOptions.bar.grouping: false` 让两条 bar 叠在同一类目槽内从零线向两侧延伸——不需要模块（核心 `bar`）。颜色取 EC 默认 cat10 的首/四色 `#5470c6` / `#ee6666`，保证双端演示观感一致。

- [ ] **Step 1: 写失败测试**

```typescript
  it('Funnel Chart → native funnel, stages sorted by value descending', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { stage: 'Buy', n: 100 }, { stage: 'Visit', n: 1000 }, { stage: 'Signup', n: 400 },
        ],
      },
      semantic_types: { stage: 'Category', n: 'Price' },
      chart_spec: {
        chartType: 'Funnel Chart',
        encodings: { y: { field: 'stage' }, size: { field: 'n' } },
      },
    }) as any;

    expect(option.chart.type).toBe('funnel');
    expect(option.series[0].type).toBe('funnel');
    expect(option.series[0].data).toEqual([
      { name: 'Visit', y: 1000 },
      { name: 'Signup', y: 400 },
      { name: 'Buy', y: 100 },
    ]);
    expect(option._requiredModules).toEqual(['highcharts/modules/funnel.js']);
  });

  it('Pyramid Chart → two mirrored bar series (no module)', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { age: '0-9', side: 'Male', n: 40 }, { age: '0-9', side: 'Female', n: 35 },
          { age: '10-19', side: 'Male', n: 30 }, { age: '10-19', side: 'Female', n: 25 },
        ],
      },
      semantic_types: { age: 'Category', side: 'Category', n: 'Price' },
      chart_spec: {
        chartType: 'Pyramid Chart',
        encodings: { x: { field: 'n' }, y: { field: 'age' }, color: { field: 'side' } },
      },
    }) as any;

    expect(option.chart.type).toBe('bar');
    expect(option.series.map((s: any) => s.name)).toEqual(['Male', 'Female']);
    // 左侧为负、右侧为正（镜像）
    expect(option.series[0].data).toEqual([-40, -30]);
    expect(option.series[1].data).toEqual([35, 25]);
    expect(option.plotOptions.bar.grouping).toBe(false);
    expect(option.yAxis.type).toBe('category');
    expect(option.xAxis.min).toBe(-40);
    expect(option.xAxis.max).toBe(40);
    expect(option._requiredModules).toBeUndefined();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: V3
Expected: `Funnel Chart` / `Pyramid Chart` 两行 ✗。

- [ ] **Step 3: 实现 Funnel**

`<vendor>/src/highcharts/templates/funnel.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Funnel Chart — native `funnel` series (needs modules/funnel.js).
// Channel contract mirrors the ECharts funnel template: y = stage name
// (nominal), size = stage value. Values are summed per stage (or counted when
// no value field). The default `sort: 'descending'` reorders stages by value —
// mirrored IN THE DATA because Highcharts renders funnel slices in data order
// without sorting.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories } from './utils';

export const hcFunnelChartDef: ChartTemplateDef = {
    chart: 'Funnel Chart',
    template: { mark: 'rect', encoding: {} },
    channels: ['y', 'size'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        axisFlags: { y: { banded: true } },
        paramOverrides: { defaultBandSize: 50 },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const stageField = channelSemantics.y?.field;
        const valField = channelSemantics.size?.field;
        if (!stageField) return;

        const stages = extractCategories(table, stageField, channelSemantics.y?.ordinalSortOrder);
        if (stages.length === 0) return;

        const funnelData: { name: string; y: number }[] = [];
        if (valField) {
            const agg = new Map<string, number>();
            for (const row of table) {
                const stage = String(row[stageField] ?? '');
                const v = Number(row[valField]) || 0;
                agg.set(stage, (agg.get(stage) ?? 0) + v);
            }
            for (const stage of stages) funnelData.push({ name: stage, y: agg.get(stage) ?? 0 });
        } else {
            const counts = new Map<string, number>();
            for (const row of table) {
                const stage = String(row[stageField] ?? '');
                counts.set(stage, (counts.get(stage) ?? 0) + 1);
            }
            for (const stage of stages) funnelData.push({ name: stage, y: counts.get(stage) ?? 0 });
        }

        const sortOrder = chartProperties?.sort ?? 'descending';
        if (sortOrder === 'descending') funnelData.sort((a, b) => b.y - a.y);
        else if (sortOrder === 'ascending') funnelData.sort((a, b) => a.y - b.y);
        // 'none' preserves the original stage order

        Object.assign(spec, {
            chart: { type: 'funnel' },
            series: [{
                type: 'funnel',
                data: funnelData,
                dataLabels: { enabled: true, format: '{point.name}: {point.y}' },
            }],
            tooltip: { pointFormat: '<b>{point.name}</b>: {point.y}' },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'sort', label: 'Sort', type: 'discrete', options: [
                { value: 'descending', label: 'Descending (default)' },
                { value: 'ascending', label: 'Ascending' },
                { value: 'none', label: 'Original order' },
            ],
        } as ChartPropertyDef,
    ],
};
```

- [ ] **Step 4: 实现 Pyramid**

`<vendor>/src/highcharts/templates/pyramid.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Pyramid Chart — a population pyramid built from TWO mirrored
// horizontal bar series (left stored negative), NOT the native funnel-style
// `pyramid` series, whose triangle shape cannot express a two-sided population
// pyramid. Mirrors echarts/templates/pyramid.ts exactly: the discrete channel
// becomes the y category axis, the value channel the symmetric x axis;
// `plotOptions.bar.grouping: false` overlays both series in one category slot
// so they extend back-to-back from the zero line. Core `bar` only — no module.
//
// Colour mirrors the ECharts backend's defaults (cat10 index 0 / 3).

import { ChartTemplateDef } from '../../core/types';
import {
    extractCategories, groupBy, getCategoryOrder, isDiscrete,
} from './utils';

const LEFT_COLOR = '#5470c6';
const RIGHT_COLOR = '#ee6666';

export const hcPyramidChartDef: ChartTemplateDef = {
    chart: 'Pyramid Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { y: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const xField = xCS?.field;
        const yField = yCS?.field;
        if (!xField || !yField) return;

        const yDiscrete = isDiscrete(yCS?.type);
        const catField = yDiscrete ? yField : xField;
        const valField = yDiscrete ? xField : yField;
        const colorField = channelSemantics.color?.field ?? channelSemantics.group?.field;
        const catChannel = yDiscrete ? 'y' : 'x';
        const catCS = yDiscrete ? yCS : xCS;

        const categories = extractCategories(
            table, catField, getCategoryOrder(ctx, catChannel) ?? catCS?.ordinalSortOrder,
        );
        const sumPerCategory = (rows: any[]) => {
            const map = new Map<string, number>();
            for (const row of rows) {
                const cat = String(row[catField] ?? '');
                const v = Number(row[valField]);
                if (Number.isFinite(v)) map.set(cat, (map.get(cat) ?? 0) + v);
            }
            return categories.map(cat => map.get(cat) ?? 0);
        };

        let leftPos: number[];
        let rightPos: number[];
        let leftName: string | undefined;
        let rightName: string | undefined;
        if (colorField) {
            const groups = groupBy(table, colorField);
            const names = [...groups.keys()];
            const leftGroup = names[0];
            const rightGroup = names.length > 1 ? names[1] : names[0];
            const pick = (g: string | undefined) => (g === undefined
                ? []
                : sumPerCategory((groups.get(g) ?? [])));
            leftPos = pick(leftGroup);
            rightPos = pick(rightGroup);
            leftName = leftGroup === undefined ? undefined : String(leftGroup);
            rightName = rightGroup === undefined ? undefined : String(rightGroup);
        } else {
            leftPos = sumPerCategory(table);
            rightPos = leftPos;
        }

        const maxAbs = Math.max(0, ...leftPos.map(Math.abs), ...rightPos.map(Math.abs));
        const colorFor = (name: string | undefined, idx: number) =>
            leftName === rightName ? LEFT_COLOR : (idx === 0 ? LEFT_COLOR : RIGHT_COLOR);

        Object.assign(spec, {
            chart: { type: 'bar' },
            plotOptions: { bar: { grouping: false } },
            xAxis: {
                type: 'linear',
                title: { text: valField },
                ...(maxAbs > 0 ? { min: -maxAbs, max: maxAbs } : {}),
                labels: { formatter: function (this: any): string { return String(Math.abs(Number(this.value))); } },
            },
            yAxis: { type: 'category', categories, title: { text: catField } },
            series: [
                { name: leftName, type: 'bar', data: leftPos.map(v => -v), color: colorFor(leftName, 0) },
                { name: rightName, type: 'bar', data: rightPos, color: colorFor(rightName, 1) },
            ],
            tooltip: { shared: true, valueDecimals: 0 },
            _hcTooltip: { trigger: 'axis', categoryLabel: catField, valueLabel: valField, groupLabel: colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
```

- [ ] **Step 5: 注册两端模板**

`<vendor>/src/highcharts/templates/index.ts`：

```typescript
import { hcFunnelChartDef } from './funnel';
import { hcPyramidChartDef } from './pyramid';
// …
'Bar':          [hcBarChartDef, hcGroupedBarChartDef, hcStackedBarChartDef, hcLollipopChartDef, hcPyramidChartDef],
'Part-to-Whole':[hcPieChartDef, hcDonutChartDef, hcFunnelChartDef],
```

（Pyramid 与 Funnel 的注册位置会改变 `'Bar'` 与 `'Part-to-Whole'` 两行的现有内容——若之前任务已把 `hcLollipopChartDef` 加进 `'Bar'`，则只在该行末尾补 `hcPyramidChartDef`。）

- [ ] **Step 6: 类型检查 + 行为验证**

Run: V1（无输出）→ V2 → V3
Expected: `Funnel Chart` / `Pyramid Chart` 两行 ✓；既有 B2 ✓ 保持。

- [ ] **Step 7: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望全部通过（+2）。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/funnel.ts <vendor>/src/highcharts/templates/pyramid.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Funnel（原生 funnel）与 Pyramid（双 bar 镜像）模板"
```

---

### Task 6: Streamgraph（原生 streamgraph）

**Files:**
- Create: `<vendor>/src/highcharts/templates/streamgraph.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Test: `<vendor>/tests/highcharts.test.ts`

语义对齐：EC 用 `themeRiver`（data 三元组 `[x, value, seriesName]`，缺组补 0）。HC 用原生 `streamgraph`：每个 color 分组一个系列，每系列在全部 x 上都有点（缺组补 0，保证与 EC 同值）；temporal x → `datetime` 轴（epoch ms 点对）；categorical x → 数值下标 + axisLabel 映射回类目名（HC streamgraph 不支持 category 轴，镜像 EC 模板对非时间类目的下标处理）。x 的点序 = 数据首次出现顺序（HC 端在数据里显式给 x，不依赖自动排序）。

- [ ] **Step 1: 写失败测试**

```typescript
  it('Streamgraph → one streamgraph series per color group, zero-filled x grid', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { m: '2026-01', region: 'East', v: 10 }, { m: '2026-02', region: 'East', v: 15 },
          { m: '2026-01', region: 'West', v: 20 }, { m: '2026-02', region: 'West', v: 5 },
        ],
      },
      semantic_types: { m: 'YearMonth', region: 'Country', v: 'Price' },
      chart_spec: {
        chartType: 'Streamgraph',
        encodings: { x: { field: 'm' }, y: { field: 'v' }, color: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('streamgraph');
    expect(option.series.map((s: any) => s.name)).toEqual(['East', 'West']);
    expect(option.series.every((s: any) => s.type === 'streamgraph')).toBe(true);
    const [e0] = option.series[0].data;
    expect(new Date(e0[0]).toISOString().slice(0, 7)).toBe('2026-01');
    expect(e0[1]).toBe(10);
    expect(option.xAxis.type).toBe('datetime');
    expect(option._requiredModules).toEqual(['highcharts/modules/streamgraph.js']);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: V3
Expected: `Streamgraph` ✗。

- [ ] **Step 3: 实现模板**

`<vendor>/src/highcharts/templates/streamgraph.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Streamgraph — native `streamgraph` series (modules/streamgraph.js).
// Mirrors the ECharts themeRiver template's value model: x points in first
// appearance order, one series per color group, every series present at every x
// (missing cells filled with 0). Temporal x uses a datetime axis (epoch-ms
// point pairs); categorical x uses integer slots with an axis-label formatter
// mapping slot → category name (Highcharts streamgraph needs numeric x).

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, groupBy, toEpochMs, isParseableTemporal } from './utils';

export const hcStreamgraphDef: ChartTemplateDef = {
    chart: 'Streamgraph',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;
        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        const rows = table as any[];
        const useTime = xCS.type === 'temporal' && isParseableTemporal(rows.map(r => r[xField]));
        const xVals: string[] = [];
        const seen = new Set<string>();
        for (const row of rows) {
            const xv = String(row[xField]);
            if (!seen.has(xv)) { seen.add(xv); xVals.push(xv); }
        }
        const slotOf = new Map(xVals.map((x, i) => [x, i]));
        const xCoord = (xv: string) => (useTime ? toEpochMs(xv)! : slotOf.get(xv)!);

        const series: any[] = [];
        const emit = (name: string | undefined, grid: (number | null)[]) => {
            const data = grid.map((v, i) => [useTime ? xCoord(xVals[i]) : i, v ?? 0] as [number, number]);
            series.push({ name, type: 'streamgraph', data });
        };

        if (colorField) {
            const groups = groupBy(rows, colorField);
            if (groups.size > 0) {
                for (const [name, groupRows] of groups) {
                    const byX = new Map<string, number>();
                    for (const row of groupRows) {
                        const xv = String(row[xField]);
                        const v = Number(row[yField]);
                        if (Number.isFinite(v)) byX.set(xv, (byX.get(xv) ?? 0) + v);
                    }
                    // Zero-fill every x so stream stacks align with the ECharts side.
                    emit(name, xVals.map(xv => byX.get(xv) ?? 0));
                }
            } else {
                emit(yField, xVals.map(() => 0));
            }
        } else {
            const byX = new Map<string, number>();
            for (const row of rows) {
                const xv = String(row[xField]);
                const v = Number(row[yField]);
                if (Number.isFinite(v)) byX.set(xv, (byX.get(xv) ?? 0) + v);
            }
            emit(yField, xVals.map(xv => byX.get(xv) ?? 0));
        }

        const xAxis: any = useTime
            ? { type: 'datetime', title: { text: xField } }
            : {
                type: 'linear',
                min: -0.5,
                max: Math.max(0, xVals.length - 0.5),
                tickInterval: 1,
                title: { text: xField },
                labels: { formatter: function (this: any): string { return xVals[Math.round(Number(this.value))] ?? ''; } },
            };

        Object.assign(spec, {
            chart: { type: 'streamgraph' },
            xAxis,
            yAxis: { type: 'linear', visible: false, title: { text: yField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'axis', categoryLabel: xField, valueLabel: yField, groupLabel: colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
```

> 注：若 V3 的 `Streamgraph` 行仍红，先检查零填充与系列名是否与 EC 端逐项一致（`x` 在 HC 为 epoch ms、EC 为 `'2026-01'` 字符串，两者由 parity 的 check 做映射后比对）。

- [ ] **Step 4: 注册**

`<vendor>/src/highcharts/templates/index.ts`：

```typescript
import { hcStreamgraphDef } from './streamgraph';
// …
'Line & Area': [hcLineChartDef, hcAreaChartDef, hcSlopeChartDef, hcStreamgraphDef],
```

- [ ] **Step 5: 类型检查 + 行为验证**

Run: V1（无输出）→ V2 → V3
Expected: `Streamgraph` ✓；`Funnel Chart` / `Pyramid Chart` 保持 ✓。

- [ ] **Step 6: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望全部通过（+1）。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/streamgraph.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Streamgraph 模板（原生 streamgraph，时间/类目双轴）"
```

### Task 7: Radar Chart（polar line）+ Rose Chart（原生 variablepie）

**Files:**
- Create: `<vendor>/src/highcharts/templates/radar.ts`
- Create: `<vendor>/src/highcharts/templates/rose.ts`
- Modify: `<vendor>/src/highcharts/templates/index.ts`
- Modify: `<vendor>/tests/highcharts.test.ts`（含「未知图型样例」改名 + 注册列表补 B2）

**Radar（polar line）**：通道 `x=指标、y=值、color=实体`；每实体一 polyline 系列，每指标值取「组内均值（2 位小数）」，缺指标补 0（镜像 EC radar 模板）；径向 yAxis `0..max`，`max = niceMax(全部值中的最大值)`（EC 按指标各自 niceMax 归一，HC 只有单一径向尺度——视觉上小量纲指标会相对内收，属已接受的差异，见风险表）。**不填充**：HC 用极坐标 line（无 areaStyle），而 EC 默认 `filled: true`（fillOpacity 0.3）——填充差异见风险表（含回退方案）。需要 `highcharts-more.js`（polar）。

**Rose（原生 `variablepie`）**：x=类目、y=数值（B2 单系列，不做叠堆）。映射与语义：
- HC data 项 `{ name: 类目, y: 1, z: 原始值 }`——`variablepie` 中 y 决定扇区**角度**、z 决定**半径**；玫瑰（nightingale）约定等角、半径随值，故 y 恒为 1（各扇区等宽），z = 该类目聚合值（HC 按 sqrt(z) 缩放半径 → 面积 ∝ z，与 EC 端「sqrt 半径、面积 ∝ 值」编码一致，见风险表）。
- **≤0 值**：`z = Math.max(0, 聚合值)` 钳制到 0（扇区半径为零、不可见但仍占等角槽位），镜像 EC 模板 `sqrt(Math.max(0, v))` 的处理——两端都不会把负值画到反向。parity 夹具只用正值；负/零语义由本设计与 Task 11 目测覆盖。
- 模块：`highcharts/modules/variable-pie.js`（本地 12.6.0 已实测注册 `variablepie`——设计文档附录 A 的记载由此从「假设」变为「实测」）。
- **EC 端对照**：ECharts 没有 `variablepie`。本仓库 flint 的 Rose 模板是「极坐标 `bar` + sqrt 半径」（等价于面积 ∝ 值的玫瑰）；ECharts 本身另有一种通用画法 `pie + roseType: 'radius'/'area'`（radius = 扇区等角、半径随值；area = 面积随值），本计划不引入 EC 端改动，flint 模板维持现状。HC↔EC 数值以原始值为准，parity 用 name→raw 映射比较（Task 0 已定义）。

- [ ] **Step 1: 写失败测试**

```typescript
  it('Radar Chart → one polar line per entity, metrics in indicator order', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { metric: 'speed', entity: 'A', v: 80 }, { metric: 'range', entity: 'A', v: 70 },
          { metric: 'price', entity: 'A', v: 60 }, { metric: 'size', entity: 'A', v: 50 },
          { metric: 'speed', entity: 'B', v: 60 }, { metric: 'range', entity: 'B', v: 90 },
          { metric: 'price', entity: 'B', v: 40 }, { metric: 'size', entity: 'B', v: 80 },
        ],
      },
      semantic_types: { metric: 'Category', entity: 'Category', v: 'Price' },
      chart_spec: {
        chartType: 'Radar Chart',
        encodings: { x: { field: 'metric' }, y: { field: 'v' }, color: { field: 'entity' } },
      },
    }) as any;

    expect(option.chart.polar).toBe(true);
    expect(option.chart.type).toBe('line');
    expect(option.series.map((s: any) => s.name)).toEqual(['A', 'B']);
    expect(option.series[0].data).toEqual([80, 70, 60, 50]);
    expect(option.series[1].data).toEqual([60, 90, 40, 80]);
    expect(option.xAxis.categories).toEqual(['speed', 'range', 'price', 'size']);
    expect(option.yAxis.min).toBe(0);
    expect(option.yAxis.max).toBe(100); // niceMax(90)
    expect(option._requiredModules).toEqual(['highcharts/highcharts-more.js']);
  });

  it('Rose Chart → variablepie slices: equal angle (y=1), radius z = raw value', () => {
    const option = assembleHighcharts({
      data: { values: [{ cat: 'a', v: 10 }, { cat: 'b', v: 20 }, { cat: 'c', v: 30 }] },
      semantic_types: { cat: 'Category', v: 'Price' },
      chart_spec: {
        chartType: 'Rose Chart',
        encodings: { x: { field: 'cat' }, y: { field: 'v' } },
      },
    }) as any;

    expect(option.chart.type).toBe('variablepie');
    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe('variablepie');
    expect(option.series[0].data).toEqual([
      { name: 'a', y: 1, z: 10 },
      { name: 'b', y: 1, z: 20 },
      { name: 'c', y: 1, z: 30 },
    ]);
    expect(option._requiredModules).toEqual(['highcharts/modules/variable-pie.js']);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: V3
Expected: `Radar Chart` / `Rose Chart` 两行 ✗。

- [ ] **Step 3: 实现 Radar**

`<vendor>/src/highcharts/templates/radar.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Radar Chart — polar line chart (chart.polar from
// highcharts-more.js). Channel contract mirrors the ECharts radar template:
// x = metric name, y = metric value, color = entity. Per entity the metric
// values are the group mean rounded to 2 decimals (missing metric → 0), in
// indicator (first-appearance) order. Highcharts shares ONE radial scale, so
// yAxis.max = niceMax over the largest metric (ECharts normalizes per-metric
// indicator max); shapes differ for mixed-magnitude metrics — accepted, see
// plan risk list.

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, groupBy } from './utils';

/** Round up to a nice ceiling (copy of the ECharts radar template helper). */
function niceMax(v: number): number {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const mantissa = v / pow;
    const nice = mantissa <= 1 ? 1
        : mantissa <= 2 ? 2
        : mantissa <= 2.5 ? 2.5
        : mantissa <= 5 ? 5
        : 10;
    return nice * pow;
}

export const hcRadarChartDef: ChartTemplateDef = {
    chart: 'Radar Chart',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const axisField = channelSemantics.x?.field;
        const valueField = channelSemantics.y?.field;
        const groupField = channelSemantics.color?.field;
        if (!axisField || !valueField) return;

        const metrics = extractCategories(table, axisField, channelSemantics.x?.ordinalSortOrder);
        if (metrics.length < 2) return;

        const meanBy = (rows: any[]) => {
            const metricVals = new Map<string, { sum: number; count: number }>();
            for (const row of rows) {
                const m = String(row[axisField]);
                const v = Number(row[valueField]) || 0;
                if (!metricVals.has(m)) metricVals.set(m, { sum: 0, count: 0 });
                const entry = metricVals.get(m)!;
                entry.sum += v;
                entry.count++;
            }
            return metrics.map(m => {
                const entry = metricVals.get(m);
                return entry ? Math.round((entry.sum / entry.count) * 100) / 100 : 0;
            });
        };

        const series: any[] = [];
        const legend: any = { enabled: false };
        if (groupField) {
            const groups = groupBy(table, groupField);
            for (const [name, rows] of groups) {
                series.push({ name, type: 'line', data: meanBy(rows), marker: { enabled: true, radius: 3 } });
            }
            legend.enabled = series.length > 1;
            legend.title = { text: groupField };
        } else {
            series.push({ type: 'line', data: meanBy(table), marker: { enabled: true, radius: 3 } });
        }

        const allMax = Math.max(...metrics.map(m =>
            Math.max(...table
                .filter(r => String(r[axisField]) === m)
                .map(r => Number(r[valueField]))
                .filter(v => Number.isFinite(v)), 0),
        ), 1);

        Object.assign(spec, {
            chart: { type: 'line', polar: true },
            xAxis: { type: 'category', categories: metrics, title: { text: axisField } },
            yAxis: { min: 0, max: niceMax(allMax), title: { text: valueField } },
            series,
            legend,
            _hcTooltip: { trigger: 'item', categoryLabel: axisField, valueLabel: valueField, groupLabel: groupField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
```

- [ ] **Step 4: 实现 Rose（原生 variablepie）**

`<vendor>/src/highcharts/templates/rose.ts`：

```typescript
// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Rose Chart — native `variablepie` series (modules/variable-pie.js,
// measured to register `variablepie` on 12.6.0). Channel contract mirrors the
// ECharts rose template for the single-series form: x = category, y = value.
// Nightingale convention: every slice gets an EQUAL angle (`y = 1`); the
// measure drives the slice radius via `z`. Highcharts scales the radius from
// z (area ∝ z per its docs), the ECharts flint template stores sqrt(value) as
// its polar-bar radius with the raw value on `_rawValue` — the area encoding
// is the same, and parity compares the RAW per-category values.
//
// Zero/negative: `z = Math.max(0, value)` (clamped to 0 → invisible slice,
// angle slot kept), mirroring the ECharts template's sqrt(max(0, value)); a
// negative measure never draws a reversed sector on either side.

import { ChartTemplateDef } from '../../core/types';
import { extractCategories } from './utils';

export const hcRoseChartDef: ChartTemplateDef = {
    chart: 'Rose Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['x', 'y'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const catField = channelSemantics.x?.field;
        const valField = channelSemantics.y?.field;
        if (!catField || !valField) return;

        const categories = extractCategories(table, catField, channelSemantics.x?.ordinalSortOrder);
        if (categories.length === 0) return;

        const agg = new Map<string, number>();
        for (const row of table) {
            const cat = String(row[catField] ?? '');
            const v = Number(row[valField]);
            if (Number.isFinite(v)) agg.set(cat, (agg.get(cat) ?? 0) + v);
        }
        const data = categories.map(cat => ({
            name: cat,
            y: 1,                              // 等角（nightingale）：各扇区角度均等
            z: Math.max(0, agg.get(cat) ?? 0), // 半径量 = 原始值（≤0 钳 0）
        }));

        Object.assign(spec, {
            chart: { type: 'variablepie' },
            series: [{ type: 'variablepie', data }],
            tooltip: { pointFormat: '<b>{point.name}</b>: {point.z}' },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
```

- [ ] **Step 5: 修既有测试的两个假设 + 注册**

`<vendor>/tests/highcharts.test.ts`：

(1) 既有用例 `'rejects unknown chart types loudly'` 用的是 `chartType: 'Radar Chart'`（B2 落地后它不再是未知类型），改为 `'Bullet Chart'`：

```typescript
  it('rejects unknown chart types loudly', () => {
    expect(() => assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: { chartType: 'Bullet Chart', encodings: { x: { field: 'month' } } },
    })).toThrow(/Unknown Highcharts chart type/);
  });
```

(2) 既有用例 `'registers the ChartBrain chart types'` 的 `arrayContaining` 列表补全 B2 名（顺序无关）：

```typescript
    expect(names).toEqual(
      expect.arrayContaining([
        'Bar Chart', 'Line Chart', 'Area Chart', 'Scatter Plot', 'Connected Scatter Plot',
        'Pie Chart', 'Donut Chart', 'Slope Chart', 'Strip Plot', 'Grouped Bar Chart',
        'Stacked Bar Chart', 'Lollipop Chart', 'Waterfall Chart', 'Funnel Chart',
        'Pyramid Chart', 'Gauge Chart', 'Streamgraph', 'Boxplot', 'Rose Chart', 'Radar Chart',
      ]),
    );
```

`<vendor>/src/highcharts/templates/index.ts`：

```typescript
import { hcRadarChartDef } from './radar';
import { hcRoseChartDef } from './rose';
// …
'Polar':         [hcRadarChartDef],
'Part-to-Whole': [hcPieChartDef, hcDonutChartDef, hcFunnelChartDef, hcRoseChartDef],
```

（Rose 改为 pie 族系列后归入 `'Part-to-Whole'`（与 pie/donut/funnel 同类）；`'Polar'` 只留 Radar。若 Task 5 已把 funnel 加进 `'Part-to-Whole'`，仅在该行追加 `hcRoseChartDef`。）

- [ ] **Step 6: 类型检查 + 行为验证**

Run: V1（无输出）→ V2 → V3
Expected: `Radar Chart` / `Rose Chart` 两行 ✓——至此 parity **20 行全绿**。

- [ ] **Step 7: 请用户跑权威测试并提交**

请用户执行：`cd <vendor> && npm test` → 期望全部通过（+2）。
Expected: 全绿后提交。

```bash
git add <vendor>/src/highcharts/templates/radar.ts <vendor>/src/highcharts/templates/rose.ts <vendor>/src/highcharts/templates/index.ts <vendor>/tests/highcharts.test.ts
git commit -m "feat(highcharts): Radar（polar line）与 Rose（原生 variablepie）模板 + 未知图型样例换名"
```

## 模块加载机制（决策与理由）

**结论：后端输出侧声明，消费端加载——`assembleHighcharts` 在产物 options 上 stamp 一个 `_requiredModules: string[]`（值 = `highcharts` npm 包内相对模块路径，如 `'highcharts/highcharts-more.js'`），SDK 的 `toHighcharts` 原样透传，SDK 类型 `HighchartsOption` 增加同名可选字段；模板层零改动、库零运行时依赖。**

- **现状核对（不臆造）**：`ChartTemplateDef`（`core/types.ts:880`）没有 `requiredModules` 字段；`src/highcharts/**` 与 `tests/highcharts.test.ts` 对 `seriesTypes/modules/highcharts-more/require/window` 的检索为 0 命中——后端只产纯 options。因此机制是**新增**而非改造。
- **为什么不在模板/`ChartTemplateDef` 上加字段**：该类型是 core 共享类型（VL/EC/Chart.js/Plotly 共用），模块需求是 Highcharts 专属知识，放共享类型会污染无关后端。登记表放在 HC 自己的 `templates/modules.ts`（与注册表同目录、同 key 空间）。
- **为什么用输出标注而非 SDK import 模块**：SDK 消费的 Highcharts 实例属于调用方进程（浏览器全局或 bundle 的 `Highcharts`），SDK 无法也无权替你 `require`/注册；且模板零运行时 import 让库在任何环境（含 Node 无 DOM 测试）都不崩。**树摇友好**：产物不含任何模块代码，只有声明字符串。
- **值是有序数组，不是集合**（实测依据）：Highcharts 模块文件会解构此前已载入模块的原型链——`lollipop.js` 解构 `seriesTypes.dumbbell`，`dumbbell.js` 又解构 `seriesTypes.arearange`（只有 `highcharts-more.js` 提供）。实测：`highcharts-more → dumbbell → lollipop` 顺序加载成功注册 `lollipop`；只载 `dumbbell → lollipop` 抛 `Class extends value undefined is not a constructor or null`；只载 `highcharts-more → lollipop`（缺 dumbbell）或单独 `lollipop.js` 抛 `Cannot read properties of undefined (reading 'prototype')`。因此 `_requiredModules` / `HC_CHART_MODULES` 的值**语义为加载顺序**，消费端必须按数组序 require/`<script>`。B2 各类型目前都只需 0–1 个模块（顺序平凡成立），但契约按「顺序数组」定义，避免未来（如改用原生 lollipop 链）出现无法表达的依赖。
- **缺模块行为（分两类）**：装配期根本不触碰 HC 运行时，所以「缺模块」只可能在**消费端加载/渲染期**暴露——① 加载期缺依赖链中间件：立即抛上面那种难以定位的 TypeError（顺序数组契约 + INTEGRATION 表就是为此存在的）；② 渲染期缺系列模块：Highcharts error #17 直接点名缺失 series type。**B2 特意把 Lollipop / Pyramid 做成零模块复合模板，让这两种失败模式都不可能出现**——这正是「原生 lollipop 链虽可用却不用」的决定性理由之一（另一理由：其 dumbbell 变体语义与 EC 端 bar+scatter 复合模板无法按 series 结构镜像）。
- **测试性**：模块登记表是纯数据，vendor 单测直接断言；沙箱内用 `.verify/libs` 的 UMD 按真实 recipe（`global.window = global`；`core.default || core` 得 HC；`global.Highcharts = HC`；`require(module)(HC)` 处理工厂形态）逐模块 `require` 后断言 `Highcharts.seriesTypes.<name>`——这是沙箱内证明模块接线的**唯一**方式，探针命令见 Task 0 Step 6。实测注册清单：core 8 种（area/areaspline/bar/column/line/pie/scatter/spline）；`highcharts-more.js` → arearange/areasplinerange/boxplot/bubble/columnpyramid/columnrange/errorbar/gauge/packedbubble/polygon/waterfall；`funnel.js` → funnel/pyramid；`streamgraph.js` → streamgraph；`variable-pie.js` → variablepie（B2 rose）；`histogram-bellcurve.js` → histogram + bellcurve（B3 预留）。
- **本地实测覆盖：相关模块全部已下载并实测**：`.verify/libs/modules/` 内含 `highcharts-more.js`(101104 B)、`funnel.js`、`streamgraph.js`、`dumbbell.js`(7349 B)、`lollipop.js`(3282 B)、`variable-pie.js`(5416 B)、`histogram-bellcurve.js`(7114 B)。实测注册：`highcharts-more → dumbbell` 注册 `dumbbell`；`highcharts-more → dumbbell → lollipop` 注册 `lollipop`；`variable-pie.js` 单独注册 `variablepie`；`histogram-bellcurve.js` 注册 `histogram` + `bellcurve`。B2 不使用 `dumbbell`/`lollipop`（改用零模块复合模板），但**「不用」不等于「未下载/未实测」**——文档不得再写成未下载。
- **值格式**：与 `docs/INTEGRATION.md` 模块表同一词汇（`highcharts/highcharts-more.js`、`highcharts/modules/funnel.js`、`highcharts/modules/streamgraph.js`、`highcharts/modules/variable-pie.js`），消费端可直接拼 CDN URL 或深链 npm 包路径。复合模板（Lollipop / Pyramid）不 stamp（零模块）。
- **ECharts 端**：无模块概念，本机制不触及 EC；EC 模板能力本就内置。

## 逐图型裁决表（B2 全部保留，含已识别的形态差异）

| 图型 | HC series + 所需模块 | EC series 类型 | 裁决 | 保留理由 / 需注意的形态差异 |
|---|---|---|---|---|
| Lollipop | 复合 `column`(茎) + `scatter`(点)；**无模块** | `bar`(茎) + `scatter`(点) | 保留 B2 | 两端同为「茎+点」复合，数值/系列结构镜像。原生 `lollipop` 系列**存在**但需 `highcharts-more → dumbbell → lollipop` 链（已实测注册；`dumbbell.js` 亦已下载并实测注册，仅因几何/结构不匹配而不用）且为 dumbbell 变体、无法与 EC 复合模板按 series 结构镜像，故不用（详见「模块加载机制」与风险表） |
| Waterfall | 原生 `waterfall`；`highcharts-more.js` | `custom`(浮动矩形) + legend-only + connectors | 保留 B2 | 共享 `resolveTotalsMode` 语义；EC 的「总额复述末行」在 HC 用 `isSum` 表达，数值等价（见 Task 2） |
| Funnel | 原生 `funnel`；`modules/funnel.js` | `funnel` | 保留 B2 | 排序做在数据上（HC 不自动排序）；缺 legend 色板条目属观感差异 |
| Pyramid | 复合双 `bar` 镜像；**无模块** | 双 `bar` 镜像（`barGap:'-100%'`） | 保留 B2 | **不用** HC 原生 `pyramid`（三角漏斗，无法表达双边人口金字塔）；HC 用 `grouping:false` 叠放，形态一致 |
| Gauge | 原生 `gauge`；`highcharts-more.js` | `gauge` | 保留 B2 | 单表盘（中性 spec 不映射 `column`）；EC 的多表盘能力 SDK 侧用不到 |
| Streamgraph | 原生 `streamgraph`；`modules/streamgraph.js` | `themeRiver`（`singleAxis`） | 保留 B2 | 时间 x 双端同值（ms vs 字符串，parity 映射比对）；categorical x 双端都用「下标+label 回映」 |
| Boxplot | 原生 `boxplot`；`highcharts-more.js` | `boxplot` + 可选离群点 overlay | 保留 B2 | 五数概括同一算法（线性插值 + Tukey 1.5×IQR），逐位一致；HC 离群点走原生 `outliers`，EC 走额外 custom 系列——parity 只比对 box 五数，离群点视觉由演示页核对 |
| Rose | 原生 `variablepie`；`modules/variable-pie.js` | polar `bar`（radius=√value） | 保留 B2 | **选 (a) 原生 `variablepie`**：等角 nightingale，data `{name, y:1, z=原始值}`；面积 ∝ 值（与 EC sqrt 半径同编码，见风险表）。≤0 值双端钳 0。ECharts 无 `variablepie`（通用等价值 = `pie` + `roseType:'radius'/'area'`；flint 模板为极坐标 bar，维持现状）。(b) polar column 需 highcharts-more 且等价于「等角 + 线性半径」的 bar 几何，几何上与 EC 极坐标 bar 更近——弃用它的原因是：原生 series 直接获得饼族图例/hover/每扇区色，与设计稿附录 A 一致，且模块已实测可用；此前「variable-pie.js 未下载/沙箱无网络」的旧前提已失效（模块已补下载并实测注册 `variablepie`）。若目测发现半径/面积换算不可接受，回退 (b) 见风险表 |
| Radar | polar `line`；`highcharts-more.js` | `radar` | 保留 B2 | EC 按指标各自归一（indicator max），HC 单一径向尺度——小量纲指标会相对内收，属已接受的形态差异（风险表有回退方案） |

> 没有图型需要移出 B2 或升到 G3：9 个都能用现有 x/y/series 通道表达，HC 端全部有忠实（或已声明的近似）映射。

## B3 前瞻决策备忘（Histogram，供 B3 计划采用）

实测事实：`highcharts/modules/histogram-bellcurve.js` 在本地 12.6.0 已注册 `histogram` + `bellcurve`（bellcurve 与本库无关，B3 不使用）。

**决策：采用「后端分箱（backend binning）」，不用原生 `histogram` 系列。** 理由：
1. **spec 零泄漏**：中性 spec 与 `transform_plan` 没有任何 bin 算子/通道，也不应引入——分箱必须是后端内部细节。
2. **双端一致性**：bin 边界必须由**同一份共享算法**产出，两端才可能逐 bin 对齐；HC 原生 `histogram` 用 Highcharts 自己的分箱策略（`minBinWidth` 等），不可能与 EC 端同边界。
3. **分层**：分箱发生在**装配期、模板层**——由 HC/EC 各自的 histogram 模板（或它们共用的 core helper）把 x 通道的原始样本切 bin；默认 bin 数用共享规则（如 Sturges），结合布局密度做上限约束；产出为「bin 标签 + 计数」后按普通 column 渲染。
4. 该决策不影响 B2 的模块表登记：INTEGRATION 表 histogram 行已实测标注模块，同时注明 B3 推荐后端分箱（备选原生模块）。

---

### Task 8: 契约白名单（5 处 + 守卫脚本）+ 通道校验器 + SDK 用例

> B1 之后新增了两件契约基建，本 Task 必须一并同步，否则新图型会「校验漏过或误抛」或「白名单五处漂移」：
> - `sdk/src/converter/validate.ts`（`REQUIRED_CHANNELS` + `validateChannels`，`toHighcharts`/`toECharts` 在进入后端前调用）；
> - `scripts/check-chart-types.mjs`（schema enum / `ChartType` union / 两个 `FLINT_CHART_TYPE` / prompt 规则 1 五处一致性守卫）。

**Files:**
- Modify: `specs/chart-spec.schema.json`
- Modify: `sdk/src/types.ts`
- Modify: `sdk/src/converter/highcharts.ts`
- Modify: `sdk/src/converter/echarts.ts`
- Modify: `sdk/src/converter/validate.ts`
- Test: `sdk/tests/converter.test.ts`
- Test: `sdk/tests/validate.test.ts`

- [ ] **Step 1: 扩展 schema enum**

`specs/chart-spec.schema.json` 的 `chart.type` enum（第 18–21 行）：

```json
          "enum": [
            "bar", "line", "pie", "scatter", "area",
            "groupedBar", "stackedBar", "donut", "slope", "connectedScatter", "strip",
            "lollipop", "waterfall", "funnel", "pyramid", "gauge",
            "streamgraph", "boxplot", "rose", "radar"
          ]
```

- [ ] **Step 2: 扩展 SDK 类型**

`sdk/src/types.ts`：

```typescript
export type ChartType =
  | "bar" | "line" | "pie" | "scatter" | "area"
  | "groupedBar" | "stackedBar" | "donut" | "slope" | "connectedScatter" | "strip"
  | "lollipop" | "waterfall" | "funnel" | "pyramid" | "gauge"
  | "streamgraph" | "boxplot" | "rose" | "radar";
```

- [ ] **Step 3: Highcharts 适配器映射 + 类型**

`sdk/src/converter/highcharts.ts`：

(1) `FLINT_CHART_TYPE` 补 9 个条目：

```typescript
  lollipop: "Lollipop Chart",
  waterfall: "Waterfall Chart",
  funnel: "Funnel Chart",
  pyramid: "Pyramid Chart",
  gauge: "Gauge Chart",
  streamgraph: "Streamgraph",
  boxplot: "Boxplot",
  rose: "Rose Chart",
  radar: "Radar Chart",
```

(2) `HighchartsOption` 接口补字段（`_warnings` 注释之后）：

```typescript
  /** 渲染该图型前消费端必须加载的 Highcharts 模块（npm 包内相对路径，如 'highcharts/highcharts-more.js'）；数组即加载顺序；复合模板缺省。 */
  _requiredModules?: string[];
```

(3) `buildEncodings` 的 switch 在 `case "groupedBar"` 之后补两个例外（其余 7 个图型走 default）：

```typescript
    case "funnel":
      // 漏斗：x=阶段名 → Flint y（阶段）通道；y=数值 → Flint size（宽度）
      if (x) encodings.y = { field: x.field };
      if (y) encodings.size = { field: y.field };
      break;
    case "gauge":
      // 仪表：y=指针值 → Flint size
      if (y) encodings.size = { field: y.field };
      break;
```

- [ ] **Step 4: ECharts 适配器映射**

`sdk/src/converter/echarts.ts`：`FLINT_CHART_TYPE` 加同样的 9 个条目；内联映射在 `else if (spec.chart.type === "groupedBar")` 之后补：

```typescript
  } else if (spec.chart.type === "funnel") {
    // 漏斗：x=阶段名 → Flint y（阶段）通道；y=数值 → Flint size（宽度）
    if (x) encodings.y = { field: x.field };
    if (y) encodings.size = { field: y.field };
  } else if (spec.chart.type === "gauge") {
    // 仪表：y=指针值 → Flint size
    if (y) encodings.size = { field: y.field };
  }
```

- [ ] **Step 5: SDK 用例**

`sdk/tests/converter.test.ts`：

(1) `it("every whitelisted chart type maps to the expected backend shape", …)` 里的 `expected: Record<ChartType, { hc: string; ec: string }>` 补 9 行：

```typescript
      lollipop: { hc: "column", ec: "bar" },
      waterfall: { hc: "waterfall", ec: "custom" },
      funnel: { hc: "funnel", ec: "funnel" },
      pyramid: { hc: "bar", ec: "bar" },
      gauge: { hc: "gauge", ec: "gauge" },
      streamgraph: { hc: "streamgraph", ec: "themeRiver" },
      boxplot: { hc: "boxplot", ec: "boxplot" },
      rose: { hc: "variablepie", ec: "bar" },
      radar: { hc: "line", ec: "radar" },
```

(2) `describe("toHighcharts 各图型")` 内追加两个语义用例（funnel 通道借用、gauge 通道借用）：

```typescript
  it("funnel（中性 spec 的 x/y 映射到 Flint 的 y/size 通道）", () => {
    const spec: ChartSpec = {
      schema_version: 1,
      chart: { type: "funnel", title: "漏斗" },
      encodings: {
        x: { field: "month", value_type: "categorical" },
        y: { field: "revenue", value_type: "numeric" },
      },
    };
    const hc = toHighcharts(sales, spec) as any;
    expect(hc.chart.type).toBe("funnel");
    const ec = toECharts(sales, spec) as any;
    expect(ec.series[0].type).toBe("funnel");
    // 阶段=month（3 个），数值=按阶段求和的 revenue
    expect(hc.series[0].data).toHaveLength(3);
    expect(ec.series[0].data).toHaveLength(3);
  });

  it("gauge（中性 spec 的 y 映射到 Flint 的 size 通道）", () => {
    const spec: ChartSpec = {
      schema_version: 1,
      chart: { type: "gauge", title: "均值表盘" },
      encodings: { y: { field: "revenue", value_type: "numeric" } },
    };
    const hc = toHighcharts(sales, spec) as any;
    expect(hc.chart.type).toBe("gauge");
    const ec = toECharts(sales, spec) as any;
    expect(ec.series[0].type).toBe("gauge");
  });
```

- [ ] **Step 6: 扩展通道校验器（validate.ts）与用例**

`sdk/src/converter/validate.ts` 的 `REQUIRED_CHANNELS` 追加 9 行（映射依据 = 「SDK 映射后后端实际消费什么」，与 B1 既有注释同一原则；`series` 对全部图型仍可选，永不入表）：

```typescript
  // B2（映射见 buildEncodings/toECharts：funnel x→y、y→size；gauge y→size；其余 x→x、y→y）
  lollipop: ["x", "y"],
  waterfall: ["x", "y"],
  funnel: ["x", "y"], // x=阶段→Flint y、y=数值→Flint size，两者都被消费
  pyramid: ["x", "y"],
  gauge: ["y"], // 中性 spec 只有 x/y/series：仪表只需一个度量 y（→Flint size）；x 无意义故不要求
  streamgraph: ["x", "y"],
  boxplot: ["x", "y"],
  rose: ["x", "y"],
  radar: ["x", "y"],
```

说明：数据层语义（radar ≥3 指标、boxplot 每类目多个原始观测、funnel 阶段数）**不在通道层强制**——通道校验只查存在性（与 B1 一致），这些语义分别由模板早退守卫（如 radar `metrics.length < 2` 早退）与 prompt few-shot 承担，避免把数据约束塞进校验器。

`sdk/tests/validate.test.ts`：

(1) `ALL_TYPES` 列表补 9；并把两个 `describe` 标题里的「11 种图型」改为「20 种图型」：

```typescript
const ALL_TYPES: ChartType[] = [
  "bar", "line", "pie", "scatter", "area",
  "groupedBar", "stackedBar", "donut", "slope", "connectedScatter", "strip",
  "lollipop", "waterfall", "funnel", "pyramid", "gauge",
  "streamgraph", "boxplot", "rose", "radar",
];
```

(2) 文件末尾追加：

```typescript
describe("validateChannels: B2 图型必需通道", () => {
  const B2_XY_TYPES = [
    "lollipop", "waterfall", "funnel", "pyramid",
    "streamgraph", "boxplot", "rose", "radar",
  ] as const;

  it("gauge 只需 y：只带 y 通过；缺 y（只有 x）抛错点名 y", () => {
    expect(() => validateChannels(makeSpec("gauge", { y: xy.y }))).not.toThrow();
    const spec = makeSpec("gauge", { x: xy.x });
    expect(() => validateChannels(spec)).toThrowError(/gauge 需要 y 通道，缺少: y/);
  });

  it("其余 8 个 B2 图型缺 x 抛错并点名 x", () => {
    for (const type of B2_XY_TYPES) {
      expect(() => validateChannels(makeSpec(type, { y: xy.y })), type)
        .toThrowError(new RegExp(`${type} 需要 x 与 y 通道，缺少: x`));
    }
  });

  it("B2 全部图型带 x+y（或 gauge 只带 y）均通过；series 可带可不带", () => {
    for (const type of ALL_TYPES) {
      const enc = type === "gauge" ? { y: xy.y } : { ...xy };
      expect(() => validateChannels(makeSpec(type, enc)), type).not.toThrow();
      expect(() => validateChannels(makeSpec(type, { ...enc, series: xy2series })), type).not.toThrow();
    }
  });
});
```

（其中 `xy2series` 直接复用文件里已有的 `series` 对象写法：`const xy2series = { series: { field: "region", value_type: "categorical" as const } };`。）

> 校验器是**纯函数**，不依赖 vendor dist——3 个新 it 本身可离线跑通；但 V8 全量还包含 Step 5 的 funnel/gauge 转换用例（依赖新模板的 dist），重建前整体是 2 红 47 绿，见命令速查 V8 注。

- [ ] **Step 7: 沙箱验证（含白名单守卫——本步 V7 红是预期）**

Run: V4（无输出）→ **V7** → V1/V2/V3（parity 仍 20 行全绿——适配器/校验器改动不影响 parity 直连 Flint 模板）。
Expected: **V7 红是预期**：`check-chart-types.mjs` 会打印 prompt.py 缺 9 种（schema/types/adapters 已是 20 种，prompt.py 规则 1 仍是 11 种——五处白名单中唯一滞后处）。该行由 Task 9 Step 1 补齐，Task 9 Step 3 的 V7 转绿（本 Task 的 Files 不包含 `prompt.py`，提交信息与此一致）。SDK 的**行为**用例（Step 5 的 funnel/gauge、Step 6 校验器用例）需 vendor `dist/` 重建后在 V8/权威测试中验证：校验器用例沙箱可跑（纯函数），funnel/gauge 转换用例沙箱内为红（stale dist 无新模板），见命令速查 V8 注。

- [ ] **Step 8: 请用户跑权威测试并提交**

请用户执行：`cd <repo>\vendor\flint-chart\packages\flint-js; npm run build`（重建 dist，SDK 经 file: 链接消费）→ `cd <repo>\sdk; npm run typecheck; npm test`
Expected: typecheck 无输出；sdk npm test 全绿（44 基线 + 5 新增 it = 49 passed：converter +2、validate +3）。
注：`check-chart-types.mjs` 在 Task 8 内仍是红（prompt.py 规则 1 尚未更新，见 Step 7 预期），由 Task 9 Step 1 补齐后转绿——本 Task 的提交不含 prompt.py，与该预期一致。

```bash
git add specs/chart-spec.schema.json sdk/src/types.ts sdk/src/converter/highcharts.ts sdk/src/converter/echarts.ts sdk/src/converter/validate.ts sdk/tests/converter.test.ts sdk/tests/validate.test.ts
git commit -m "feat(spec): 白名单扩至 20 种图型（B2 九个）+ 双端通道映射与 REQUIRED_CHANNELS（funnel/gauge 例外）"
```

### Task 9: 服务端提示词白名单 + 9 条 few-shot

**Files:**
- Modify: `server/chartbrain_server/spec/prompt.py`

- [ ] **Step 1: 更新白名单行**

`server/chartbrain_server/spec/prompt.py` 第 28 行改为（一段）：

```python
1. chart.type must be one of: bar | line | pie | scatter | area | groupedBar | stackedBar | donut | slope | connectedScatter | strip | lollipop | waterfall | funnel | pyramid | gauge | streamgraph | boxplot | rose | radar.
```

（这是五处白名单同步的最后一步：schema / `ChartType` union / 两个 adapter 已在 Task 8 更新；此行补齐后 `node scripts\check-chart-types.mjs` 由红转绿（Task 9 Step 3 验证）。）

- [ ] **Step 2: 追加 9 条 few-shot**

在 `build_user_prompt` 的 `few_shot_examples` 列表末尾（`strip` 条目 `},` 之后、收尾 `],` 之前）插入以下条目。结构与既有条目一致（`query` / `columns` / `chart_spec`）；缩进风格可微调，但字段与 L1 schema 必须逐字合法（`server/tests/test_prompt.py` 会对每条跑 `validate_spec`）。文件现含 **10** 条既有示例（含 bar/line×2/groupedBar/stackedBar/pie/donut/slope/connectedScatter/strip），本轮 **+9 → 共 19 条**。

lollipop（x/y + series 拆分组，先按 month+region 聚合）：

```python
            {
                "query": "Show each region's monthly revenue as lollipops",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "lollipop", "title": "Monthly revenue by region"},
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
```

waterfall（x/y = 阶段/增量，按 stage 聚合；每行是带符号的增量，不是累计值）：

```python
            {
                "query": "Show the waterfall of revenue deltas by stage",
                "columns": [
                    {"name": "stage", "type": "string"},
                    {"name": "amount", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "waterfall", "title": "Revenue build-up"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["stage"],
                                "measures": [
                                    {"field": "amount", "agg": "sum", "as": "stage_delta"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "stage", "value_type": "categorical"},
                        "y": {"field": "stage_delta", "value_type": "numeric"},
                    },
                },
            },
```

funnel（x = 阶段名、y = 阶段值；转换率逐级下降的数据不要排序，模板默认降序）:

```python
            {
                "query": "Show the conversion funnel from visits to purchases",
                "columns": [
                    {"name": "stage", "type": "string"},
                    {"name": "users", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "funnel", "title": "Conversion funnel"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["stage"],
                                "measures": [
                                    {"field": "users", "agg": "sum", "as": "stage_users"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "stage", "value_type": "categorical"},
                        "y": {"field": "stage_users", "value_type": "numeric"},
                    },
                },
            },
```

pyramid（x = 类目轴（年龄段）、y = 度量、series = 分组（男/女））：

```python
            {
                "query": "Show the population pyramid by age band and gender",
                "columns": [
                    {"name": "age", "type": "string"},
                    {"name": "gender", "type": "string"},
                    {"name": "population", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "pyramid", "title": "Population pyramid"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["age", "gender"],
                                "measures": [
                                    {"field": "population", "agg": "sum", "as": "people"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "age", "value_type": "categorical"},
                        "y": {"field": "people", "value_type": "numeric"},
                        "series": {"field": "gender"},
                    },
                },
            },
```

gauge（y = 单个数字；先 avg 聚合出一行，表盘显示该均值）：

```python
            {
                "query": "Show average monthly revenue on a gauge",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "gauge", "title": "Avg monthly revenue"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "measures": [
                                    {"field": "revenue", "agg": "avg", "as": "avg_revenue"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "y": {"field": "avg_revenue", "value_type": "numeric"},
                    },
                },
            },
```

streamgraph（x/y/series，先按 month+region 聚合）：

```python
            {
                "query": "Show how regional revenue flows over the months as a streamgraph",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "streamgraph", "title": "Revenue streams by region"},
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
                        "x": {"field": "month", "value_type": "temporal"},
                        "y": {"field": "monthly_revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
```

boxplot（x = 分组、y = 原始观测；**不带 transform_plan**——分布依赖原始样本）：

```python
            {
                "query": "Compare the score distribution across the two groups",
                "columns": [
                    {"name": "group", "type": "string"},
                    {"name": "score", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "boxplot", "title": "Score distribution by group"},
                    "encodings": {
                        "x": {"field": "group", "value_type": "categorical"},
                        "y": {"field": "score", "value_type": "numeric"},
                    },
                },
            },
```

rose（x = 角类目、y = 数值；先聚合，单系列花瓣）：

```python
            {
                "query": "Show monthly revenue as a rose chart",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "rose", "title": "Monthly revenue rose"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["month"],
                                "measures": [
                                    {"field": "revenue", "agg": "sum", "as": "monthly_revenue"}
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "month", "value_type": "categorical"},
                        "y": {"field": "monthly_revenue", "value_type": "numeric"},
                    },
                },
            },
```

radar（x = 指标名、y = 值、series = 实体；每（实体 × 指标）一行，不带 transform_plan，模板按实体取指标均值）：

```python
            {
                "query": "Compare each product's scores on speed, range, price and size",
                "columns": [
                    {"name": "product", "type": "string"},
                    {"name": "attribute", "type": "string"},
                    {"name": "score", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "radar", "title": "Product capability radar"},
                    "encodings": {
                        "x": {"field": "attribute", "value_type": "categorical"},
                        "y": {"field": "score", "value_type": "numeric"},
                        "series": {"field": "product"},
                    },
                },
            },
```

注意（示例之间取舍的语义）：`boxplot` 保留原始行（分布不能先聚合）、`radar` 保留（实体×指标）原始行（模板取均值）、`gauge` 用 `avg` 聚成单行、`rose/funnel/waterfall/pyramid/lollipop/streamgraph` 先按分组聚合（模板内部再按阶段求和）。**通道校验契合**：9 条 few-shot 的 `encodings` 都满足 Task 8 扩展后的 `REQUIRED_CHANNELS`（gauge 只有 y，其余均有 x+y，series 可选）。

- [ ] **Step 3: 沙箱验证 + 请用户跑权威测试**

Run: V6 → 期望 37 passed（守卫测试 `test_prompt_whitelist_matches_schema_enum` 自动覆盖「prompt 白名单 == schema enum（20）」；`test_every_few_shot_chart_spec_passes_l1` 对 19 条 few-shot（既有 10 + 新增 9）全量校验）；再跑 **V7** → 期望 `✅ 5 处白名单一致（20 种）`（Task 8 里 V7 红，本步转绿）。
Expected: 37 passed；白名单守卫全绿。

```bash
git add server/chartbrain_server/spec/prompt.py
git commit -m "feat(prompt): 白名单与 few-shot 扩至 20 种图型（B2 九个）"
```

### Task 10: 示例与文档（对比页 + 模块对照表修订 + `_requiredModules` 契约）

**Files:**
- Modify: `examples/dual-demo/offline.mjs`
- Modify: `docs/INTEGRATION.md`

- [ ] **Step 1: 对比页支持逐用例数据 + 加载 B2 模块**

`examples/dual-demo/offline.mjs`：

(1) `highchartsTag` 定义之后追加四个模块 tag（本地优先、CDN 兜底；加载顺序 core → `highcharts-more` → `funnel` → `streamgraph` → `variable-pie`，其中 `variable-pie` 仅依赖 core、可放末尾）：

```javascript
const hcMoreTag = libTag(
  new URL("./node_modules/highcharts/highcharts-more.js", import.meta.url),
  "Highcharts",
  [
    "https://cdn.jsdelivr.net/npm/highcharts@12/highcharts-more.js",
    "https://unpkg.com/highcharts@12/highcharts-more.js",
    "https://registry.npmmirror.com/highcharts/12.6.0/files/highcharts-more.js",
  ],
);
const hcFunnelTag = libTag(
  new URL("./node_modules/highcharts/modules/funnel.js", import.meta.url),
  "Highcharts",
  [
    "https://cdn.jsdelivr.net/npm/highcharts@12/modules/funnel.js",
    "https://unpkg.com/highcharts@12/modules/funnel.js",
    "https://registry.npmmirror.com/highcharts/12.6.0/files/modules/funnel.js",
  ],
);
const hcStreamgraphTag = libTag(
  new URL("./node_modules/highcharts/modules/streamgraph.js", import.meta.url),
  "Highcharts",
  [
    "https://cdn.jsdelivr.net/npm/highcharts@12/modules/streamgraph.js",
    "https://unpkg.com/highcharts@12/modules/streamgraph.js",
    "https://registry.npmmirror.com/highcharts/12.6.0/files/modules/streamgraph.js",
  ],
);
const hcVariablePieTag = libTag(
  new URL("./node_modules/highcharts/modules/variable-pie.js", import.meta.url),
  "Highcharts",
  [
    "https://cdn.jsdelivr.net/npm/highcharts@12/modules/variable-pie.js",
    "https://unpkg.com/highcharts@12/modules/variable-pie.js",
    "https://registry.npmmirror.com/highcharts/12.6.0/files/modules/variable-pie.js",
  ],
);
```

(2) HTML 模板里 `${highchartsTag}` 之后插入 `${hcMoreTag}\n${hcFunnelTag}\n${hcStreamgraphTag}\n${hcVariablePieTag}`（保持 core → more → funnel → streamgraph → variable-pie 的加载顺序）。沙箱内重新生成离线页前，把 `D:\work\aichart\.verify\libs\modules\{highcharts-more.js,funnel.js,streamgraph.js,variable-pie.js}` 复制到 `examples/dual-demo/node_modules/highcharts/{highcharts-more.js,modules/…}`（模块文件现已在 `.verify/libs/modules` 实测可用）。

(3) 渲染循环支持用例自带数据（否则 funnel/pyramid/gauge/radar 等在只有 month/region/revenue 的共享 `rows` 上画不出语义）：把

```javascript
for (const { label, spec } of CASES) {
  const hc = buildHighcharts(rows, spec);
  const ec = buildECharts(rows, spec);
```

改为

```javascript
for (const { label, spec, data = rows } of CASES) {
  const hc = buildHighcharts(data, spec);
  const ec = buildECharts(data, spec);
```

(4) `CASES` 末尾追加 9 项：

```javascript
  // ── B2 ──────────────────────────────────────────────────────────────
  {
    label: "Lollipop — monthly revenue by region",
    spec: {
      schema_version: 1,
      chart: { type: "lollipop", title: "Monthly revenue by region" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["month", "region"],
          measures: [{ field: "revenue", agg: "sum", as: "monthly_revenue" }],
        }],
      },
      encodings: {
        x: { field: "month", value_type: "categorical" },
        y: { field: "monthly_revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Waterfall — profit build-up",
    data: [
      { stage: "Gross revenue", amount: 1000 },
      { stage: "COGS", amount: -400 },
      { stage: "Opex", amount: -200 },
      { stage: "Tax", amount: -80 },
      { stage: "Net profit", amount: 320 },
    ],
    spec: {
      schema_version: 1,
      chart: { type: "waterfall", title: "Net profit build-up" },
      encodings: {
        x: { field: "stage", value_type: "categorical" },
        y: { field: "amount", value_type: "numeric" },
      },
    },
  },
  {
    label: "Funnel — conversion stages",
    data: [
      { stage: "Visits", users: 1200 },
      { stage: "Signups", users: 600 },
      { stage: "Activated", users: 300 },
      { stage: "Paid", users: 120 },
      { stage: "Renewed", users: 60 },
    ],
    spec: {
      schema_version: 1,
      chart: { type: "funnel", title: "Conversion funnel" },
      encodings: {
        x: { field: "stage", value_type: "categorical" },
        y: { field: "users", value_type: "numeric" },
      },
    },
  },
  {
    label: "Pyramid — population by age band and gender",
    data: [
      { age: "0-9", gender: "Male", population: 40 },
      { age: "0-9", gender: "Female", population: 35 },
      { age: "10-19", gender: "Male", population: 30 },
      { age: "10-19", gender: "Female", population: 25 },
      { age: "20-29", gender: "Male", population: 20 },
      { age: "20-29", gender: "Female", population: 15 },
    ],
    spec: {
      schema_version: 1,
      chart: { type: "pyramid", title: "Population pyramid" },
      encodings: {
        x: { field: "age", value_type: "categorical" },
        y: { field: "population", value_type: "numeric" },
        series: { field: "gender" },
      },
    },
  },
  {
    label: "Gauge — average monthly revenue",
    spec: {
      schema_version: 1,
      chart: { type: "gauge", title: "Avg monthly revenue" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          measures: [{ field: "revenue", agg: "avg", as: "avg_revenue" }],
        }],
      },
      encodings: {
        y: { field: "avg_revenue", value_type: "numeric" },
      },
    },
  },
  {
    label: "Streamgraph — revenue streams by region",
    spec: {
      schema_version: 1,
      chart: { type: "streamgraph", title: "Revenue streams by region" },
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
    label: "Boxplot — score distribution by group",
    data: [
      { group: "A", score: 2 }, { group: "A", score: 3 }, { group: "A", score: 4 },
      { group: "A", score: 5 }, { group: "A", score: 6 }, { group: "A", score: 9 },
      { group: "B", score: 10 }, { group: "B", score: 11 }, { group: "B", score: 12 },
      { group: "B", score: 13 }, { group: "B", score: 14 },
    ],
    spec: {
      schema_version: 1,
      chart: { type: "boxplot", title: "Score distribution by group" },
      encodings: {
        x: { field: "group", value_type: "categorical" },
        y: { field: "score", value_type: "numeric" },
      },
    },
  },
  {
    label: "Rose — monthly revenue",
    spec: {
      schema_version: 1,
      chart: { type: "rose", title: "Monthly revenue rose" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["month"],
          measures: [{ field: "revenue", agg: "sum", as: "monthly_revenue" }],
        }],
      },
      encodings: {
        x: { field: "month", value_type: "categorical" },
        y: { field: "monthly_revenue", value_type: "numeric" },
      },
    },
  },
  {
    label: "Radar — product capability",
    data: [
      { product: "A", attribute: "speed", score: 80 }, { product: "A", attribute: "range", score: 70 },
      { product: "A", attribute: "price", score: 60 }, { product: "A", attribute: "size", score: 50 },
      { product: "B", attribute: "speed", score: 60 }, { product: "B", attribute: "range", score: 90 },
      { product: "B", attribute: "price", score: 40 }, { product: "B", attribute: "size", score: 80 },
    ],
    spec: {
      schema_version: 1,
      chart: { type: "radar", title: "Product capability radar" },
      encodings: {
        x: { field: "attribute", value_type: "categorical" },
        y: { field: "score", value_type: "numeric" },
        series: { field: "product" },
      },
    },
  },
```

（共享 `rows` 只有 month/region/revenue 时，funnel/pyramid/gauge/waterfall/boxplot/radar 用各自的 `data`；`data` 字段缺失的用例默认用 `rows`。9 个用例 spec 的 `encodings` 均满足 Task 8 扩展后的 `REQUIRED_CHANNELS`——gauge 只有 `y`，其余均有 `x`+`y`，series 可选——`buildHighcharts`/`buildECharts` 入口先过校验器，不会误抛。）

> 注（函数型 options 在离线页的局限）：`offline.mjs` 用 `JSON.stringify` 内联 HC options（offline.mjs:283–284），**函数值会被丢弃**——HC 模板里 pyramid x 轴的 abs-label formatter、streamgraph 的槽位→类目名 formatter 都是函数（见 Task 5/6 模板），生成页面中这两处轴刻度会退回原始数值/序号。仅演示页局限，后端产物不受影响；如需在页面上回映可读标签，后续可在生成前对 options 做轻量预处理（不在 B2 范围）。

- [ ] **Step 2: 沙箱语法检查**

Run: `node --check examples/dual-demo/offline.mjs`
Expected: 无输出。

- [ ] **Step 3: 修订 INTEGRATION 模块对照表（B2 版）+ 补 `_requiredModules` 契约**

`docs/INTEGRATION.md`：

(1) 附录 C 的契约表（第 156–166 行）在 `_warnings` 行之后插两行：

```markdown
| `_requiredModules` | 渲染前必须加载的 Highcharts 模块（npm 包内相对路径，如 `highcharts/highcharts-more.js`）；**数组即加载顺序**，必须按序 require/<script>；复合模板（lollipop / pyramid）无此键 |
| `series[].type` | B2 起不再恒等于 `chart.type`：复合模板含多种 series 类型（如 lollipop = `column` 茎 + `scatter` 点） |
```

(2) **在既有「已验证模块表」上修订，而不是重写**：`docs/INTEGRATION.md` 现（HEAD `73cdd65`）已有「Highcharts 模块对照表（已发布 B1 + 规划 B2/B3）」段（第 184–202 行），rose/histogram 行已实测（variablepie、histogram/bellcurve）。把该段 184–202 行整体替换为：

```markdown
### Highcharts 模块对照表（已发布 B1 + B2；规划 B3）

> B1 的 6 个新图型连同 bar/line/pie/scatter/area 共 11 种；B2 新增 9 种（lollipop / waterfall /
> funnel / pyramid / gauge / streamgraph / boxplot / rose / radar）。下表全部为**已发布**图型的实际
> 模块需求（`buildHighcharts` 输出的 `_requiredModules` 是权威来源）；histogram（B3）仍为规划。

| 图型 | 需加载的模块 |
|---|---|
| groupedBar / stackedBar / donut / slope / connectedScatter / strip | 无（核心包即可） |
| lollipop | 无（复合模板：`column` 茎 + `scatter` 圆点，核心包即可；原生 `lollipop` 系列需 more→dumbbell→lollipop 链，本实现不用） |
| waterfall / boxplot / gauge | `highcharts/highcharts-more.js` |
| funnel | `highcharts/modules/funnel.js` |
| pyramid | 无（复合模板：两条横向 `bar` 镜像，核心包即可；原生 `pyramid` 是三角漏斗，语义不符） |
| streamgraph | `highcharts/modules/streamgraph.js` |
| rose | `highcharts/modules/variable-pie.js`（`variablepie`，本地 12.6.0 实测注册） |
| radar | `highcharts/highcharts-more.js`（polar 支持随该模块） |
| histogram（B3） | **后端分箱（推荐，双端同算法，无需模块）**；备选 `highcharts/modules/histogram-bellcurve.js`（实测注册 `histogram`+`bellcurve`；B3 不用 `bellcurve`） |

> 上表全部行均在 Highcharts 12.6.0 下实测（加载模块后断言 `Highcharts.seriesTypes.<name>`）。
> **`_requiredModules`（`buildHighcharts` 输出，见附录 C）数组即加载顺序**；本表各行只需 0–1 个模块，
> 按「core → highcharts-more → funnel → streamgraph → variable-pie」加载即可覆盖全部行。原生 lollipop
> 链（more→dumbbell→lollipop）真实存在：只加载 `lollipop.js` 抛 `Cannot read properties of undefined
> (reading 'prototype')`——本实现不用该链，表内也不再承诺它。
```

(3) 修正 `docs/INTEGRATION.md` 附录 B FAQ「支持哪些图型？」一句，改为 20 种图型清单（当前为 11 种文案）。
(4) `vendor/flint-chart/packages/flint-js/src/highcharts/README.md`：核对既有范围/series 说明与本表及 `_requiredModules` 契约一致（README 暂无模块表则无需新增，仅保持 cross-reference 一致）。

- [ ] **Step 4: 提交**

```bash
git add examples/dual-demo/offline.mjs docs/INTEGRATION.md
git commit -m "docs: B2 模块机制（_requiredModules 有序加载）+ 模块对照表修订（取代 B1 旧链承诺）+ 对比页 9 图型"
```

---

### Task 11: B2 批次验收

- [ ] **Step 1: 沙箱全量验证**

Run: V1 → V2 → V3（期望 20 passed, 0 failed）→ V4 → V5（期望 `files=56 passed=1135 failed=0` + ✅）→ V6（37 passed）→ **V7**（期望 `✅ 5 处白名单一致（20 种）`）→ V8（期望 SDK suite 在 44 基线基础上 +5 it = 49 passed；其中 funnel/gauge 转换用例需用户重建 dist 后才绿，沙箱内以「44 + 校验器 3 例」为界）→ 模块注册探针（Task 0 Step 6 的 `b2-check-modules.cjs`，期望 11 个 `✓` + ✅）→ V9 留到 Step 3（依赖该步重新生成的 20 用例页面）
Expected: 全部通过。

- [ ] **Step 2: 请用户跑全部权威测试**

```powershell
cd D:\work\aichart\ChartBrain\vendor\flint-chart\packages\flint-js; npm run build; npm test
cd D:\work\aichart\ChartBrain\sdk; npm run typecheck; npm test
cd D:\work\aichart\ChartBrain\server; .\.venv\Scripts\python -m pytest -q
node D:\work\aichart\ChartBrain\scripts\check-chart-types.mjs
```

Expected: vendor 全绿（56 files / ≥1135 tests，新增用例全过）；sdk typecheck 无输出、npm test 全绿（44 基线 + 5 = 49 passed）；server 37 passed；check-chart-types `✅ 5 处白名单一致（20 种）`。

- [ ] **Step 3: 生成对比页并目测（重点核对本批形态差异）**

```powershell
cd D:\work\aichart\ChartBrain\examples\dual-demo
node offline.mjs
start dual-offline.html
```

重新生成页面后先跑静态渲染门禁（Step 1 的 V9 依赖本步产出的 20 用例页面）：

Run: `node D:\work\aichart\.verify\check-html-options.cjs`
Expected: Highcharts.chart / echarts 各 20 次全部 ok、`external CDN refs: 0`、`✅ every case renders through both backends`（页面内嵌 HC options 的函数型 `labels.formatter` 会被 JSON.stringify 丢弃——见 Task 10 注——V9 只断言每例能渲染与点数>0，不校验该格式化文本）。

人工核对 20 组用例左右两侧；B2 新增 9 组重点核对：
1. Lollipop 茎/点是否对齐类目、圆点颜色是否按 region 区分；
2. Waterfall 首柱锚零、末柱（复述总额）与 EC 端同高、增/减色一致；
3. Funnel 自上而下递减且与 EC 数值一致；
4. Pyramid 左右镜像、年龄段与数值与 EC 端镜像一致；
5. Gauge 单表盘均值一致；
6. Streamgraph 各流形状/数值与 EC 端一致；
7. Boxplot 箱须五数与离群点形态接近 EC；
8. Rose 是否等角 nightingale 且各扇区面积随值、与 EC 极坐标 bar 观感接近（HC `variablepie` 半径/面积内部换算以文档为准，离线无法实测渲染——若明显不一致按风险表回退）；
9. Radar 形状差异（HC 单一径向尺度 vs EC 按指标归一）是否在可接受范围。

- [ ] **Step 4: 打标签 / 记录**

```bash
git add -A
git commit -m "chore: B2 验收通过（20 图型双端一致）" || echo "无待提交内容"
```

---

## 验收标准（B2 定义完成）

1. **模板**：9 个 HC 模板全部注册（`hcGetTemplateDef` 可查），`hcAllTemplateDefs` 含 20 个图型名；每个模板只做「语义 → options」翻译，不重复判定字段类型、不缺必要通道时留下半成品（早退守卫）。
2. **模块（有序契约 + 真实注册）**：`hcRequiredModules` 返回与 INTEGRATION 表一致，**数组语义 = 加载顺序**；需要模块的模板在输出上携带 `_requiredModules`；复合模板（lollipop/pyramid）不携带；库不含任何 HC 运行时 import。沙箱探针（Task 0 Step 6）用真实 12.6.0 bundle 断言：`highcharts-more` → `waterfall/boxplot/gauge/arearange` 注册 + Chart.prototype 出现 polar/radial 成员（radar）；`funnel.js` → `funnel/pyramid`；`streamgraph.js` → `streamgraph`；`variable-pie.js` → `variablepie`；`histogram-bellcurve.js` → `histogram`/`bellcurve`（B3 预留）。
3. **双端一致**：`scripts/chart-parity.mjs` 20 行全绿（含 B2 九行的逐类型 `check`）；每个 B2 用例的 HC/EC series 类型、逐点数值（或经自定义断言映射后的数值）一致。
4. **契约五处同步 + 校验器 + 守卫**：schema enum、`sdk/src/types.ts`、两个 adapter 的 `FLINT_CHART_TYPE`/通道映射全部含 9 个新图型；`HighchartsOption` 有 `_requiredModules` 可选字段；`sdk/src/converter/validate.ts` 的 `REQUIRED_CHANNELS` 覆盖 9 个新图型（gauge 仅 `y`，其余 `x`+`y`，`series` 一律可选）；`node scripts\check-chart-types.mjs` 输出 `✅ 5 处白名单一致（20 种）`。
5. **prompt**：白名单规则 1 与 schema enum 集合相等（守卫测试断言）；19 条 few-shot（既有 10 + 新增 9）全部过 L1。
6. **权威测试全绿**（用户执行）：vendor `npm run build && npm test`；sdk `npm run typecheck && npm test`（44 基线 +5 = 49 passed）；server `pytest` 37 passed。
7. **示例与文档**：`offline.mjs` 生成的对比页覆盖 20 个图型、模块按序内联/兜底，左右两侧都能渲染；`docs/INTEGRATION.md` 模块表（修订既有已验证表：lollipop/pyramid 复合零模块、rose = 实测 `variablepie`、histogram 行注明 B3 决策）与 `_requiredModules` 契约更新。
8. **回滚**：每 Task 独立提交；契约与模板同批提交（spec 放行但后端无模板 = `Unknown … chart type` 报错；白名单五处 + `REQUIRED_CHANNELS` 不同步会被 `check-chart-types`/校验器测试拦下）。

## 风险与回退

| 风险 | 级别 | 缓解 / 回退 |
|---|---|---|
| HC 原生 `waterfall` 的 `isSum`（无 y 点画到「当前累计」）与 EC `end`（`top=cumulative[i-1]`）在个别边界（如负数对账）视觉偏差 | 中 | parity 已断言增量序列与 isSum 位置；若目测发现对账边界不对，回退为把 `end` 行按普通增量 `y=复述值` 渲染并接受一个全柱差异，或该数据形状改用 `chartProperties.totals` 显式覆盖 |
| HC radar 单一径向尺度 vs EC 按指标归一：量纲差异大的指标在 HC 会内收 | 中 | 已声明为接受差异并在演示页核对；若不可接受，回退方案 = HC 端对每指标除以其 niceMax 后乘全局 max（即自绘归一化），并在 tooltip 显示原始值（B2 后补丁，不动 spec） |
| HC radar 不填充（极坐标 line）vs EC 默认填充（`filled` 默认 true、fillOpacity 0.3） | 低 | 已声明：无填充在多层多边形叠加时更清晰；若需贴近 EC，把 radar 系列 type 改为 `area` 并设 `fillOpacity: 0.3`（数据与 parity 断言不变，仅观感；B2 后补丁） |
| HC rose（`variablepie`）半径/面积内部换算未离线实测（等角 y=1 + z=原始值是否与 EC sqrt 半径面积编码观感一致） | 中 | parity 按 name→原始值比对（与半径换算无关）；Task 11 目测核对；若观感不可接受，回退为 EC 同编码：把 `z` 改传 `sqrt(value)`（面积 ∝ 值不变）或整体改回「极坐标 column + 线性半径」并在 parity/文档同步 |
| Boxplot 离群点视觉：EC 额外 custom 点系列 vs HC 原生 `outliers` | 低 | parity 只比对 box 五数；若离群点观感不一致，HC 端把 `outliers` 列表也输出为独立 scatter overlay（与茎/点复合同构），并更新 parity 检查 |
| `lollipop`/`pyramid` 复合模板在 HC 端与「原生系列」的 hover/图例行为不同（茎不可 hover、无每点图例） | 低 | 已知取舍（EC 端同为复合）；若 hover 必须，把茎也开 `enableMouseTracking: true` 并按点着色 |
| 消费端按 B1 旧 INTEGRATION 表（原生 lollipop 3 模块链、rose 链承诺）加载，与 B2 实现不一致 | 低 | Task 10 整体重写模块表并加说明（lollipop 复合/零模块；rose 用实测的 `variablepie`）；`_requiredModules` 为准 |
| 模块链加载顺序错误导致难以定位的 TypeError（如只载 `lollipop.js`：`Cannot read properties of undefined (reading 'prototype')`） | 低 | B2 全部类型 0–1 个模块、无链式依赖；契约把数组定义为「加载顺序」；文档注明只载部分链的失败形态 |
| Rose ≤0 度量在 HC `variablepie` 的表现与预期不符（钳 0 后是否仍保留等角槽位） | 低 | 设计上双端统一钳 0（镜像 EC sqrt(max(0,·))）；parity 夹具用正值；若目测发现负值/零值扇区异常，在风险表中记录并补一个负值夹具决策 |
| 沙箱无法重建 vendor `dist/`，SDK 行为用例要等用户 `npm run build` | 中 | 行为验证只依赖 V1–V9 中适用项 + parity（对 `.tmp-build`）；SDK 新图型转换用例权威执行放到 Task 8/11 的用户步骤 |
| `.verify/run-all-vendor-tests.cjs` 退出码受既有 excel-runtime 异步 rejection 影响（≠0） | 低 | 以 `failed=0` + ✅ 行为绿；权威 = 用户 `npm test` |
| 若最终某图型在用户真实浏览器目测仍无法对齐 | 中 | 单 Task 独立提交可单独 revert；契约白名单与对应模板同批回滚 |

---

## 自审记录

- **spec 覆盖**：设计 §2.2 的 B2 九项 → Task 1–7（逐图型模板 + parity 翻转）；§4 契约五处 + `REQUIRED_CHANNELS` 校验器 + `check-chart-types.mjs` 守卫 → Task 8 + Task 9；§6 验收 → Task 0/11 + 演示/文档 Task 10；模块机制 → Task 0 + INTEGRATION；`docs/more-chart-types-design.md` 附录 B 的 rose/pyramid/radar 形态差异 → 裁决表与风险表显式声明。
- **占位符扫描**：所有 Step 均含真实代码与精确命令；few-shot 九条全部逐字给出；无 TBD/TODO。
- **类型一致性**：图型字符串在 HC 注册 / EC 注册 / `FLINT_CHART_TYPE` / parity CASES / INTEGRATION 中逐字一致（`Boxplot`、`Streamgraph` 无 Chart 后缀）；`hcRequiredModules` 键与注册名一一对应；SDK `ChartType` 新值与 schema enum 完全同序；`check(hc, ec)` 命名与既有 parity 用例一致。
- **验证命令均沙箱实测（HEAD `73cdd65`）**：V1/V2/V4 exit 0；V3 基线 11 passed；V5 基线 `files=56 passed=1122`；V6 基线 37 passed；V7 基线 `✅ 5 处白名单一致（11 种）`；V8 基线 44 passed；V9 基线 11/11 ok——文中「期望值」均从这些基线外推。模块注册探针命令（Task 0 Step 6）按真实 bundle 实测的加载 recipe（`window` 桩 + `core.default || core` + `require(mod)(HC)`）书写；断言项（waterfall/boxplot/gauge/arearange/funnel/pyramid/streamgraph/variablepie/histogram/bellcurve/polar 成员）与维护者提供的新探针证据逐项一致（含 lollipop 三模块链的依赖与失败形态、`variable-pie.js` 与 `histogram-bellcurve.js` 的实测注册）。Rose 按证据改用原生 `variablepie`（等角 + z=原始值、≤0 钳 0；此前「模块未下载/无网络」前提已失效），Histogram 前瞻决策备忘随附。V5 不再需要移开 heatmap-colors.test.ts：编译改用 `.verify` 下带 `vega-lite` paths 映射的 sidecar tsconfig（CJS 产物 + ESM preload stub）。

<!-- B2-PLAN-END -->

