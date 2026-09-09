# ChartBrain 接入指南（Highcharts 消费端）

> 面向"已经在用 Highcharts / ECharts 的业务服务"如何接入 ChartBrain。
> 原则：**只增加"自然语言 → 图表配置"能力，不迁移、不替换现有渲染与数据。**
> 全程只发列 schema + 少量样例给 server，**全量数据不出域**（D8/D13）。

## 总体架构（回顾）

```
用户提问 → 你的后端(代理) ──POST /v1/charts──→ chartbrain-server
            │  query + library + columns + data_sample      │ LLM 产出中性 spec + 变换计划
            │                                               │ L1/L2 校验后返回（无状态）
            │ ◄────────── { request_id, chart_spec, warnings }
            │ @chartbrain/sdk：buildHighcharts(rows, chart_spec)
            │   变换执行 + spec→Highcharts 转换 + 数据绑定（本地确定性执行）
            ▼
     你现有的 Highcharts 渲染
```

## 阶段 0 · 三个决策

| 决策 | 建议 |
|---|---|
| Server 部署 | 自部署 chartbrain-server（`pip install` + uvicorn；部署形态可按团队基建扩展），消费端只认一个 `SERVER_URL` |
| 谁调 server | **经你的后端代理调用**：LLM key/审计留在服务端，浏览器不直连；后端可叠加你自己的鉴权 |
| SDK 跑在哪 | 数据在哪就在哪跑：Node 后端持有全量数据 → SDK 在后端跑，把 option 给前端；数据在浏览器 → SDK 在浏览器跑 |

## 阶段 1 · 确认 server 可用

```bash
curl http://<SERVER_URL>/health
# {"status":"ok","service":"chartbrain-server","version":"0.1.0"}

curl -X POST http://<SERVER_URL>/v1/charts -H "Content-Type: application/json" \
  -d '{"query":"各区域营收对比，按营收从高到低","library":"highcharts",
       "columns":[{"name":"month","type":"string"},{"name":"region","type":"string"},
                  {"name":"revenue","type":"number"}],
       "data_sample":[{"month":"2026-01","region":"华东","revenue":1200}]}'
# 200 + chart_spec（含 transform_plan）；见附录错误对照
```

## 阶段 2 · 接入 SDK 并封装 askForChart

```bash
# @chartbrain/sdk 尚未发 npm，先用本地引用（发布后改回 npm 安装）
npm i file:D:/workspace/Python/viz-ai/sdk
```

后端服务函数（替代"每个图表需求写死一个接口"）：

```ts
import { buildHighcharts } from "@chartbrain/sdk";

const SERVER = process.env.CHARTBRAIN_SERVER!; // 你的部署地址

type Row = Record<string, unknown>;

// columns：优先用你数据模型的真实 schema；没有则从首行推断
function inferColumns(rows: Row[]) {
  const first = rows[0] ?? {};
  const typeOf = (v: unknown) =>
    typeof v === "number" ? "number"
    : v instanceof Date || /^\d{4}-\d{2}(-\d{2})?$/.test(String(v)) ? "date"
    : "string";
  return Object.keys(first).map((name) => ({ name, type: typeOf(first[name]) }));
}

export async function askForChart(
  query: string,
  rows: Row[],
  opts?: { allowedFields?: string[]; allowedAggs?: string[] },
) {
  const resp = await fetch(`${SERVER}/v1/charts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      library: "highcharts",
      columns: inferColumns(rows),
      data_sample: rows.slice(0, 10), // 只发样例，全量不出域
      constraints: {
        allowed_fields: opts?.allowedFields ?? [],
        allowed_aggs: opts?.allowedAggs ?? [],
      },
    }),
  });
  const body = await resp.json();

  if (resp.status === 422) {
    return { kind: "needMoreInfo", errors: body.errors, requestId: body.request_id };
  }
  if (resp.status === 503) {
    return { kind: "providerDown", detail: body.detail, requestId: body.request_id };
  }
  // 200：确定性步骤全部本地完成（D13）
  const option = buildHighcharts(rows, body.chart_spec);
  return { kind: "ok", option, spec: body.chart_spec, requestId: body.request_id };
}
```

## 阶段 3 · 前端渲染与 UX

现有 Highcharts 组件加一个分支即可：

```ts
const res = await askForChart(query, rows);
if (res.kind === "ok") {
  Highcharts.chart("container", res.option);   // 或 chart.update(res.option)
} else if (res.kind === "needMoreInfo") {
  showHint(res.errors);                          // 澄清/超能力边界：给用户可读提示
} else {
  showToast("服务暂时不可用，请稍后重试");          // 503：可自动重试一次
}
```

UX 建议：输入框 + 常用问题建议（见 `examples/dual-demo/QUESTIONS.md`）、加载/错误/空态、
可选"回读确认"（把 spec 摘要展示给用户确认后再渲染）。

## 阶段 4 · 治理与安全

- **权限白名单**：`constraints.allowed_fields / allowed_aggs` 对接数据权限（无权限的列/聚合直接禁掉，执行期强制，绝不只靠提示词）；
- **样例脱敏**：`data_sample` 只发少量样例，敏感值可打码/换假值；
- **审计**：记录 `request_id` + query + 返回的 `chart_spec`（可序列化工件，天然可回看/回滚）；
- **监控**：server 已输出 start/ok/fail 审计日志（含耗时与 `error_kind`）。

## 阶段 5 · 验收

1. 跑通 `examples/dual-demo/QUESTIONS.md` 的 8 条"可表达"问题 + 2 条"边界"问题（验证诚实拒绝）；
2. 用真实问题清单跑 `server/scripts/eval_spec_baseline.py`（需 DeepSeek key），看通过率基线；
3. 上线后收集真实 query 与 422 案例，定期回流到 few-shot。

## 附录 A · /v1/charts 状态码对照

| 状态码 | `error_kind` | 含义 | 消费端处理 |
|---|---|---|---|
| 200 | — | 生成成功，返回 `chart_spec` | `buildHighcharts(rows, spec)` 后渲染 |
| 422 | `clarification` | LLM 认为需要澄清（歧义/字段缺失/超能力边界） | 展示 `errors` 引导用户改述 |
| 422 | `validation` | spec 未通过 L1/L2（修复一轮后仍失败） | 同上；属小概率，可反馈给维护方 |
| 422 | —（请求模型校验） | query/columns/library 不合法 | 前端表单校验兜底 |
| 503 | `provider` | LLM Provider 故障（网络/认证/超时/5xx） | 提示稍后重试（可自动重试一次） |

错误响应体：`{ detail, error_kind?, errors?, repair_rounds?, request_id }`。

## 附录 B · 常见问题

- **数据会发给谁？** server 只收 `columns` + `data_sample`（样例可脱敏）；全量真实数据只在你的进程里被 SDK 处理。
- **支持哪些图型？** 当前 11 种：bar/line/pie/scatter/area + groupedBar/stackedBar/donut/slope/connectedScatter/strip（含多系列拆分）。超出会诚实拒绝而非硬凑。
- **"占比/环比"这类诉求怎么办？** 当前会 422 澄清；属于未来 `derive` 派生列能力（路线图前瞻）。
- **成本？** 每次查询 = 1 次 LLM 调用（+1 次失败修复调用）。server 已内置超时/重试与错误分类。
- **多轮改图？** 当前一次一问一图；多轮会话（"把柱状图换成折线"）属路线图前瞻项。

## 附录 C · `buildHighcharts` 输出结构（消费端可依赖的契约）

自 D15 起 Highcharts 配置由 vendored flint-js 编译器产出（不再是手写映射）。稳定部分：

> ⚠️ **缺通道会抛错，而不是产出坏配置**：`buildHighcharts` / `buildECharts`（经
> `toHighcharts` / `toECharts`）在进入后端编译前先做必需通道校验
> （`sdk/src/converter/validate.ts`）。11 种图型都要求 `encodings.x` 与 `encodings.y` 在场——
> pie/donut 中 x=分类（映射颜色）、y=数值（映射大小），其余图型即坐标轴两通道；
> `encodings.series` 对所有图型都可选（有则分组/堆叠，无则单系列；pie/donut 多传 series 会被
> 忽略，不改变输出）。缺失时抛 `Error`，消息形如 `groupedBar 需要 x 与 y 通道，缺少: y`，
> 消费端应捕获并提示用户（改述/反馈），不要渲染空图。校验只看通道存在性、不看数据：
> 0 行数据 + 通道齐全的 spec 正常返回空系列配置，不抛错。

| 键 | 含义 |
|---|---|
| `chart.type` | `column` / `bar` / `line` / `area` / `scatter` / `pie`（`bar` = 水平柱） |
| `chart.width` / `chart.height` | 布局决策推导的画布尺寸（含标题/图例/轴标题留白） |
| `title.text` | 来自中性 spec 的 `chart.title`；`title.style.fontSize` 由布局决定 |
| `xAxis` / `yAxis` | 分类轴带 `categories`；时间轴 `type: 'datetime'`（数据为 `[epochMs, y]` 点对）；数值轴 `type: 'linear'` |
| `yAxis.min` | 仅在「要求零基线且无负值」时设为 0；有负值时交给 Highcharts |
| `series[]` | `type` 与 `chart.type` 一致；`data` 为数值数组（分类轴）或 `[x, y]` 点对（数值/时间轴）；多系列带 `name` / `color` |
| `series[].pointWidth` | 柱状图像素宽度（step × (1 − padding) 推导） |
| `tooltip` / `legend` / `colors` | 由布局与配色决策填充 |
| `_warnings` | 溢出截断等提示 `{severity, code, message, channel?, field?}`，可直接展示 |

> ⚠️ **行为变更**：temporal x 现在是 `datetime` 轴（此前手写转换器用分类轴 + `categories`）。
> 若你依赖 `xAxis.categories`，请改为读 `series[].data` 的 `[x, y]` 点对。

> ⚠️ **重复 (x, series) 行不在契约内**：Highcharts 折线族对重复 x 求和、ECharts 分类轴
> （line/slope）为 last-wins，两端语义不同，不要依赖任何「重复 x」行为。请在
> `transform_plan` 里先用 `aggregate` 预聚合，保证每个 (x, series) 恰好一行后再交付渲染。

### Highcharts 模块对照表（已发布 B1 + 规划 B2/B3）

> 首行为 B1 新增的 6 个图型——连同 bar/line/pie/scatter/area，共 11 种**已发布**，均只需
> 核心包；以下 B2/B3 行均为**规划中、未发布**的图型，模块需求仅供预研，勿按已上线加载。

| 图型 | 需加载的模块 |
|---|---|
| groupedBar / stackedBar / donut / slope / connectedScatter / strip | 无（核心包即可） |
| lollipop（B2） | **`highcharts/highcharts-more.js` → `highcharts/modules/dumbbell.js` → `highcharts/modules/lollipop.js`（顺序不能颠倒）** |
| waterfall / boxplot / gauge（B2） | `highcharts/highcharts-more.js` |
| funnel / pyramid（B2） | `highcharts/modules/funnel.js` |
| streamgraph（B2） | `highcharts/modules/streamgraph.js` |
| rose（B2） | `highcharts/modules/variable-pie.js`（实测注册 `variablepie` series） |
| radar（B2） | `highcharts/highcharts-more.js`（polar 支持随该模块） |
| histogram（B3） | `highcharts/modules/histogram-bellcurve.js`（实测注册 `histogram` + `bellcurve` 原生 series，B3 可直接用原生模块；或后端分箱，无需模块） |

> 上表全部行均在 Highcharts 12.6.0 下实测：加载模块后断言 `Highcharts.seriesTypes.<name>`。
> 注意 `lollipop.js` 依赖 `dumbbell.js`，而 `dumbbell.js` 又依赖 `highcharts-more.js` 提供的 `arearange`；
> 只加载 `lollipop.js` 会抛出 `Cannot read properties of undefined (reading 'prototype')` 这类难以定位的错误。

## 参考

- 现成可跑示例：`examples/highcharts-demo`（单库）、`examples/dual-demo`（同 spec 双库，`offline.mjs` 为离线版）
- 架构与决策：`docs/design.md`（D1–D15）、`specs/chart-spec.schema.json`
- Highcharts 后端实现与限制：`vendor/flint-chart/packages/flint-js/src/highcharts/README.md`、`vendor/flint-chart/FORK.md`
- 数据契约字段说明见 `docs/design.md` §4/§6
