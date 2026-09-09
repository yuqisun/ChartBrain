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
- **支持哪些图型？** 当前 5 种：bar/line/pie/scatter/area（含多系列拆分）。超出会诚实拒绝而非硬凑。
- **"占比/环比"这类诉求怎么办？** 当前会 422 澄清；属于未来 `derive` 派生列能力（路线图前瞻）。
- **成本？** 每次查询 = 1 次 LLM 调用（+1 次失败修复调用）。server 已内置超时/重试与错误分类。
- **多轮改图？** 当前一次一问一图；多轮会话（"把柱状图换成折线"）属路线图前瞻项。

## 附录 C · `buildHighcharts` 输出结构（消费端可依赖的契约）

自 D15 起 Highcharts 配置由 vendored flint-js 编译器产出（不再是手写映射）。稳定部分：

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

## 参考

- 现成可跑示例：`examples/highcharts-demo`（单库）、`examples/dual-demo`（同 spec 双库，`offline.mjs` 为离线版）
- 架构与决策：`docs/design.md`（D1–D15）、`specs/chart-spec.schema.json`
- Highcharts 后端实现与限制：`vendor/flint-chart/packages/flint-js/src/highcharts/README.md`、`vendor/flint-chart/FORK.md`
- 数据契约字段说明见 `docs/design.md` §4/§6
