# ChartBrain 设计文档

> 状态：基线 v0.1（2026-09-05）· 本文档记录需求对齐结论、系统设计、中性 spec 草案、约束原则与路线图，作为后续开发的单一事实来源。

---

## 1. 背景与目标

### 1.1 问题

消费端服务（业务服务）目前各自用 **Highcharts 或 ECharts** 渲染图表，开发模式是「一个需求 → 开发一个图表 → 上线」。同一份数据（如金融数据）上用户的分析诉求多样且随时变化，固定图表无法满足「随时随地用自然语言按需要图」的需求。

### 1.2 ChartBrain 是什么

独立于业务服务的**图表智能中间件**，由三部分组成：

1. **chartbrain-server**（Python / FastAPI）：接收消费端的自然语言 + 所用库声明 + 列 schema/样例，让 LLM 产出**轻量中性 chart spec + 声明式变换计划**，再由内置的**确定性转换器**转成目标库（Highcharts / ECharts）配置。
2. **@chartbrain/sdk**（TypeScript）：在**消费端本地**执行声明式变换计划，把真实数据绑定进图表配置。
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

---

## 3. 架构

### 3.1 组件图

```
┌────────────────────────────────────────────────────────────┐
│ chartbrain-server (Python/FastAPI)                         │
│                                                            │
│  API 层                                                     │
│   ├─ POST /v1/charts         自然语言 → spec + 库配置        │
│   └─ POST /v1/validate       （远期）仅校验 spec/变换计划     │
│                                                            │
│  LLM Provider 抽象层（D4）                                   │
│   ├─ OpenAI / Claude / DeepSeek / Ollama …                  │
│   └─ 结构化输出 → 中性 spec（受约束 schema）                  │
│                                                            │
│  Validator（D9）                                            │
│   ├─ L1 JSON Schema（结构/enum）                             │
│   ├─ L2 字段引用命中真实列 schema                             │
│   └─ L3 渲染冒烟（确定性转换器能产出合法配置）                  │
│                                                            │
│  Converter registry（D6）— 确定性代码                         │
│   ├─ neutral-spec → highcharts option                       │
│   └─ neutral-spec → echarts option                          │
└───────────────┬────────────────────────────────────────────┘
                │ {chart_spec, chart_config, …}
                ▼
┌────────────────────────────────────────────────────────────┐
│ @chartbrain/sdk (TypeScript, 消费端本地)                    │
│  ① Transform runtime：执行 transform_plan（D7）             │
│      filter / aggregate / sort / limit …（闭集算子）         │
│  ② Data binder：把结果数据绑定进 chart_config 的 series      │
└───────────────┬────────────────────────────────────────────┘
                ▼
    消费端用自己现有图表库渲染（Highcharts / ECharts）
```

### 3.2 职责边界

| 关注点 | 归属 | 原因 |
|---|---|---|
| 「画什么图、怎么变换」的决策 | LLM（受约束） | 语义理解只能靠 LLM |
| 「怎么把 spec 变成库配置」 | 确定性转换器 | 库 schema 繁琐易错，LLM 直出会静默出错 |
| 「数据变换的实际执行」 | SDK（确定性） | 全量数据在消费端、结果可测试可复现 |
| 「字段是否合法」 | L2 校验（对照真实列 schema） | 权限与正确性在执行期强制（原则 5） |
| 数值/统计计算 | 确定性代码 | LLM 永不碰数值（原则 1） |

### 3.3 一次请求的完整时序

1. 消费端收集：`query`（自然语言）+ `library`（`highcharts` / `echarts`）+ `columns`（列 schema + 类型）+ `data_sample`（≤N 行样例，可脱敏）。
2. 调用 `POST /v1/charts`。
3. 服务端：组装受控上下文（列 schema 指纹 + 库能力声明 + 少量 NL→spec 范例）→ LLM 结构化输出中性 spec + 变换计划 → L1/L2/L3 校验 → 确定性转换器产出 `chart_config`。
4. 返回 `{ request_id, chart_spec, chart_config, warnings }`。
5. 消费端 `@chartbrain/sdk`：执行 `transform_plan`（在本地全量数据上）→ 数据绑定进 `chart_config` → 交给自己的 Highcharts/ECharts 渲染。

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

## 5. 校验策略（D9）

| 层 | 校验什么 | 手段 |
|---|---|---|
| L1 | 结构合法（类型、enum、必填、无多余字段） | JSON Schema + `additionalProperties:false` |
| L2 | 字段引用命中真实列、类型匹配（numeric 列不做 group_by 等） | 对照消费端上报的 `columns` 做**白名单**校验 |
| L3 | 确定性转换器能产出**合法且可渲染**的库配置 | 转换器冒烟 + （远期）渲染比对快照 |

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

// 响应 200
{
  "request_id": "cb_…",
  "library": "highcharts",
  "chart_spec": { /* 4.1 的中性 spec */ },
  "chart_config": { /* 目标库配置；series 数据为占位引用，待 SDK 绑定 */ },
  "warnings": [ "month 被当作分类轴处理（可指定 date 粒度）" ]
}

// 响应 422（校验失败） / 409（歧义，需澄清）
```

### 关于数据与隐私（D8）

- 服务端**只**需要 `columns` + 少量 `data_sample`，用于 L2 校验与 LLM 理解上下文；
- 全量真实数据**不离开消费端**，由 SDK 本地执行变换；
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
- 推论（待确认，涉及转换器运行位置）：D12 使 ECharts 汇编落在 SDK 内（需要本地数据），为保持 Highcharts/ECharts 双库对称，Highcharts 转换器同样随 SDK 发布并执行更一致——server 只负责 LLM + 校验 + 返回 spec/变换计划，所有确定性步骤（变换 + 转换 + 绑定）在消费端 SDK 完成。

---

## 9. 路线图（里程碑）

| 里程碑 | 交付物 | 验收标准 |
|---|---|---|
| M1 骨架 | 仓库结构、FastAPI 服务、Provider 抽象（先接一个）、`POST /v1/charts` 空实现、spec JSON Schema | `uvicorn` 起服务，curl 通 |
| M2 核心生成（Highcharts 先行，D11） | Prompt 产出中性 spec + 变换计划；L1/L2 校验；**Highcharts 转换器**（bar/line/pie/scatter/area） | 固定数据集的 NL→配置正确率基线 |
| M3 SDK | TS SDK：变换算子闭集执行 + **Highcharts** 数据绑定；与 spec schema 共享类型 | 单元测试覆盖每个算子 |
| M4 端到端 | Node 消费端 demo（金融数据，**Highcharts**） | 自然语言跑通「问 → 图」 |
| M5 双库化 | **ECharts 后端（候选：SDK 内调 flint-js `assembleECharts`，数据预聚合后喂入，D12）** + ECharts demo | 同一 spec 双库输出一致 |
| M6 扩展 | 更多图型、MCP 交付、自纠错回路、渲染比对回归评测 | 回归管线可跑 |

---

## 10. 开放问题（待讨论）

1. spec 里 `month` 这类时间字段的粒度推断（自动 vs 显式）放哪一层？
2. `derive` 派生列（如算环比）要不要进 MVP？公式如何受控校验？
3. SDK 的变换算子是用纯 TS 实现，还是引入 DuckDB-WASM 等运行时？（影响能力上限与体积）
4. LLM Provider 的 BYOK / 托管双轨模式何时定？
5. 多轮「改图」会话（viz-gpt 式状态协议）是否列入 M5 之后？
