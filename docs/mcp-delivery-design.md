# ChartBrain MCP 交付设计（约束记录）

> 状态：设计约束记录（**不是实施计划**）· 分支 `feat/spec-selection-and-validation` · HEAD `9792fe3` · 2026-09-10
> 目的：把「ChartBrain 未来做 MCP 交付时必须遵守的约束」与「为什么」一次写清，避免后来者重新论证。
> 参照对象：Microsoft `flint-mcp`（`D:\work\aichart\flint-chart\packages\flint-mcp`）与 `D:\work\aichart\flint-chart\agent-skills\flint-chart-author\SKILL.md`。
> 上游依据：D10（`docs/design.md:42`）、M6（`docs/design.md:302`）、D13（`docs/design.md:45`）、D15（`docs/design.md:47`）。
> 引用口径：本文件写作期间分支从 `fb2810a` 前进到 `9792fe3`（新增 `POST /v1/validate`、`GET /v1/chart-types`、`repair_rounds`、目录化的守卫与 prompt）。**文中 `file:line` 均按 `9792fe3` 的提交内容复核**；`scripts/check-chart-types.mjs` 与 `server/chartbrain_server/spec/prompt.py` 两处在写作时仍在被并发修改（工作区有未提交改动），因此凡引用这两个文件之处都同时给出**符号/内容锚点**，行号漂移时按符号 grep 即可。**已知后续漂移**：`9689661`（F4）在 `routes.py` 顶部 docstring 补写了「请求体本身不合法仍是 422」的边界说明，该文件行号整体下移（`/v1/validate` 由 `:71-86` 移到 `:74-93`）——本文引用仍按 `9792fe3` 复核，对不上时同样按符号 grep。

---

## 1. 为什么是 MCP，以及为什么不是现在

### 1.1 MCP 买到什么

- **面向 agent 的交付通道**：REST 的消费者是「消费端服务」，MCP 的消费者是「会自己调工具的 agent」。D10 已把两者并列为消费通道（`docs/design.md:42`），M6 把 MCP 交付列为扩展项（`docs/design.md:302`）。
- **产物天然适配工具返回**：ChartBrain 的产物是可序列化、可 diff 的中性 spec（红线 6，`docs/design.md:252`），本来就是「可回读的工件」，做成工具返回值不需要新的数据面。
- **知识随服务走**：MCP 的 resources 让「图型目录 / 选型规则 / 消费端契约」成为 agent 按需拉取的上下文，而不是塞进每次 prompt——flint-mcp 正是这个形态（`flint-mcp/README.md:71-82`）。
- **不引入新的信任边界**：工具只返回 spec 与校验结果，库配置仍由消费端 SDK 编译（D13，`docs/design.md:45`；`sdk/src/index.ts:26-39`）。
- **agent 侧不必自建「选型 + 变换 + 校验」**：这三件事正是 ChartBrain 的价值所在（D5 中性 spec `docs/design.md:37`、D6 库知识在转换器 `docs/design.md:38`、D9 三层校验 `docs/design.md:41`）。没有 MCP 面，每个 agent 客户端都得重写一遍，且各自漂移。

### 1.2 代价

- **第二套公开面**：REST 已有三个端点——`POST /v1/charts`（`server/chartbrain_server/api/routes.py:89-145`）、`POST /v1/validate`（`:71-86`）、`GET /v1/chart-types`（`:62-68`）——且各有一套请求/响应模型（`server/chartbrain_server/models.py:25-90`）与错误语义（`docs/INTEGRATION.md:132-142`）。MCP 面必须与它们同源，否则同一个 spec 在两个通道上会得到不同结论。
- **每个新图型都要回答「MCP 面是否跟上」**：图型清单当前 11 种（`specs/chart-types.json:4-82`），B2 计划扩到 20 种（`docs/more-chart-types-b2-plan.md:38`）。本文的工具面设计（§2）刻意让「新增图型 = 改目录，不改工具签名」。
- **协议与运维成本**：鉴权、传输、版本、审计都要重新想一遍（§7）。现在付出这些成本没有对应收益。

### 1.3 触发条件

以下三条**全部**满足才动手：

1. **图型扩展稳定**：B2 落地（20 种，`docs/more-chart-types-b2-plan.md:38`）且 B3（histogram，`docs/more-chart-types-design.md:119`）之后再观察一个迭代周期，`specs/chart-types.json` 的图型清单不再每月变动。
2. **守卫以目录为基准，且 CI 会跑守卫**：前半句**已满足**（守卫已改为以 `specs/chart-types.json` 为基准，见 §3.3）；后半句仍缺——CI 当前只有 `server`（`.github/workflows/ci.yml:9-23`）与 `sdk`（`:25-52`）两个 job，不跑 `scripts/check-chart-types.mjs` 与 `scripts/chart-parity.mjs`。
3. **`/v1/validate` 已落地**：**已满足**（`routes.py:71-86`，请求/响应模型见 `models.py:46-59`），`validate_spec` 工具必须直接复用它的 `validate_chart_spec`（`server/chartbrain_server/spec/validate.py:37-53`），而不是另写一份校验（§4.1）。

> 本文只记录约束，不含任务拆分与排期；实施计划另出。

---

## 2. 工具面（借鉴点 #1）

### 2.1 先例：小工具面 + 互斥描述

flint-mcp 的 README 专门有一节 "Why a small tool surface"（`flint-mcp/README.md:14-20`）：多数图表 MCP 是「一图型一工具（26+ 工具）」，因为每个图的 schema 不同；Flint 用**一个 schema**（`ChartAssemblyInput`）覆盖约 40 个图型 × 多后端，所以只暴露**六个**工具。我们的情况同构：**一个 schema**（`specs/chart-spec.schema.json`，`chart.type` enum 见 `:16-22`）覆盖全部图型，所以工具数应由「动作」决定，而不是由「图型」决定。

第二个先例是**描述里的互斥指引**。`render_chart` 的描述写「Prefer create_chart_view instead when the host supports MCP App UIs; use render_chart for a static artifact or when no App UI is available.」（`flint-mcp/src/server.ts:166-170`）；`create_chart_view` 反过来写「Use this whenever the user wants to see a chart, not just when they ask to tweak it; fall back to render_chart only for a static image.」（`flint-mcp/src/server.ts:313-321`）；server 级 `instructions` 再复述一遍（`flint-mcp/src/server.ts:141-156`），skill 里第三次复述（`agent-skills/flint-chart-author/SKILL.md:40-47`）。**「何时用 A、何时改用 B」是工具描述的第一等公民，不是可选润色。**

### 2.2 提议的工具面

四个工具，全部围绕同一个 schema。描述文本用英文——与本仓库 LLM 面文本一致（`server/chartbrain_server/spec/prompt.py` 的 `_SYSTEM_PROMPT_TEMPLATE` 为英文；该文件正在被并发改动，故此处只引符号不引行号）。

| 工具 | 输入 | 输出 | 何时用 | 何时改用别的 | 复用的既有实现 |
|---|---|---|---|---|---|
| `list_chart_types` | `{}`（可选 `detail: "brief" \| "full"`） | 图型目录视图，与 §3 的 `chartbrain://chart-types` 同源 | 不知道有哪些图型、或要在多个候选间选型时 | 已有明确 query → 直接 `ask_chart`；要判一张已有 spec 是否合法 → `validate_spec` | `GET /v1/chart-types`（`routes.py:62-68`）：**已存在**，工具只需转发 |
| `validate_spec` | `{ spec, columns?, constraints? }` | `{ valid, errors[], warnings[] }`（§4） | spec 已存在（人写的 / 上一轮返回的 / 改过的），要判定合法性与可编译性时 | 还没有 spec → `ask_chart`；只是想看有哪些图型 → `list_chart_types` | `POST /v1/validate`（`routes.py:71-86`）：**已存在**，工具只需转发 |
| `ask_chart` | `{ query, library, columns, data_sample?, constraints? }` | `{ request_id, chart_spec, warnings[], repair_rounds }` 或结构化错误 | 用户用自然语言要一张图、需要产出中性 spec 时 | 已有 spec 只要校验/编译 → 不要重复调用（会白花一次 LLM 调用）；超出能力边界时工具应返回澄清而不是硬猜（`_SYSTEM_PROMPT_TEMPLATE` 的硬规则 5/6：`Capability boundary` 段） | `POST /v1/charts`（`routes.py:89-145`）：**已存在**，工具只需转发 |
| `compile_spec`（**可选，默认不暴露**） | `{ chart_spec, library }` | 库配置 + `_requiredModules`（规划中，§6.3） | 仅当宿主明确接受「编译放到服务端」时 | 默认走消费端 SDK 的 `buildHighcharts` / `buildECharts`（`sdk/src/index.ts:26-39`） | **无**——server 侧没有编译器，这是唯一的净新增面 |

即：**三个工具都是既有 REST 端点的薄转发**，MCP 层不重写任何校验或生成逻辑。这是「一个 schema」思路的直接推论，也把第二套公开面的漂移风险压到最低（§6.1）。

**为什么 `compile_spec` 默认不暴露**：编译需要数据在场。flint-mcp 的 `compile_chart` 输入形状里 `data` 是必填字段（`flint-mcp/src/tools/schemas.ts:97`，`:95-119` 为完整形状；文件引用关闭时 `data.values` 更是唯一途径，`flint-mcp/src/tools/schemas.ts:26`），而我们的红线是「全量数据不出域」（D8 `docs/design.md:40`、红线 2 `docs/design.md:248`、D13 `docs/design.md:45`）。没有数据就绑不出 series，编译产物只是空壳。因此 `compile_spec` 要么在消费端执行，要么作为**逐请求显式 opt-in**（与 `docs/design.md:241` 的 opt-in 口径一致）。

### 2.3 明确**不能**做成工具的

| 不能做 | 理由 |
|---|---|
| 服务端渲染出图（PNG/SVG） | D13 要求确定性步骤在消费端（`docs/design.md:45`）；红线 2 禁止服务端接收全量数据（`docs/design.md:248`）；且**本仓库内**没有 Highcharts 的 headless 渲染器（§5） |
| 执行 `transform_plan` | 变换在消费端本地执行（D7 `docs/design.md:39`、D13）；服务端没有数据 |
| 「一个图型一个工具」 | 与「一个 schema」相悖，且把图型清单复制进工具签名（§2.1） |
| 读写消费端文件 / 安装依赖 | 与 flint-mcp 允许本地文件引用（`flint-mcp/README.md:88-105`）不同：ChartBrain 不做数据面，工具只吃 `columns` + `data_sample`（`models.py:25-36`） |
| 主题 / 样式工具 | 我们没有主题体系；样式归消费端与 vendored flint-js 的布局/配色决策（`docs/INTEGRATION.md:167-175`） |

### 2.4 描述与 instructions 的纪律

flint-mcp 把同一套指引复述三次：server 级 `instructions`（`flint-mcp/src/server.ts:141-156`）、每个工具的描述、以及 SKILL.md（`agent-skills/flint-chart-author/SKILL.md:40-47`）。三处内容一致，且描述里直接**指向资源 URI 而不是复制内容**——例如 `semantic_types` 参数的说明末尾写「see the flint://agent-skill resource」（`flint-mcp/src/tools/schemas.ts:102`）。我们照此立规：

- server `instructions` 只写两件事：先读哪个资源、四个工具怎么选（不写图型清单）；
- 每个工具描述必须含 `Use when` / `Prefer <另一个工具> when` / `Never` 三段（`render_chart` 与 `create_chart_view` 的互指即范例，`flint-mcp/src/server.ts:166-170`、`:313-321`）；
- 描述里**不写图型名与通道要求**，需要时引用 `chartbrain://chart-types`。图型清单一旦写进工具描述，就多了一处必须同步的副本（§6.1）。

---

## 3. 资源而不是提示词填充（借鉴点 #2）

### 3.1 先例

flint-mcp 把可复用知识做成 resources：`flint://agent-skill`（`flint-mcp/src/server.ts:396-415`）、`flint://theme-skill`（`:452-470`）、`flint://chart-types`（`:376-393`）。注意最后一项的正文是 `JSON.stringify(listChartTypes())`（`:384-392`）——**资源正文来自代码里的目录，而不是另写一份文档**。再用 prompt 把它们包成 `author_flint_chart` / `author_flint_theme`（`:417-450`、`:472-505`），README 建议客户端在调用工具前加载 `flint://agent-skill`（`flint-mcp/README.md:80-82`）。SKILL.md 自己也说「Don't call the library to discover channels/types — this document is the authoring reference」（`agent-skills/flint-chart-author/SKILL.md:654-655`）。

### 3.2 提议的资源

| URI | MIME | 内容 | 唯一权威来源 |
|---|---|---|---|
| `chartbrain://chart-types` | `application/json` | 图型目录 + `selection_policy`（= `GET /v1/chart-types` 的同一份视图，`routes.py:62-68`） | `specs/chart-types.json`（`:4-82` 图型、`:83-90` 选型规则） |
| `chartbrain://spec-schema` | `application/json` | 中性 spec 的 JSON Schema（含 `transform_plan` 算子闭集） | `specs/chart-spec.schema.json`（`:7`、`:16-22`、`:62-70`） |
| `chartbrain://authoring-rules` | `text/markdown` | 授权规则：列生命周期、能力边界、约束白名单（硬规则 2–8）+ 由目录渲染的选型段 | `server/chartbrain_server/spec/prompt.py` 的 `_SYSTEM_PROMPT_TEMPLATE`（硬规则 2–8）与 `_selection_guidance()`（选型段，由目录渲染）+ `specs/chart-types.json:83-90` |
| `chartbrain://consumer-contract` | `text/markdown` | 消费端契约：`buildHighcharts` 输出结构、缺通道抛错、重复 (x, series) 不在契约内 | `docs/INTEGRATION.md:152-202` |
| `chartbrain://highcharts-modules` | `application/json` | 图型 → 需加载的 Highcharts 模块（**数组即加载顺序**） | `docs/INTEGRATION.md:189-198`；`_requiredModules`（规划中，§6.3） |

**资源是视图，不是副本**：`chartbrain://chart-types` 的正文应与 `GET /v1/chart-types`（`routes.py:62-68`）**同一个实现**产出——该端点的响应模型已经声明「不在 Python 侧复制数据」（`models.py:62-77`），MCP 资源层只需把同一份 JSON 再暴露一次（与 `flint-mcp/src/server.ts:384-392` 的 `flint://chart-types` 同构）。理由：`specs/chart-types.json` 已声明自己是单一事实源（`:2`），任何副本都会在下一个图型落地时漂移。

**prompt 是可选糖**：flint-mcp 用 `author_flint_chart` 把 skill 资源包成 prompt（`flint-mcp/src/server.ts:417-450`）。我们可以做等价的 `author_chart_spec`（正文 = `chartbrain://authoring-rules`），但 MCP 客户端对 prompt 的支持程度不一，因此**不能把 prompt 当作唯一的知识入口**——资源才是权威，prompt 只是便捷包装。

### 3.3 守卫的现状（含一个仍然存在的缺口）

`specs/chart-types.json:2` 声明自己是单一事实源、由 `scripts/check-chart-types.mjs` 强制校验。这句话**现在成立**（`9792fe3` 起）：守卫以目录为基准（`scripts/check-chart-types.mjs:5-11`，`9792fe3`），并对拍目录字段与下游代码——`types[].flint` ↔ 两个转换器的 Flint 名称、`types[].required_channels` ↔ `sdk/src/converter/validate.ts:31-43` 的 `REQUIRED_CHANNELS`、`selection` 与 `selection_policy` 非空（实现见同文件 `check(...)` 调用；该文件在本文写作后又经 `90c7ada`（去掉子进程依赖、改回纯静态）与 `288b0cd`（补 4 条目录自不变量，并把第 10 项标签改成如实的「≤16 字符窗口形状检测」）改动，故此处只给符号、不引行号）。同一批改动还让 `prompt.py` 在 import 时用目录渲染规则 1 与选型段（`load_chart_types()` → `_selection_guidance()` → `_SYSTEM_PROMPT_TEMPLATE.replace(...)`），即**提示词里的图型清单与选型说明已经是目录的视图**，且这条由 `server/tests/test_prompt.py` 断言（选型行逐字等于 `types[].selection`、`selection_policy` 每条都出现）。`GET /v1/chart-types` 是同一份目录的第三个视图（`routes.py:49-68`）。

**仍然存在的缺口：`hc_modules` 没有任何机器校验。** 守卫的四类新对拍不含它，`docs/INTEGRATION.md:189-198` 的模块表也没有对拍来源。当前 11 个图型的 `hc_modules` 全是 `[]`（`specs/chart-types.json:9`、`:23` 等），所以问题是隐性的：**B2 引入第一个非空 `hc_modules` 时才会暴露**。MCP 的 `chartbrain://highcharts-modules` 资源会直接消费这个字段，因此这个对拍是 MCP 交付的前置条件（§6.1）。

结论（对本章的影响）：`chartbrain://chart-types` 与 `chartbrain://authoring-rules` 已经具备做成**视图**的条件（目录 → 守卫 → prompt → REST → MCP 资源，同一条链）；但 `chartbrain://highcharts-modules` 在 `hc_modules` 对拍落地前仍只能是文档表的副本，这一点必须在资源描述里对使用者显式标注。

---

## 4. 结构化结果

### 4.1 `validate_spec` 的返回形状

`validate_spec` **必须**原样返回 `POST /v1/validate` 的响应体，不做二次包装。该端点（`routes.py:71-86`）的响应模型就是三件套（`models.py:54-59`），并且 **spec 层面的任何校验结论都始终 200**——校验结果是 payload，不是 HTTP 错误（`routes.py:11-12`）；**请求体本身不合法**（缺/写错 `spec`、`Column.type` 取值非法）仍由 FastAPI 直接返回 422，那不是校验结论——消费端仍须处理 422，不能只写「恒 200 → 解析 payload」这一条分支：

| 字段 | 含义 | 来源 |
|---|---|---|
| `valid` | `errors` 为空即通过 | `server/chartbrain_server/spec/validate.py:53`（`valid=not errors`） |
| `errors` | L1 后 L2 的顺序拼接 | L1：`spec/validator.py:33-36`，格式 `path: message`（`:39-41`）；L2：`spec/l2.py:35-39` 的 `validate_l2_columns`，格式 `L2: where: message (available in current table: [...])`（`:62-65`） |
| `warnings` | 真实通道，不是占位 | 当前唯一来源是「没传 `columns` 导致 L2 被跳过」的提示（`spec/validate.py:22-25`、`:49-50`） |

注意 `warnings` 的语义已经落地为一个**能力覆盖说明**：调用方据此知道这次结果只覆盖了 L1。MCP 工具必须把这条警告透传给 agent，否则 agent 会误以为「校验通过 = 完全合法」。

与 `POST /v1/charts` 的关系：MCP 的 `validate_spec` 等价于「只跑 L1/L2，不跑 LLM」。实现时**必须直接调用** `validate_chart_spec`（`spec/validate.py:37-53`），它与生成管线共用同一套 `validate_spec` / `validate_l2_columns`：**`columns` 非空时，`/v1/validate` 与 `/v1/charts` 的判定逐字相同**（同一实现，同样的错误串）。但**这不是等价关系**：不传 `columns`（或传 `[]`）时 `/v1/validate` 只跑 L1，`valid: true` **不**蕴含可交付——一个 `encodings.y` 指向不存在列的 spec 在这种情况下照样返回 `valid: true` / `errors: []`，只有 `warnings` 里那条「L2 skipped…」说明本次结论只覆盖 L1（`spec/validate.py:22-25`、`:49-50`）；而 `/v1/charts` 到不了这个状态：`ChartRequest.columns` 是 `min_length=1`（`models.py:30`），每个真实请求都跑 L2，同一个 spec 只会得到 422（同一份 spec 传给 `columns` 非空的 `/v1/validate` 时也是 `valid: false` + 同名 L2 错误）。`spec/validate.py:1-4` 已注明该三件套形态是**借用 flint-mcp 的 `validate_chart`**（`flint-mcp/src/tools/validate.ts:9-20`）——MCP 交付时这条借鉴已经落在服务端，工具层无需再设计。

### 4.2 错误必须可自修复

现有错误串已满足「可自修复」的最低要求：点名位置，并给出合法集合。

- L1 示例：`/chart/type: 'bars' is not one of ['bar', 'line', ...]`（由 `validator.py:39-41` 拼装，枚举来自 `specs/chart-spec.schema.json:16-22`）。
- L2 示例：`L2: encodings.y: referenced column 'revenu' does not exist (available in current table: ['month', 'revenue'])`（`l2.py:60-65`）；`L2: transform_plan.steps[1](aggregate)/measures: numeric aggregation sum applied to non-number column 'region' (type: string)`（`l2.py:129-132`）。

修复回路也已存在：失败后把结构化错误回喂 LLM，**只允许一轮**（`generator.py:23` 的 `MAX_REPAIR_ROUNDS = 1`、`:97-100`、`:103-110`），与 D9 一致（`docs/design.md:198`）。MCP 面**不要引入新的修复语义**：`validate_spec` 只报告、不修改；是否修由调用方（agent）决定。

> 建议（**规划中**，不是现状）：在保持字符串兼容的前提下，未来给 `errors` 增加机器可读字段（`layer` / `path` / `code` / `hint`）。当前 `validate_spec` 返回 `list[str]`（`validator.py:33`），`validate_l2_columns` 同样返回 `list[str]`（`l2.py:35-39`）——不要发明不存在的结构。

### 4.3 `ask_chart` 的结果形状与 REST 状态码的映射

`ask_chart` 的输出应与 REST 一一对应，不做二次发明：

| REST（`docs/INTEGRATION.md:134-142`、`routes.py:106-130`） | `ask_chart` 结果 |
|---|---|
| 200 `{request_id, library, chart_spec, warnings, repair_rounds}`（`models.py:80-90`） | `{ok: true, request_id, chart_spec, warnings[], repair_rounds}` |
| 422 `error_kind=clarification`（LLM 主动澄清，`generator.py:76-82`） | `{ok: false, error_kind: "clarification", errors[]}` —— agent 应把 `errors` 展示给用户引导改述，**不要**自动重试 |
| 422 `error_kind=validation`（修复一轮后仍失败，`generator.py:97-100`） | `{ok: false, error_kind: "validation", errors[], repair_rounds}` |
| 503 `error_kind=provider`（`generator.py:58-63`） | `{ok: false, error_kind: "provider", retryable: true, errors[]}` |

关键点：**provider 故障也必须作为结构化结果返回**。若把 503 抛成 MCP 传输层错误，agent 会误判为「工具不存在/协议失败」而不是「稍后重试」，从而放弃本来可恢复的请求。

---

## 5. 必须与 flint-mcp 分歧之处

| 维度 | flint-mcp 现状 | ChartBrain 必须怎么做 | 依据 |
|---|---|---|---|
| 服务端渲染 | 进程内渲染 PNG/SVG（`flint-mcp/README.md:4-6`、`:218-227`；`src/render/index.ts:41-45`） | **不服务端渲染**：工具只返回 spec、校验结果、（可选）未绑定数据的编译产物 | D13（`docs/design.md:45`）、红线 2（`docs/design.md:248`）、非目标「不碰 UI 渲染」（`docs/design.md:24`） |
| 后端集合 | `vegalite \| echarts \| chartjs`（`flint-mcp/src/render/types.ts:7`） | Highcharts 优先 + ECharts，两者均经 vendored flint-js 编译 | D11（`docs/design.md:43`）、D15（`docs/design.md:47`）；D12 列出现有后端（VL/ECharts/Chart.js/Plotly/Excel）无 Highcharts（`docs/design.md:44`） |
| Highcharts 服务端渲染 | 无该后端，故无此问题 | **本仓库没有任何 Highcharts 渲染路径**：vendored HC 后端只产 options 对象（`vendor/flint-chart/packages/flint-js/src/highcharts/README.md:21`、`.../src/highcharts/assemble.ts:83`），D12 列出的 Flint 后端（VL/ECharts/Chart.js/Plotly/Excel）也不含 Highcharts（`docs/design.md:44`）。「服务端出图」在**本仓库的能力范围内**不成立（Highcharts 官方是否有可用的 headless 渲染链路，未在仓库内核实） | `docs/design.md:44` |
| 依赖形态 | `flint-chart@^0.5.1`（`flint-mcp/package.json:71`） | vendored fork，SDK 经 `file:` 依赖消费，上游不追踪 | D15（`docs/design.md:47`）、`vendor/flint-chart/FORK.md:60` |
| 编译位置 | 服务端 `compile_chart`（`flint-mcp/src/server.ts:223-241`） | 消费端 SDK（`sdk/src/index.ts:26-39`）；MCP 侧若提供 `compile_spec` 必须消费端执行或显式 opt-in | D13、D7（`docs/design.md:39`） |
| 数据绑定 | 接受 `data.values` 或本地文件（`flint-mcp/README.md:88-105`；`src/tools/schemas.ts:97`） | 只接受 `columns` + 可选 `data_sample` | D8（`docs/design.md:40`）、红线 2（`docs/design.md:248`）、`docs/design.md:237-241` |
| 产物 | 图片字节 / 后端 spec JSON（`flint-mcp/src/render/types.ts:27-44`） | 中性 spec + 校验结果；库配置由 SDK 产出 | D5（`docs/design.md:37`）、D13 |
| 工具数量 | 6（`flint-mcp/README.md:19-20`） | 3（+1 可选）——我们没有 theme 体系，也不需要 `create_chart_view`（无 UI 面） | §2.2 |
| 会话状态 | 无状态 | 同样无状态，且**每请求隔离**，不做跨会话隐式状态 | 红线 4（`docs/design.md:250`） |
| 安全与限额 | 本地渲染 + 读本地文件开关 + DoS 上限（`flint-mcp/README.md:229-237`、`:103-105`） | 服务端不接触数据，所以「限额」落在 `constraints.max_transform_rows`（`models.py:22`）与消费端执行上；MCP 面要防的是**提示注入与请求配额**（红线 5，`docs/design.md:251`） | `docs/design.md:248-251` |
| 与上游的关系 | 是上游仓库的一个 package（`flint-mcp/package.json:21-25`） | `flint-mcp` **有意不 vendor**（`vendor/flint-chart/FORK.md:53-61`），只作设计参照；我们不引入它的运行时依赖 | `vendor/flint-chart/FORK.md:60-61` |

**结论一句话**：我们的 MCP 工具返回 spec 与校验结果，**永远不返回图片**；`compile_spec` 若提供，必须消费端执行或显式 opt-in。

---

## 6. 兼容与版本

### 6.1 MCP 面与白名单/守卫的关系

图型契约的同步点是**以 `specs/chart-types.json` 为基准的一组下游副本**：schema enum、`sdk/src/types.ts` 的 `ChartType` union、两个转换器的 `FLINT_CHART_TYPE` 键（`scripts/check-chart-types.mjs:5-11`，`9792fe3`），加上通道校验器（`sdk/src/converter/validate.ts:31-43`）与 prompt 侧的渲染断言（`server/tests/test_prompt.py` 的 `test_prompt_whitelist_matches_schema_enum` / `test_prompt_selection_lines_match_catalog_hints`）。注意 **`prompt.py` 的规则 1 已不再是手写副本**：它由目录在 import 时渲染（`__CHART_TYPES__` 占位符），渲染结果由上述 pytest 断言，因此「prompt 忘记加新图型」这类漂移在结构上已被消除。MCP 面**不新增同步点**：

- `list_chart_types` 与 `chartbrain://chart-types` 都是 catalog 的视图，改图型只改 `specs/chart-types.json`；
- 工具签名里**没有图型名**（§2.2），新增图型不改 MCP 工具定义；
- `validate_spec` 的图型合法性来自 schema enum（`specs/chart-spec.schema.json:16-22`），与 REST 侧同一个文件（`server/chartbrain_server/spec/validator.py:18`）；
- 三个工具都是薄转发（§2.2），因此「REST 改了 MCP 没跟上」这类漂移只可能发生在转发层，而不会发生在校验/生成逻辑里。

**规划中（做 MCP 之前必须补）**：

1. 把目录的 `hc_modules` 纳入守卫，与 `docs/INTEGRATION.md:189-198` 的模块表对拍（现状见 §3.3 的缺口）；
2. 把 `node scripts/check-chart-types.mjs` 与 `node scripts/chart-parity.mjs` 加入 CI（当前 `.github/workflows/ci.yml` 只有 `server`（`:9-23`）与 `sdk`（`:25-52`）两个 job）。

### 6.2 新增一个图型时会发生什么

落地顺序由 catalog 自己规定：「新增图型时先改本文件，再让守卫告诉你还有哪几处没跟上」（`specs/chart-types.json:2`）。守卫已按 §6.1 以目录为基准，因此下表可直接当作现状读（唯一例外是 MCP 资源视图尚未存在）——对 MCP 面的影响：

| 步骤 | 影响 MCP 面？ |
|---|---|
| 改 `specs/chart-types.json`（含 `required_channels` / `hc_modules` / `selection`） | 是——资源视图自动变化 |
| 同步目录的全部下游副本（schema enum / `ChartType` union / 两个 `FLINT_CHART_TYPE`）+ `REQUIRED_CHANNELS`（`sdk/src/converter/validate.ts:31-43`） | 否（工具签名不变），但 `validate_spec` 的判定结果会变 |
| 扩展 `scripts/chart-parity.mjs` 的 CASES（`:105-209`） | 否 |
| 更新 `docs/INTEGRATION.md` 模块表（`:184-202`） | 是——`chartbrain://highcharts-modules` 视图变化 |

即：**图型增长对 MCP 面是数据变更，不是接口变更**——这是「小工具面 + 资源视图」的主要收益。

一个具体例子（以 B2 的 `lollipop` 为例，`docs/more-chart-types-b2-plan.md:5`）：

| 动作 | 是否触及 MCP 工具代码 |
|---|---|
| 在 `specs/chart-types.json` 的 `types[]` 加一条（`type` / `flint` / `required_channels` / `hc_modules` / `selection`） | 否——资源视图自动多一项 |
| 同步目录的全部下游副本（schema enum / `ChartType` union / 两个 `FLINT_CHART_TYPE`） | 否 |
| 在 `sdk/src/converter/validate.ts:31-43` 的 `REQUIRED_CHANNELS` 加一行 | 否——但 `validate_spec` 的判定随之变化 |
| 在 `scripts/chart-parity.mjs` 的 `CASES` 加一个用例（`:105-209`） | 否 |
| 在 `docs/INTEGRATION.md:189-198` 模块表加一行（lollipop 的 `highcharts-more → dumbbell → lollipop` 顺序链） | 否——`chartbrain://highcharts-modules` 视图变化 |

合计：**MCP 工具代码改动 0 处**。若当初按「一图型一工具」设计，这里就要新增一个工具 + 一份 schema + 一段描述，且每次图型变动都要同步三处。

### 6.3 消费端如何发现需要加载的 Highcharts 模块

**规划中**：B2 计划新增 `_requiredModules` 机制——HC 后端按图型登记所需模块并 stamp 在输出 options 上（`docs/more-chart-types-b2-plan.md:7`、`:113`、`:2218-2222`），值是有序数组、**语义为加载顺序**（`docs/more-chart-types-b2-plan.md:2120-2125`）。**当前代码里没有这个字段**：`sdk/src/converter/highcharts.ts:64` 的 `HighchartsOption` 只有 `_warnings`；`vendor/flint-chart/packages/flint-js/src/highcharts/assemble.ts:266`（及 `:83` 的注释）只 stamp `_warnings` / `_width` / `_height`。

在它落地之前，模块需求的权威来源是 `docs/INTEGRATION.md:184-202` 的对照表（含 lollipop 的三模块顺序链，以及「只加载 `lollipop.js` 会抛难以定位错误」的实测结论，`:200-202`）。`chartbrain://highcharts-modules` 应在 `_requiredModules` 落地后**改为从 SDK 输出/模块表生成**；在此之前以文档表为准，并显式标注哪些行是规划中（B2/B3 行，`docs/INTEGRATION.md:186-187`）。

### 6.4 版本

- spec 侧版本由 `schema_version` 承担（`specs/chart-spec.schema.json:10` 的 `const: 1`）；MCP 工具的输入输出都带它，不做隐式升级。
- 图型目录有独立 `schema_version`（`specs/chart-types.json:3`），资源正文应一并返回，便于 agent 判断自己看到的是哪一版。
- 错误语义与 REST 保持一致：422（澄清 / 校验失败）与 503（provider 故障）的区分见 `docs/INTEGRATION.md:132-142` 与 `routes.py:106-114`。MCP 工具应把它映射为**结构化结果**而非传输层错误——先例是 flint-mcp 的 `validate_chart`「never throws」（`flint-mcp/src/tools/validate.ts:22-26`、`:47-56`），而我们这边 `/v1/validate` 已经采用同一约定：**spec 层面的判定始终 200，校验结果就是响应体**；请求体自身不合法（缺/写错 `spec`、`Column.type` 取值非法）仍是 FastAPI 的 422，不由该校验决定（`routes.py:11-12`、`:71-86`）。`validate_spec` 工具必须保留这个语义，不能把 `valid: false` 变成 MCP 工具错误。

---

## 7. 开放问题

1. **鉴权与 key 归属**：MCP 面是 BYOK 还是托管（D4 未定，`docs/design.md:36`）？REST 侧建议经消费端后端代理（`docs/INTEGRATION.md:25`），MCP 面是否允许 agent 直连 server？
2. **传输**：flint-mcp 只支持 stdio（`flint-mcp/README.md:146`、`:151`），我们是否需要 HTTP/SSE？两者对鉴权与审计的要求不同。
3. **多轮改图**：`ask_chart` 是否接受上一轮的 spec 作为输入（「把柱状图换成折线」）？当前是「一次一问一图」，多轮会话仍在路线图前瞻（`docs/design.md:312` 第 5 条、`docs/INTEGRATION.md:150`）。
4. **`ask_chart` 是否返回候选**：选型本身可争议（`specs/chart-types.json:83-90` 的 `selection_policy` 给的是规则而非唯一解）；是否返回 `{candidates: [...]}` 让 agent 选？调研侧先例是 NL4DV 的候选列表与 Highcharts Chartchooser 的独立选型（`research/nl-to-chart-spec-survey.md:89`），但这会改变「单轮修复」的语义。
5. **`constraints` 怎么暴露**：`allowed_fields` / `allowed_aggs` / `max_transform_rows` 现在是请求字段（`models.py:17-22`，由 L2 在 `l2.py:67-70`、`:117-121` 强制执行）。MCP 面把它作为工具参数、还是作为部署期配置（资源）？后者更安全但不够灵活——注意 `POST /v1/validate` 已支持把 `constraints` 作为独立入参传入（`models.py:46-51`），因此「工具参数」这条路是通的。
