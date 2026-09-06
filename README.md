# ChartBrain

> 面向业务服务的「自然语言 → 图表」智能中间件：让任何用 Highcharts / ECharts 的消费端服务，都能让用户用自然语言**按需**生成图表，而不是「一个需求开发一个图表」。

## 它解决什么问题

消费端服务（业务服务，各自用 Highcharts 或 ECharts 渲染图表）目前的模式是：
**用户提一个需求 → 开发者写死一个图表 → 上线**。但同一份数据（比如金融数据）上，用户的分析诉求是多样且随时变化的，这种模式无法满足用户随时随地、临时起意地要各种图表来分析。

ChartBrain 把这些「图表智能」从业务服务里解耦出来，做成一个**库无关、业务无关**的独立服务 + 消费端 SDK，供多个消费端复用。

## 怎么工作

```
用户自然语言问题
        │
        ▼
┌──────────────────────────────────────────────┐
│ 消费端服务（Node/TS，用 Highcharts 或 ECharts）│
│ 发送：自然语言 + 所用库声明 + 列 schema/样例数据 │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│ ChartBrain 服务端（Python / FastAPI）· 无状态 │
│ ① LLM（可插拔多 Provider）理解问题             │
│    产出「轻量中性 spec + 声明式变换计划」       │
│ ② L1/L2 校验 → 返回 spec/变换计划（D13）      │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│ chartbrain-sdk（TypeScript）· 确定性步骤全在这│
│ ① 本地执行声明式变换计划（groupBy/aggregate/   │
│    filter/sort…）                             │
│ ② 转换：中性 spec → 库配置                    │
│    （Highcharts 自研 / ECharts 经 flint-js）  │
│ ③ 数据绑定 → 交给自己的图表库渲染              │
└──────────────────┬───────────────────────────┘
                   ▼
        消费端用自己的图表库渲染，呈现给用户
```

- **「怎么算」**（变换逻辑）由 LLM 以声明式计划产出；
- **「去算」**（变换执行 + spec→库配置转换，D13）由 SDK 在消费端本地确定性执行，全量数据不出业务域；
- **「怎么渲染」** 留在消费端自己的图表库，ChartBrain 不碰 UI。

## 设计原则（来自竞品调研沉淀）

1. **LLM 只做「意图表达」，不碰数值计算，不产出代码/SQL/库配置** —— 只输出受约束的中性 spec。
2. **中性 spec + 确定性转换器 = 库无关**：库知识是代码（转换器，随 SDK 在消费端执行，D13），不是让 LLM 背 schema。
3. **spec 做窄**：可枚举的一律 enum、`additionalProperties: false`；字段引用必须命中真实列 schema。
4. **三层校验 + 单轮修复**：L1 schema → L2 字段命中真实列 → L3 渲染冒烟；只允许一轮 validate→repair→revalidate。
5. **权限在「执行期」强制，不在「提示词期」**；服务端只见 schema + 少量样例。
6. **不做 text-to-SQL，不做「LLM 生成代码再 exec」**（Vanna.ai CVE-2024-5565 的教训）。

## 组件

| 组件 | 语言 | 职责 | 计划里程碑 |
|---|---|---|---|
| `server/`（chartbrain-server） | Python / FastAPI | API、LLM Provider 抽象、spec 生成 + L1/L2 校验（无状态，不产库配置，D13） | M1 / M2 |
| `sdk/`（@chartbrain/sdk） | TypeScript | 变换执行 + 确定性转换（Highcharts 自研 / ECharts 经 flint-js，D12）+ 数据绑定 | M3 |
| `examples/` | Node/TS | 消费端接入 demo（Highcharts / ECharts） | M4 |
| `specs/` | JSON Schema | 中性 spec / 变换计划的契约定义 | M2 |

## 仓库结构

```
viz-ai/
├── README.md
├── docs/
│   └── design.md            # 详细设计文档（决策记录、spec 草案、路线图）
├── research/                # 竞品调研分报告（LLM 图表框架 / 开源 BI / 商业产品）
├── ChartBrain_调研汇总报告.md # 调研汇总：可借鉴点 + 竞品不足 + 避坑清单
├── .gitignore
└── (server/ sdk/ examples/ specs/ 待建)
```

## 路线图

- **M1 骨架 ✅（2026-09-05）**：`server/` FastAPI + LLM Provider 抽象（mock/openai-compat）+ `/v1/charts` 占位；`specs/chart-spec.schema.json` v0.1；pytest 12 passed。
- **M2 核心生成 ✅（2026-09-05）**：Prompt 工程产出中性 spec + 结构化输出 + L1/L2 校验与单轮修复；DeepSeek 基线可表达 8/8、边界诚实拒绝 2/2（Highcharts 转换器随 SDK 在 M3，D13）。
- **M3 SDK ✅（2026-09-05）**：`@chartbrain/sdk` 变换算子执行 + Highcharts 转换器（D13）+ 数据绑定；typecheck/build 通过，vitest 17 passed。
- **M4 端到端 ✅（2026-09-05）**：`examples/highcharts-demo` 消费端 demo（48 行金融数据）——自然语言 → DeepSeek spec → SDK 变换/转换 → Highcharts 出图（bar/area 实测通过）。
- **M5 双库化**：ECharts 后端（候选：SDK 内复用 flint-js `assembleECharts`，见 design.md D12）+ ECharts demo。
- **M6 扩展**：更多图表类型、MCP 交付、自纠错回路、评测/回归管线（渲染比对）。

## 竞品定位（一句话）

微软 2026-07 开源的 Flint 与我们的路线最接近（中性 spec + 确定性编译），但**「库无关中性 spec + Highcharts/ECharts 确定性转换器 + 声明式数据变换 + 消费端 SDK 执行」的完整组合目前是行业空位**——详见 `docs/design.md` 与调研报告。

## 文档

- [docs/design.md](docs/design.md) —— 完整设计（决策记录、架构、spec 草案、约束与避坑）
- `ChartBrain_调研汇总报告.md` —— 调研结论总览
- `research/` —— 各主题详细调研与来源 URL
