# ChartBrain

> 面向业务服务的「自然语言 → 图表」智能中间件：让任何用 **Highcharts / ECharts** 的消费端服务，
> 都能让用户用自然语言**按需**生成图表，而不是「一个需求开发一个图表」。
> **库无关、业务无关、数据不出域。**

## 它解决什么问题

消费端服务（业务服务，各自用 Highcharts 或 ECharts 渲染图表）目前的模式是：
**用户提一个需求 → 开发者写死一个图表 → 上线**。但同一份数据（比如金融数据）上，用户的
分析诉求多样且随时变化——ChartBrain 把「图表智能」从业务服务解耦出来，做成**独立服务 + 消费端
SDK**，供多个消费端复用。

## 架构（一句话）

```
server（Python，无状态）       SDK（TS，在消费端）          消费端
NL + schema + 样例 ──→ LLM 产出 中性 spec + 变换计划 ──→ 变换执行 + 转换 + 绑定 ──→ Highcharts / ECharts 渲染
                     （L1/L2 校验）                    （全部确定性步骤，D13）
```

- **LLM 只做「意图表达」**：输出受约束的**库无关中性 spec**（图型白名单 + 编码 + 声明式变换计划），
  不写代码/SQL、不产库配置、不碰计算；
- **全部确定性步骤在消费端 SDK**：声明式变换执行（filter/aggregate/sort/limit）→ 中性 spec → 库配置
  （Highcharts 转换器自研 / ECharts 经 [flint-js](https://github.com/microsoft/flint-chart)）→ 数据绑定；
- **数据不出域**：全量真实数据只在消费端，服务端只见列 schema + 少量样例。

## 消费端三步接入（Highcharts 示例）

**① 发自然语言给 server**（server 返回库无关的中性 spec，`chart_spec` 内含 `transform_plan`）：

```bash
curl -X POST http://127.0.0.1:8000/v1/charts \
  -H "Content-Type: application/json" \
  -d '{"query":"各区域营收对比，按营收从高到低","library":"highcharts",
       "columns":[{"name":"month","type":"string"},{"name":"region","type":"string"},{"name":"revenue","type":"number"}],
       "data_sample":[{"month":"2026-01","region":"华东","revenue":1200}]}'
```

**② 接入 `@chartbrain/sdk`，变换 + 转换一步完成**（你的全量数据本地执行）：

```ts
import { buildHighcharts } from "@chartbrain/sdk";

const resp = await fetch(`${SERVER}/v1/charts`, { /* 请求见上 */ });
const { chart_spec } = await resp.json();
const option = buildHighcharts(yourFullData, chart_spec); // 数据不出域
```

**③ 用你现有的 Highcharts 渲染**：

```ts
Highcharts.chart("container", option);
```

用 ECharts 只差一步：把 `buildHighcharts` 换成 `buildECharts`（SDK 内部经 flint-js 编译），
**同一份 spec 双库输出一致**——可运行 `examples/dual-demo` 亲眼对比。

> 现成可跑的例子：`examples/highcharts-demo`（单库）与 `examples/dual-demo`（同 spec 双库并排）。

## 本地开发

**server**（Python 3.11+，DeepSeek/OpenAI 兼容 key 放 `server/.env`，模板见 `server/.env.example`）：

```bash
cd server
python -m venv .venv && .\.venv\Scripts\pip install -e ".[dev]"
.\.venv\Scripts\python -m pytest -q        # 31 tests
.\.venv\Scripts\uvicorn chartbrain_server.main:app --port 8000
```

**sdk**（Node 18+）：

```bash
cd sdk
npm install
npm run typecheck && npm run build && npm test   # 22 tests
```

**双库对比 demo**：

```bash
cd examples/dual-demo && npm i && node demo.mjs "每月营收面积图"
# 打开生成的 dual-chart.html
```

CI（GitHub Actions）：push/PR 自动跑 server pytest + sdk typecheck/build/vitest。

## 仓库结构

```
viz-ai/
├── specs/chart-spec.schema.json   # 中性 spec JSON Schema（契约源，双端共享）
├── server/                        # chartbrain-server（Python/FastAPI，无状态意图层）
│   ├── chartbrain_server/
│   │   ├── api/        # POST /v1/charts（L1/L2 校验、错误分类、审计日志）
│   │   ├── llm/        # Provider 抽象：mock / openai-compatible（DeepSeek 等）
│   │   └── spec/       # prompt 编排、生成管线、L2 校验
│   ├── scripts/eval_spec_baseline.py   # spec 质量基线评测
│   └── tests/                          # 31 tests
├── sdk/                             # @chartbrain/sdk（TypeScript，确定性执行层）
│   └── src/  transform.ts（变换运行时）· converter/highcharts.ts · converter/echarts.ts（flint-js）
├── examples/
│   ├── highcharts-demo/            # 单库端到端 demo
│   └── dual-demo/                  # 同一 spec → Highcharts + ECharts 并排
├── docs/design.md                  # 设计文档：决策记录 D1–D13 + spec 草案 + 路线图
├── research/                       # 竞品调研分报告
├── ChartBrain_调研汇总报告.md        # 调研结论（可借鉴点 / 不足 / 避坑）
├── .github/workflows/ci.yml
├── CONTRIBUTING.md
└── LICENSE
```

## 设计原则（来自竞品调研沉淀）

1. LLM 只做「意图表达」：不碰数值计算，不产出代码 / SQL / 库配置；
2. 中性 spec + 确定性转换器 = 库无关（库知识是代码，随 SDK 发布执行）；
3. spec 做窄：可枚举一律 enum、`additionalProperties:false`、字段引用命中真实列；
4. 三层校验 + 单轮修复：L1 schema → L2 字段/类型/白名单 → L3 渲染冒烟（SDK 内）；
5. 权限在「执行期」强制；数据不出域；
6. 不做 text-to-SQL、不做「LLM 生成代码再 exec」（Vanna.ai CVE-2024-5565 教训）；
7. 能力边界外诚实拒绝（占比/环比等 → 要求澄清），绝不硬凑错误 spec。

## 路线图

- **M1 骨架 ✅** · **M2 核心生成 ✅**（DeepSeek 基线 8/8 + 诚实拒绝 2/2）· **M3 SDK ✅**
- **M4 端到端 ✅**（NL→spec→SDK→Highcharts 出图）· **M4b 工程质量 ✅**（CI + LLM 韧性 + 审计）
- **M5 双库化 ✅**（同一 spec → Highcharts / ECharts 并排渲染一致）
- **P1 能力扩展 ✅（2026-09-05，D14）**：`binTime`（date 按月/季/年分桶）+ `derive`（二元+常量四则，两步链）；35 server + 27 sdk tests，eval 10/10 + 边界 2/2
- 前瞻：`percent`（占比，4 窗口口径）与 `growth`（环比/同比）（P2，D14）、渲染比对回归、`/v1/validate`、MCP 交付、多轮改图

## 竞品定位

微软 2026-07 开源的 [Flint](https://github.com/microsoft/flint-chart) 与我们的路线最接近
（中性 spec + 确定性编译），但 **「库无关中性 spec + Highcharts/ECharts 确定性转换 +
声明式数据变换 + 消费端 SDK 执行」的完整组合目前是行业空位**（见调研报告）。Flint 已被吸收为
ECharts 后端的编译引擎（D12）。

## 文档

- [docs/INTEGRATION.md](docs/INTEGRATION.md) —— Highcharts 消费端接入指南（完整步骤 + 代码）
- [docs/design.md](docs/design.md) —— 完整设计（决策记录 D1–D13、spec 草案、路线图）
- `ChartBrain_调研汇总报告.md` —— 调研结论总览
- `research/` —— 各主题详细调研与来源 URL

## 许可

[MIT](LICENSE) © 2026 Yuqi Sun
