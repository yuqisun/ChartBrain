# ChartBrain 设计文档

> 状态：基线 v0.1（2026-09-05）· 本文档记录需求对齐结论、系统设计、中性 spec 草案、约束原则与路线图，作为后续开发的单一事实来源。

---

## 1. 背景与目标

### 1.1 问题

消费端服务（业务服务）目前各自用 **Highcharts 或 ECharts** 渲染图表，开发模式是「一个需求 → 开发一个图表 → 上线」。同一份数据（如金融数据）上用户的分析诉求多样且随时变化，固定图表无法满足「随时随地用自然语言按需要图」的需求。

### 1.2 ChartBrain 是什么

独立于业务服务的**图表智能中间件**，由三部分组成：

1. **chartbrain-server**（Python / FastAPI）：接收消费端的自然语言 + 所用库声明 + 列 schema/样例，让 LLM 产出**轻量中性 chart spec + 声明式变换计划**，做 L1/L2 校验后返回——**无状态、不产库配置**（D13）。
2. **@chartbrain/sdk**（TypeScript）：在**消费端本地**完成全部确定性步骤（D13）——执行声明式变换计划 → 由**确定性转换器**把中性 spec 转成目标库配置（Highcharts / ECharts 均经 vendored flint-js，D15/D12）→ 把真实数据绑定进配置。
3. 消费端接入后，用**自己现有的图表库**渲染。

### 1.3 非目标（守住边界）

- 不做 BI 平台 / 看板 / 数据接入（不做 text-to-SQL）。
- 不做图表库本身（不碰 UI 渲染）。
- 不做通用数据分析 agent，只做「自然语言 → 一张图表」这件事，且做深做稳。

---

## 2. 决策记录（已对齐）

| 编号 | 决策 | 结论 |
|---|---|---|
| D1 | 命名 | 产品名 **ChartBrain**；本地目录 `viz-ai`；GitHub 仓库 `yuqisun/ChartBrain` |
| D2 | 消费端语言 | Node.js / TypeScript |
| D3 | 服务端技术栈 | Python / FastAPI |
| D4 | LLM | 可插拔、多 Provider（OpenAI / Claude / DeepSeek 等；BYOK 双轨待定） |
| D5 | LLM 输出 | 轻量中性 spec + 声明式变换计划（**不是**目标库配置，**不是**代码/SQL） |
| D6 | 图表能力知识 | 内置在确定性转换器（代码），而非让 LLM 背库 schema |
| D7 | 变换执行位置 | 消费端本地，由 @chartbrain/sdk 确定性执行 |
| D8 | 数据与隐私 | 服务端只见列 schema + 少量样例；全量数据只在消费端 |
| D9 | 校验策略 | spec 做窄 + 三层校验（L1/L2/L3）+ 单轮修复 |
| D10 | 交付形态（远期） | 提供 REST 与 MCP 两种消费通道 |
| D11 | 落地顺序 | **首版单库落地 Highcharts**（转换器先行实现），ECharts 作为后续里程碑（M5）；D5 中性 spec 保持库无关，Highcharts 方言只进转换器 |
| D12 | Flint 定位（Spike 结论，2026-09，读源码验证） | 微软 Flint（MIT，0.5.x，TS 库）**不作服务端引擎**：汇编要求 `data.values` 在场（`core/types.ts`），且 flint-py 未发布、仅 Vega-Lite 后端。**可作消费端 SDK 内的汇编引擎**：M5 的 ECharts 后端候选 = SDK 内调 flint-js `assembleECharts`（数据先由我们的变换运行时预聚合再喂入，Flint 对预聚合表不做重复聚合，`vegalite/assemble.ts` 已注明）。Highcharts 无后端（现有：VL/ECharts/Chart.js/Plotly/Excel）→ 转换器自研（D11）。声明式 filter / min / max / median 等超出 Flint 输入面（encoding 级 aggregate 仅 count/sum/average/mean）→ 变换 DSL 自研 |
| D13 | 转换器执行位置（2026-09 定） | **确定性转换器随 @chartbrain/sdk 以 TS 发布、在消费端本地执行**（与 D12 对称，双库一致）；server 只做 LLM + L1/L2 校验 + 返回 spec/变换计划（无状态、不见数据）；变换、转换、绑定、L3 冒烟等全部确定性步骤在 SDK 完成 |
| D14 | 能力扩展（2026-09 定，分批） | **P1**：`binTime`（date 按月/季/年分桶）+ `derive`（**二元+常量**四则，复杂公式用两步 derive 链）；**P2**：`percent`（countPercent，分母按 SQL 窗口语义：global/filtered/group/partition[fields]）+ `growth`（环比 mom / 同比 yoy，按 time_field 有序、partition 分区；首期/无前值→**null**，不补 0）。占比/增长率数值一律存 **0~1**，`%` 格式化归消费端/SDK 显示层。表达式与窗口细节见 §4.4 |
| D15 | Highcharts 后端（2026-09 定，**取代 D11 的「转换器自研」**） | Highcharts 配置不再手写：**vendor flint-js（上游 0.5.1）到 `vendor/flint-chart/`，并在其中新增 `src/highcharts/` 后端**，与 ECharts 后端共用同一套编译器管线（语义 / 布局 / 主题）。理由：上游 `flint-chart/core` 未导出后端所需的内部函数（`applyAggregation` / `decideColorMaps` / `normalizeChartProperties` 等），且 `exports` 无通配符，深路径导入被封装 → vendor 后可 `import '../core/...'` 直接复用。上游**不追踪**（见 `vendor/flint-chart/FORK.md`）；SDK 经 `file:` 依赖消费。v1 覆盖 bar/line/area/scatter/pie，不支持 facet 与 chart-type 变换 |

---

## 3. 架构

### 3.1 组件图

```
┌────────────────────────────────────────────────────────────┐
│ chartbrain-server (Python/FastAPI)  无状态（D13）           │
│                                                            │
│  API 层                                                     │
│   ├─ POST /v1/charts         自然语言 → spec + 变换计划      │
│   └─ POST /v1/validate       （远期）仅校验 spec/变换计划     │
│                                                            │
│  LLM Provider 抽象层（D4）                                   │
│   ├─ OpenAI / Claude / DeepSeek / Ollama …                  │
│   └─ 结构化输出 → 中性 spec（受约束 schema）                  │
│                                                            │
│  Validator（D9）                                            │
│   ├─ L1 JSON Schema（结构/enum）                             │
│   └─ L2 字段引用命中真实列 schema（白名单）                   │
└───────────────┬────────────────────────────────────────────┘
                │ {request_id, chart_spec, transform_plan, …}
                ▼
┌────────────────────────────────────────────────────────────┐
│ @chartbrain/sdk (TypeScript, 消费端本地) — 确定性步骤全在这   │
│  ① Transform runtime：执行 transform_plan（D7）             │
│      filter / aggregate / sort / limit …（闭集算子）         │
│  ② Converter（D13）：neutral spec → 库配置                  │
│      highcharts（vendored flint-js 后端，D15） / echarts（经 flint-js，D12） │
│  ③ Data binder：把结果数据绑定进库配置的 series              │
│  ④ L3 冒烟（可选）：golden / 可渲染自检                     │
└───────────────┬────────────────────────────────────────────┘
                ▼
    消费端用自己现有图表库渲染（Highcharts / ECharts）
```

### 3.2 职责边界

| 关注点 | 归属 | 原因 |
|---|---|---|
| 「画什么图、怎么变换」的决策 | LLM（受约束） | 语义理解只能靠 LLM |
| 「怎么把 spec 变成库配置」 | SDK 内确定性转换器（D13） | 库 schema 繁琐易错，LLM 直出会静默出错；库知识以 TS 随 SDK 发布 |
| 「数据变换的实际执行」 | SDK（确定性） | 全量数据在消费端、结果可测试可复现 |
| 「字段是否合法」 | L2 校验（对照真实列 schema） | 权限与正确性在执行期强制（原则 5） |
| 数值/统计计算 | 确定性代码 | LLM 永不碰数值（原则 1） |

### 3.3 一次请求的完整时序

1. 消费端收集：`query`（自然语言）+ `library`（`highcharts` / `echarts`）+ `columns`（列 schema + 类型）+ `data_sample`（≤N 行样例，可脱敏）。
2. 调用 `POST /v1/charts`。
3. 服务端：组装受控上下文（列 schema 指纹 + 库能力声明 + 少量 NL→spec 范例）→ LLM 结构化输出中性 spec + 变换计划 → L1/L2 校验（L3 冒烟移到 SDK，D13）。
4. 返回 `{ request_id, chart_spec, transform_plan, warnings }`。
5. 消费端 `@chartbrain/sdk`（全部确定性步骤，D13）：执行 `transform_plan`（本地全量数据）→ 确定性转换器产出目标库配置（Highcharts / ECharts 均经 vendored flint-js）→ 数据绑定 →（可选）L3 冒烟 → 交给自己的 Highcharts/ECharts 渲染。

---

## 4. 中性 chart spec（草案 v0.1）

> 定位：**LLM 的输出契约、库无关的中间表示**。约束：窄 schema、可枚举一律 enum、`additionalProperties: false`、字段只准引用「原始列或前序变换产出的列」。

### 4.1 顶层结构

```jsonc
{
  "schema_version": 1,
  "chart": {
    "type": "line",          // enum 白名单：bar|line|pie|scatter|area（MVP，先按 Highcharts 五种图型落地，D11）
    "title": "月度营收趋势"    // 可选
  },
  "transform_plan": {        // 可选；缺省 = 直接用原始数据（不过变换）
    "steps": [               // 顺序执行，前一步输出是后一步输入
      { "op": "filter",   "field": "region", "operator": "in", "values": ["华东", "华南"] },
      { "op": "aggregate", "group_by": ["month"],
        "measures": [{ "field": "revenue", "agg": "sum", "as": "monthly_revenue" }] },
      { "op": "sort",     "by": "month", "order": "asc" },
      { "op": "limit",    "n": 12 }
    ]
  },
  "encodings": {             // 引用「变换后」的列名（无 transform 则引用原始列）
    "x":  { "field": "month",           "value_type": "categorical" },
    "y":  { "field": "monthly_revenue", "value_type": "numeric" },
    "series": { "field": "region" }     // 可选：多系列拆分字段
  }
}
```

### 4.2 变换算子闭集（MVP）

| op | 字段 | 说明 |
|---|---|---|
| `filter` | `field`, `operator`(enum: eq/neq/gt/gte/lt/lte/between/in/contains), `value`/`values` | 行级过滤 |
| `aggregate` | `group_by[]`, `measures[]`(field + agg + as) | 分组聚合，产出新列 |
| `sort` | `by`, `order`(asc/desc) | 排序 |
| `limit` | `n` | 截断行数 |
| （远期）| `topN` / `bin`(直方图) / `derive`(派生列，需公式校验) / `pivot` | 按需扩展 |

聚合函数 enum：`sum | avg | count | countDistinct | min | max`（MVP 先做前五个，median 视需要）。

### 4.3 为什么这样设计（调研支撑）

- **窄 spec / enum 优先 / 禁 anyOf 宽 union**：Chat2Vis 证明 LLM 直出配置/代码不稳定；Vega-Lite schema 校验通过 ≠ 可渲染（宽 schema 形同虚设）。→ 见 `research/nl-to-chart-spec-survey.md`。
- **变换入 spec 一等公民**：chart-llm（CHI'24）证明 filter/aggregate/bin 应作为标注维度；这是相对 Flint 公开叙事可差异化的点。
- **产物可序列化、可 diff、可版本化**：学 Evidence「一切皆文本」——spec + 变换计划是可审计工件。

---

## 4.4 扩展算子草案（D14，P1 实现中 / P2 规划）

**P1：`derive`（二元+常量，复杂公式用两步链）与 `binTime`**

```jsonc
{ "op": "binTime", "field": "date", "granularity": "month", "as": "month" } // month|quarter|year

// (revenue - cost) / revenue 需要两步：
{ "op": "derive", "as": "gross", "left": { "field": "revenue" },
  "operator": "subtract", "right": { "field": "cost" } }
{ "op": "derive", "as": "margin", "left": { "field": "gross" },
  "operator": "divide", "right": { "field": "revenue" } }
```

- operand = `{ "field": 列 }` 或 `{ "value": 数字常量 }`；operator ∈ add/subtract/multiply/divide；
- derive/binTime **保留整表并新增一列**（不像 aggregate 会丢弃列）；derive 输出列一律 number；
- 除零、缺失 operand → **null**（不抛错不臆造）；binTime 输出 `2026-01` / `2026-Q1` / `2026` 形式标签（string）。

**P2（规划，语义已用具体用例锁定在 `docs/P2-window-semantics.md`，待确认后实现）：`percent` 与 `growth`**

```jsonc
// 每个 region 内各 product 的数量占比（分母 = region 分区和，结果 0~1）
{ "op": "percent", "field": "n", "denominator": { "partition": ["region"] }, "as": "region_pct" }

// 环比（按月、按 region 各自比上期；首期→null）
{ "op": "growth", "measure": "revenue", "time_field": "month",
  "period": "mom", "partition": ["region"], "as": "mom_growth" }   // mom|yoy
```

- denominator 四口径（SQL 窗口语义）：`global`（整表）/ `filtered`（过滤后表）/ `group`（当前 group_by 分组）/ `partition[fields]`；
- growth 的 L2 前置校验：时间列有序且每桶恰一行（聚合后无重复桶）；缺前值/缺期 → null。

---

## 5. 校验策略（D9）

| 层 | 校验什么 | 手段 |
|---|---|---|
| L1 | 结构合法（类型、enum、必填、无多余字段） | JSON Schema + `additionalProperties:false` |
| L2 | 字段引用命中真实列、类型匹配（numeric 列不做 group_by 等） | 对照消费端上报的 `columns` 做**白名单**校验 |
| L3 | 确定性转换器能产出**合法且可渲染**的库配置 | SDK 内转换器冒烟（D13）+（远期）渲染比对快照 |

修复回路：**只允许一轮** `validate → repair（把结构化错误回喂 LLM）→ revalidate`，超出一轮即报错返回，由消费端引导用户改述（原则：歧义/失败时澄清而非硬答）。

---

## 6. API 草案

### `POST /v1/charts`

```jsonc
// 请求
{
  "query": "按月份看营收趋势，顺便看看哪个区域贡献最大",
  "library": "highcharts",            // enum: highcharts | echarts
  "columns": [                        // 真实列 schema（L2 校验的权威来源）
    { "name": "month",   "type": "string" },
    { "name": "revenue", "type": "number" },
    { "name": "region",  "type": "string" },
    { "name": "date",    "type": "date" }
  ],
  "data_sample": [ /* ≤50 行真实样例，可选，用于帮助 LLM 理解取值分布 */ ],
  "constraints": {                    // 可选：消费端声明的执行期约束
    "allowed_fields": ["month", "revenue", "region"],
    "allowed_aggs": ["sum", "avg", "count"],
    "max_transform_rows": 100000
  }
}

// 响应 200（库配置由 SDK 生成，D13；chart_spec 内含 transform_plan）
{
  "request_id": "cb_…",
  "library": "highcharts",
  "chart_spec": { /* 4.1 的中性 spec */ },
  "warnings": [ "month 被当作分类轴处理（可指定 date 粒度）" ]
}
// 消费端 @chartbrain/sdk：执行变换 → 转换（Highcharts / ECharts 均经 vendored flint-js）→ 绑定数据 → 渲染

// 响应 422（校验失败） / 409（歧义，需澄清）
```

### 关于数据与隐私（D8）

- 服务端**只**需要 `columns` + 少量 `data_sample`，用于 L2 校验与 LLM 理解上下文；
- 全量真实数据**不离开消费端**，变换、转换、绑定全部由 SDK 本地执行（D13）；
- 若个别场景确实需要服务端看更多数据（如复杂关联分析），作为显式 opt-in 选项，逐请求声明。

---

## 7. 约束与安全原则（红线）

1. LLM **不产出**代码 / SQL / 目标库全量配置；**不执行**任何计算。
2. 服务端不接收、不存储、不记录全量业务数据（默认）；样例数据可配置脱敏。
3. 字段权限与过滤在**执行期**（SDK / 服务端白名单）强制，绝不依赖提示词约束。
4. 每请求状态隔离，不做跨会话隐式状态（防 Superset PR #38827 类泄漏）。
5. 防滥用：single-shot + 受控上下文 + prompt 缓存；用量限额与审计从第一天设计。
6. spec/变换计划是**可审计工件**：完整记录 NL → spec → 库配置 → 渲染 链路，支持回看/回滚。

---

## 8. 调研沉淀 → 设计映射

### 8.1 借鉴清单（详见 `../ChartBrain_调研汇总报告.md`）

| 来源 | 借鉴点 |
|---|---|
| Microsoft Flint | 语义级 spec + 确定性多后端编译；LLM 从「画图工」降级为「意图表达者」 |
| VisActor/VMind | pipeline 分层（抽取→推断→推荐→spec→主题）；BYOK/托管双轨 |
| glyph | 受控算子闭集 + byte-stable（可 diff、可 golden 测试） |
| Metabase | 语义对象做「喂 LLM 的 repr」；权限双层执行 |
| Lightdash | 变换计划白名单 scope；合法语法固化为结构化知识 |
| Evidence | spec 工件可序列化、可 diff、可 review |
| ChartMimic | 渲染比对回归测试 |
| 商业产品共性 | schema 声明收敛可答域；结果可回读可确认；数据面/LLM 面分离 |

### 8.2 避坑清单（红线来源）

| 行业事故 | 我们的对策 |
|---|---|
| Vanna.ai CVE-2024-5565（LLM 生成代码→exec→RCE） | LLM 永不产出代码/SQL（原则 1） |
| LIDA 自采样摘要丢精度 | 变换在真实数据上由 SDK 确定性执行 |
| echarts-mcp 直出库配置、Lightdash 被 ECharts 方言绑住 | 中性 spec + adapter 隔离（D5/D6） |
| 宽 schema 校验形同虚设 | spec 做窄 + L1/L2/L3（D9） |
| text-to-SQL 权限绕过、demo 能跑生产不行 | 不做 text-to-SQL（§1.3） |
| AntV npm 供应链投毒（GMS-2026-75）、包名重名 | 锁版本 + 镜像 + 审计；注册自有 npm 命名空间 |
| 竞品同名/改名（chartgpt、daVinci-LLM） | 监控以 repo URL + commit 时间为准 |

### 8.3 竞品跟踪（Flint 定位已由 D12 决定）

- **Microsoft Flint**（`microsoft/flint-chart`，MIT，0.5.x，月更）是本项目最近的参照与潜在竞品。D12 已定：不作服务端引擎；**作为消费端 SDK 内的可选汇编引擎**（M5 ECharts 后端候选，顺带获得其语义/主题/布局能力）；「接受 Flint input 作为 ChartBrain spec 的兼容输入方言」保留为远期互操作方向。
- **D13（已定）转换器随 SDK 执行**：D12 使 ECharts 汇编落在 SDK 内（需要本地数据）；为保持 Highcharts/ECharts 双库对称，Highcharts 转换器同样随 @chartbrain/sdk 以 TS 发布并在消费端执行。server 只负责 LLM + L1/L2 校验 + 返回 spec/变换计划（无状态、不见数据）；变换、转换、绑定、L3 冒烟等全部确定性步骤在 SDK 完成。

---

## 9. 路线图（里程碑）

| 里程碑 | 交付物 | 验收标准 |
|---|---|---|
| M1 骨架 ✅（2026-09-05）| 仓库结构、FastAPI 服务、Provider 抽象（mock/openai-compat）、`POST /v1/charts` 占位、spec JSON Schema v0.1 | `uvicorn` 起服务 + pytest 12 passed + curl 通 |
| M2 核心生成 ✅（2026-09-05）| Prompt 产出中性 spec + 变换计划；结构化输出 + L1/L2 校验 + 单轮修复；spec 质量基线（转换器随 SDK 在 M3，D13） | DeepSeek 实测基线：可表达用例 8/8、边界用例诚实拒绝 2/2 |
| M3 SDK ✅（2026-09-05）| @chartbrain/sdk：变换算子闭集执行 + **Highcharts 转换器**（随 SDK 发布执行，D13）；与 spec schema 共享类型 | typecheck + build 通过、vitest 17 passed |
| M4 端到端 ✅（2026-09-05）| Node 消费端 demo（金融数据 48 行，**Highcharts**，`examples/highcharts-demo`） | 自然语言跑通「问 → 图」：bar/area 两种问题均出图 |
| M4b 工程质量 ✅（2026-09-05）| GitHub Actions CI（server pytest + sdk typecheck/build/vitest）；LLM 超时/重试/错误分类（provider→503）/请求审计日志 | CI 绿；加固单测通过 |
| M5 双库化 ✅（2026-09-05）| **ECharts 后端 = SDK 内 flint-js `assembleECharts`**（D12 兑现）+ `buildECharts`；`examples/dual-demo` 同 spec 双库并排渲染 | 同一 spec 双库输出一致：5 图型（SDK 22 passed）+ 双库渲染实测一致（bar/area） |
| P1 能力扩展 ✅（2026-09-05，D14）| `binTime`（月/季/年分桶）+ `derive`（二元+常量四则，两步链）实现 | 35 server + 27 sdk passed；eval 10/10 + 边界 2/2（含 net/quarterly 新用例） |
| P2 能力扩展（规划，D14）| `percent`（4 窗口口径）+ `growth`（mom/yoy，null 缺期） | 语义用例锁死 → 实现 → eval |
| M6 扩展 | 更多图型、MCP 交付、自纠错回路、渲染比对回归评测 | 回归管线可跑 |

---

## 10. 开放问题（待讨论）

1. spec 里 `month` 这类时间字段的粒度推断（自动 vs 显式）放哪一层？
2. `derive` 派生列（如算环比）要不要进 MVP？公式如何受控校验？
3. SDK 的变换算子是用纯 TS 实现，还是引入 DuckDB-WASM 等运行时？（影响能力上限与体积）
4. LLM Provider 的 BYOK / 托管双轨模式何时定？
5. 多轮「改图」会话（viz-gpt 式状态协议）是否列入 M5 之后？
