# ChartBrain 流程图（Mermaid）

> 全链路：用户提问 → 消费端组装请求 → server 出 spec → SDK 本地变换/转换 → 渲染。
> 本文每步标注对应的真实函数/字段/文件，便于对照代码。

## 一、时序图（调用 / 返回）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as 消费端前端<br/>React 与 Highcharts 或 ECharts
    participant BE as 消费端后端<br/>业务服务 持有全量数据
    participant SDK as chartbrain-sdk<br/>本地确定性执行层
    participant CB as chartbrain-server<br/>无状态意图层
    participant LLM as LLM Provider<br/>DeepSeek 等 OpenAI 兼容

    U->>FE: ① 输入自然语言问题
    FE->>BE: ② 请求图表

    Note over BE: ③ 消费端需准备 columns 与 data_sample 与可选 constraints

    BE->>CB: ④ POST /v1/charts 发送 query library columns data_sample
    CB->>LLM: ⑤ 受控上下文与 few-shot 并启用 JSON 模式
    LLM-->>CB: ⑥ 返回中性 spec 与 transform_plan
    CB->>CB: ⑦ 执行 L1 与 L2 校验并做单轮修复

    alt 需要澄清或校验未通过
        CB-->>BE: 422 携带 error_kind 与 errors 与 request_id
        BE-->>FE: 返回澄清或错误
        FE-->>U: 展示文案并引导用户改述
    else Provider 发生故障
        CB-->>BE: 503 携带 error_kind provider 与 request_id
        BE-->>FE: 服务暂不可用
        FE-->>U: 提示稍后重试
    else 成功
        CB-->>BE: ⑧ 返回 200 含 chart_spec 与 request_id 与 warnings
        BE->>SDK: ⑨ 调用 buildHighcharts 或 buildECharts
        Note over SDK: ⑩ 在本地依次执行变换 转换 与数据绑定
        SDK-->>BE: ⑪ 返回可直接渲染的图表配置
        BE-->>FE: ⑫ 下发图表配置
        FE->>FE: ⑬ 交给 Highcharts 或 ECharts 渲染
        FE-->>U: ⑭ 展示图表并可继续追问
    end

    Note over U,SDK: 全量数据只在消费端 网络仅传输 schema 样例与中性 spec
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
| ⑩ 本地处理 | SDK | ① `sdk/src/transform.ts` `executeTransform()`（算子闭集）→ ② `converter/highcharts.ts` 或 `converter/echarts.ts`（**均经 vendored flint-js 编译器**，D15/D12）→ ③ 数据绑定进 series |
| ⑬ 渲染 | 消费端前端 | 原生 `Highcharts.chart(container, option)` / React `<HighchartsReact options=…>` / ECharts `setOption(option)` |
| 审计 | server | `charts.start / ok / fail` 日志（含耗时、error_kind、request_id） |

## 三、消费端职责清单（详见 `docs/INTEGRATION.md`）

1. 持有全量数据，能提供 `columns` 与 ≤N 行 `data_sample`（可脱敏）；
2. 封装 `askForChart(query, rows)` → `POST /v1/charts`（建议经自有后端代理，浏览器不直连 server）；
3. 处理状态码：`200` → SDK 生成 option；`422`（clarification/validation）→ 展示 errors 引导改述；`503` → 提示重试；全链路记录 `request_id`；
4. `buildHighcharts(rows, spec)`（Highcharts）或 `buildECharts(rows, spec)`（ECharts）——两者均经 vendored flint-js 编译，**全量数据不出域**；
5. 用返回的 option 交给现有图表组件渲染。

## 四、数据边界（红线，D8/D13）

- 网络只传输：`columns`（schema）+ `data_sample`（样例）+ 中性 `chart_spec`；
- **全量真实业务数据只存在于消费端进程内**，由 SDK 确定性执行变换/转换/绑定；
- LLM 永不接触数值计算；权限白名单（`constraints`）在执行期强制。
