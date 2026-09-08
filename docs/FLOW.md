# ChartBrain 流程图（Mermaid）

> 全链路：用户提问 → 消费端组装请求 → server 出 spec → SDK 本地变换/转换 → 渲染。
> 本文每步标注对应的真实函数/字段/文件，便于对照代码。

## 一、时序图（调用 / 返回）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as 消费端前端<br/>(React + Highcharts/ECharts)
    participant BE as 消费端后端<br/>(业务服务, 持有全量数据)
    participant SDK as @chartbrain/sdk<br/>(本地确定性执行层)
    participant CB as chartbrain-server<br/>(无状态意图层)
    participant LLM as LLM Provider<br/>(DeepSeek 等, OpenAI 兼容)

    U->>FE: ① 输入自然语言问题
    FE->>BE: ② 请求图表(question)

    Note over BE: ③ 消费端需准备: columns(列schema) + data_sample(≤N行样例) + 可选 constraints(白名单)

    BE->>CB: ④ POST /v1/charts {query, library, columns, data_sample, constraints}
    CB->>LLM: ⑤ 受控上下文(规则+few-shot) + json_mode
    LLM-->>CB: ⑥ 中性 spec + transform_plan
    CB->>CB: ⑦ L1 JSON Schema → L2 字段/类型/白名单 → (单轮修复)

    alt 需要澄清 / L1·L2 未过
        CB-->>BE: 422 {error_kind: clarification|validation, errors, request_id}
        BE-->>FE: 返回澄清/错误
        FE-->>U: 展示文案, 引导改述
    else Provider 故障(网络/认证/超时/5xx)
        CB-->>BE: 503 {error_kind: provider, request_id}
        BE-->>FE: 服务暂不可用
        FE-->>U: 稍后重试
    else 成功
        CB-->>BE: ⑧ 200 {chart_spec, request_id, warnings}  (不返回库配置, D13)
        BE->>SDK: ⑨ buildHighcharts(全量data, chart_spec) 或 buildECharts(...)
        Note over SDK: ⑩ ①executeTransform: filter/aggregate/sort/limit/derive/binTime(本地全量)
        Note over SDK:    ②确定性转换: →Highcharts option(自研) / →ECharts(经 flint-js)
        Note over SDK:    ③数据绑定: 计算结果写入 series → 得到可直接渲染的 option
        SDK-->>BE: ⑪ Highcharts.Options / ECharts option
        BE-->>FE: ⑫ option(不含全量数据)
        FE->>FE: ⑬ Highcharts.chart('container', option) 或 echarts.setOption(option)
        FE-->>U: ⑭ 图表展示; 用户可追问(未来多轮修改)
    end

    Note over U,SDK: 红线: 全量业务数据只在消费端; 网络仅传输 columns+样例+中性 spec
```

## 二、步骤 ↔ 代码对照

| 步骤 | 发生在 | 对应实现 |
|---|---|---|
| ③ 组装请求 | 消费端 | `ChartRequest`（`server/chartbrain_server/models.py`）：query/library/columns/data_sample/constraints |
| ④ 调用 | 消费端 → server | `POST /v1/charts`（`api/routes.py`） |
| ⑤ 提示词 | server | `spec/prompt.py`：`SYSTEM_PROMPT`（英文规则 + few-shot）+ `build_user_prompt()`；Provider 经 `llm/get_provider()`（mock / openai-compatible） |
| ⑥ 出 spec | LLM | 结构化输出 JSON → `spec/generator.py: extract_json()` |
| ⑦ 校验 | server | L1 = `spec/validator.py`（读 `specs/chart-spec.schema.json`）；L2 = `spec/l2.py`（列生命周期/类型/白名单）；单轮修复在 `generate_spec()` |
| 422/503 | server | `routes.py` 按 `result.error_kind` 映射：clarification/validation→422，provider→503；响应含 `request_id`（审计） |
| ⑨ SDK 入口 | 消费端 SDK | `sdk/src/index.ts`：`buildHighcharts()` / `buildECharts()` |
| ⑩ 本地处理 | SDK | ① `sdk/src/transform.ts` `executeTransform()`（算子闭集）→ ② `converter/highcharts.ts`（自研）或 `converter/echarts.ts`（flint-js `assembleECharts`）→ ③ 数据绑定进 series |
| ⑬ 渲染 | 消费端前端 | 原生 `Highcharts.chart(container, option)` / React `<HighchartsReact options=…>` / ECharts `setOption(option)` |
| 审计 | server | `charts.start / ok / fail` 日志（含耗时、error_kind、request_id） |

## 三、消费端职责清单（详见 `docs/INTEGRATION.md`）

1. 持有全量数据，能提供 `columns` 与 ≤N 行 `data_sample`（可脱敏）；
2. 封装 `askForChart(query, rows)` → `POST /v1/charts`（建议经自有后端代理，浏览器不直连 server）；
3. 处理状态码：`200` → SDK 生成 option；`422`（clarification/validation）→ 展示 errors 引导改述；`503` → 提示重试；全链路记录 `request_id`；
4. `buildHighcharts(rows, spec)`（Highcharts）或 `buildECharts(rows, spec)`（ECharts，经 flint-js）——**全量数据不出域**；
5. 用返回的 option 交给现有图表组件渲染。

## 四、数据边界（红线，D8/D13）

- 网络只传输：`columns`（schema）+ `data_sample`（样例）+ 中性 `chart_spec`；
- **全量真实业务数据只存在于消费端进程内**，由 SDK 确定性执行变换/转换/绑定；
- LLM 永不接触数值计算；权限白名单（`constraints`）在执行期强制。
