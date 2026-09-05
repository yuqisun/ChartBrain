# Grafana LLM / 自然语言能力调研报告（ChartBrain 复用性视角）

> 调研时间：2026 年（会话内 web_search 完成）。证据说明：本会话沙箱无外网出口，GitHub/grafana.com 原始页面与 README 全文无法直接抓取，本报告基于 web_search 反复命中并交叉验证的**官方来源 URL、页面标题与摘要**整理；凡无法直接核实的数值（star 数、具体 commit 日期）均已明确标注"未能核实"。

---

## 0. 总体结论（先看这段）

- Grafana 的"自然语言能力"分两层：**底层是官方插件 grafana-llm-app**（给其他插件提供 LLM 网关/向量库基础设施），**上层是产品 Grafana Assistant**（2025-10-08 GA，从云优先走向 self-managed Grafana/OSS）。
- Grafana 路线的核心是 **"自然语言 → 查询语句/看板 JSON"**（PromQL/LogQL/SQL/云数据源），渲染仍发生在 Grafana 面板系统内——**它不做"库无关的图表 spec"，也不做"LLM 生成 + 确定性编译"这类中立中间层**。
- 语义层（semantic layer）思路体现在：把**遥测元数据（指标名、标签等）采集进向量库做 RAG**，给 LLM 注入"这个环境里有什么可查"，而不是让 LLM 凭空生成。
- **对 ChartBrain 的判定：Grafana 全家桶（插件 API、数据源框架、查询语言、面板渲染）互相绑定，无法作为独立、库无关的中间件复用。** 这既是差距，也是 ChartBrain"数据由客户端提供 + 中立 spec + 确定性变换到目标图表库"方案的差异化空间。
- 近年方向（2025→2026）：从"LLM 插件/chat"转向 **agentic**（Assistant Investigations、Assistant everywhere/工具可定制、官方 MCP servers、面向编码代理的 gcx）——"AI 帮你操作平台"而不是"AI 帮你画一张图"。

---

## 1. 调研对象清单 + 一句话定位

| # | 项目 | 定位 |
|---|------|------|
| 1 | [grafana/grafana-llm-app](https://github.com/grafana/grafana-llm-app)（官方 "LLM App" 插件） | 让 Grafana 生态"轻松接入 LLM 能力"的基础插件：为其他插件提供 LLM 网关、向量库与 RAG 上下文；公共预览。 |
| 2 | [fabianbaier/grafana-llm-app](https://github.com/fabianbaier/grafana-llm-app)（社区前身/原版） | Fabian Baier 早期社区作品（README 标题同为 "Grafana LLM App (Public Preview)"），演示 Grafana 内 LLM 扩展思路，后被官方化方向覆盖。 |
| 3 | [tamcore/grafana-llmanalysis-app](https://github.com/tamcore/grafana-llmanalysis-app)（社区 NL 插件） | 用 OpenAI 对话"自然语言分析/查询"Grafana 数据源的社区插件（含让 LLM 以自然语言操作 Grafana 的 "grafana operator" 文档）。 |
| 4 | Grafana Assistant（产品，非单一开源仓库） | 上下文感知的 LLM agent，直接内建在 Grafana（云优先，2025-10 GA；已扩展到 self-managed Grafana）；提供查询生成/精炼、看板问答、调查（Investigations）等。 |
| 5 | [hydrosquall/vega-mcp-server](https://github.com/hydrosquall/vega-mcp-server) | MCP server：在 LLM 对话（MCP Apps）里用 Vega-Lite 产出交互图表的声明式渲染器；作者为 Grafana Labs 开发者（社区/员工作品，非 Grafana 官方产品）。 |
| 6 | 补充：[Ask O11y（consensys）](https://grafana.com/grafana/plugins/consensys-asko11y-app/) | 又一个社区"自然语言问观测数据"的 Grafana app 插件。 |
| 7 | 补充：Grafana 官方 [OSS MCP server](https://grafana.com/docs/grafana/next/developer-resources/mcp/) 与 [Cloud MCP servers](https://grafana.com/docs/grafana-cloud/machine-learning/mcp/) | 让 LLM/编码代理以工具方式读 Grafana 数据与资源（2025 起）。 |

---

## 2. 维护状态

- **grafana/grafana-llm-app（官方）**：维护活跃（截至检索）。证据：GitHub [Releases 页](https://github.com/grafana/grafana-llm-app/releases) 存在；仓库有持续 [dependabot 依赖更新（如 anthropic-sdk-go 1.4.0→1.5.0）](https://dependabot.ecosyste.ms/hosts/GitHub/repositories/grafana%2Fgrafana-llm-app/issues/745) 与功能 PR（[anthropic provider 的 api key 设置/健康检查 #751](https://github.com/grafana/grafana-llm-app/pull/751)）；[pkg.go.dev](https://pkg.go.dev/github.com/grafana/grafana-llm-app@v0.6.4) 已发布 Go module v0.6.4（含可独立 import 的 `llmclient` 子包，另有 deps.dev 上 v0.20.0 的 `/llmclient` 版本线）。官方插件目录页 [LLM plugin for Grafana](https://grafana.com/grafana/plugins/grafana-llm-app/) 仍在宣传。star 数量级：**未能核实**（建议以 GitHub 页面为准）；就 issue/PR 活动看属于 Grafana 官方正常维护的开源仓库。
- **fabianbaier/grafana-llm-app**：功能与定位已被官方仓库继承/覆盖，社区原版大概率转入低维护；具体最后 commit 与 star **未能核实**。
- **tamcore/grafana-llmanalysis-app**：README 与 [docs/grafana-operator.md](https://github.com/tamcore/grafana-llmanalysis-app/blob/master/docs/grafana-operator.md) 可见其设计完整（含"用自然语言操作 Grafana"），但属个人维护的社区插件，更新节奏与兼容性存疑；star 数量级与最后 commit **未能核实**。
- **hydrosquall/vega-mcp-server**：2025 年前后仍在活跃更新（README + [FAQ](https://github.com/hydrosquall/vega-mcp-server/blob/main/docs/frequently-asked-questions.md) 文档齐全），作者是 Grafana Labs 成员，社区热度在数据可视化 MCP 里靠前；具体 star/commit 时间**未能核实**。

---

## 3. "自然语言 → 图表"能力的具体实现方式

### 3.1 官方路线：生成的是"查询语句/面板 JSON"，不是库无关的图表配置

- **Query assistance（生成并精炼查询）**：官方云文档 [Generate and refine queries](https://grafana.com/docs/grafana-cloud/machine-learning/assistant/query-assistance/) 与 [Query data 指南](https://grafana.com/docs/grafana-cloud/machine-learning/assistant/guides/querying/) 说明：自然语言 → **PromQL / LogQL / SQL / 云数据源查询**，并支持多轮"精炼"（refine）。
- **OSS/Explore 侧**：启用 LLM 后可在 Explore 内以文本生成查询（"generate query from text"）；第三方/商业化镜像文档亦证实该形态，如阿里云 [PromQL 助手（PromQL 小工具）](https://help.aliyun.com/en/arms/observable-visualization-grafana-edition/how-to-use-the-promql-gadget)；官方博客 [How to explore metrics without PromQL queries](https://grafana.com/blog/how-to-explore-metrics-without-promql-queries-in-grafana/) 讲的是降低 PromQL 门槛的同类能力。
- **查询之上的新形态**：Grafana 12.2 引入 **LLM-powered SQL expressions**（[12.2 release blog](https://grafana.com/blog/grafana-12-2-release-all-the-latest-features/)、[SQL expressions Public Preview](https://grafana.com/whats-new/2025-09-05-sql-expressions-now-in-public-preview/)）——LLM 在"表达式/计算字段"里直接生成 SQL，属变换层内生成代码，非确定性编译。
- **看板层面**：Assistant 可"用 AI 把任意 JSON API 变成看板"（[Infinity 数据源 + Assistant 博客](https://grafana.com/blog/use-ai-to-turn-any-json-api-into-a-dashboard-in-minutes-with-the-infinity-data-source-and-grafana-assistant/)）——本质是生成 **Infinity 查询 + Grafana 面板配置**，仍然闭环在 Grafana 平台内。

### 3.2 grafana-llm-app 的架构（证据拼图）

- 仓库自我定位 "Plugin to easily allow LLM based extensions to grafana"（GitHub/生态站标题一致）。
- 它是一个 **app 类插件 + Go 后端**，作用是被其他 Grafana 插件依赖以获取 LLM 能力：OpenAI 兼容端点（OpenAI/Azure/Ollama 等）与 Anthropic（见 PR #751、dependabot 依赖）；对外发布 **Go module（`github.com/grafana/grafana-llm-app`，含 `llmclient` 等子包）**，即"可被插件代码 import 的 LLM 客户端库"。
- 其他插件文档页面（如 [marcusolsson 静态数据源插件文档里的 "LLM App and OpenAI"](https://grafana.com/docs/plugins/marcusolsson-static-datasource/latest/features/llm-app/)）显示：llm-app 在 Grafana 内注册的 LLM 能力可被普通数据源/面板调用（该例是用 LLM 处理静态数据源取回的数据）——**"把 LLM 当一种数据源能力注入查询流"** 是它的设计核心。
- **语义层/RAG 思路**：为让 LLM 知道"当前 Grafana 里有哪些指标/标签可查"，官方与社区实现都把 **Prometheus/遥测元数据（metric names、labels 等）采集并 embedding 进向量库**，作为查询生成时的上下文（对应观测领域常说的 semantic layer/RAG over telemetry；社区侧如 [Markaicode 的 Grafana RAG 架构文章](https://markaicode.com/architecture/grafana-rag-architecture/) 也按此模式描述）。向量存储与嵌入均在 llm-app 层做抽象，供上层功能共享。
- **关于 "statistics"**：多次检索**未能在官方 grafana-llm-app/Assistant 来源中定位到以 "statistics" 命名的独立功能**。最贴近的两种可能：(a) 查询生成中针对时间序列做"统计类查询"（均值/分位/异常统计）；(b) 2025-10 随 Assistant GA 发布的 **Assistant Investigations**（[GA 博客](https://grafana.com/blog/grafana-assistant-ga-assistant-investigations-preview/)、[新闻稿](https://grafana.com/press/2025/10/08/grafana-labs-revolutionizes-ai-powered-observability-with-ga-of-grafana-assistant-and-introduces-assistant-investigations/)）——由专门分析后端做统计/模式调查，LLM 只做编排与叙述。建议按 (a)/(b) 分别理解，若你手头有该词的具体出处可再定向核实。

### 3.3 社区插件实现

- **grafana-llmanalysis-app（tamcore）**：OpenAI 对话式问数据，输出对数据源的查询与分析；[grafana-operator.md](https://github.com/tamcore/grafana-llmanalysis-app/blob/master/docs/grafana-operator.md) 还设想"自然语言驱动 Grafana 操作"。仍是"NL → Grafana 查询/操作"范式。
- **vega-mcp-server（hydrosquall）**：与上面不同——它把 **Vega-Lite 声明式 spec 渲染成可交互 HTML** 放进 LLM 对话（MCP Apps）；LLM 产出声明式 spec，由确定性的 Vega-Lite 渲染器负责画图。这是调研对象里**唯一接近 ChartBrain "LLM 产出声明式 spec + 确定性渲染"** 的实现，但它**绑定 Vega-Lite 单一生态**，且是聊天内渲染，不是消费端 SDK 在业务应用里执行变换。

### 3.4 数据变换如何处理

- Grafana 的链路是 **查询 → DataFrames → 面板/可视化选项 → 渲染**；"变换"（transform）由用户或看板配置决定，可 LLM 生成表达式（12.2 SQL expressions），**但没有"LLM 产中立 spec → 确定性转换器 → 多图表库配置"这一抽象层**。
- 所有渲染、面板类型语义都与 Grafana 前端/插件系统耦合。

---

## 4. 不足 / 空白点（站在 ChartBrain 视角）

1. **强绑定 Grafana 平台**：全部能力依赖 Grafana 插件 API（backend plugin SDK）、数据源框架、前端面板系统；脱离 Grafana 实例即不可运行。
2. **绑定查询语言与遥测 schema**：上下文与输出都是 PromQL/LogQL/SQL + 指标名/标签；换一套数据语义（如业务 JSON、CSV）就要新造 prompt 与元数据采集。
3. **不产出库无关图表配置**：生成的是"查询语句 + 面板 JSON"，只对 Grafana 渲染器有效；不是 Highcharts/ECharts 等可移植的 spec。
4. **不能作独立中间件复用**：llm-app 只是 Grafana 插件宿主内的库/网关；Assistant 云版是 SaaS，self-managed 版也要求 Grafana 12.x + LLM 配置（见 [self-managed Assistant 文档](https://grafana.com/docs/grafana-cloud/machine-learning/assistant/self-managed/)）。
5. **"查询生成"路线本身难通用**：要执行环境、权限与真实数据；LLM 幻觉直接表现为错误查询/错误聚合——Grafana 靠工具边界与引用缓解（[信任博客](https://grafana.com/blog/grafana-assistant-why-you-can-trust-our-agent-and-yourself-in-an-era-of-ai-hallucinations/)、[Query data 指南](https://grafana.com/docs/grafana-cloud/machine-learning/assistant/guides/querying/)），但无法根治。
6. **社区 NL 插件生命周期短**：个人维护、版本跟进慢、文档不全，可借鉴思路但不宜作为依赖。
7. **统计语义薄弱**：llm-app 层的统计能力基本交给上层/专门后端；LLM 原生做数值统计不可靠。

---

## 5. 可借鉴的点

1. **把 LLM 能力做成 provider 无关的网关 + 客户端 SDK**：llm-app 的思路（OpenAI 兼容 + Anthropic + 可 import 的 Go module `llmclient`）值得 ChartBrain 借鉴——"LLM spec 服务"应支持多 provider、统一凭据管理与健康检查，消费端只依赖一个 SDK。
2. **元数据向量库做语义层，而不是全量塞 schema**：把"可用字段/指标/标签"embedding 进向量库供 RAG 检索（llm-app/Assistant 同款思路）；ChartBrain 可把"数据字段 schema + 目标图表库能力清单"作为上下文注入而非整段 prompt，省 token 且更准。
3. **多轮精炼（refine）交互**：Grafana query assistance 支持在生成后继续对话精炼；ChartBrain 的变换计划也可做成"生成 → 用户微调约束（维度/颜色/库偏好）→ 重生成"的闭环。
4. **LLM 产出声明式 spec 的可行性已被验证**：vega-mcp-server 证明"LLM 给声明式 spec、确定性渲染"在真实产品里好用；ChartBrain 更进一步：Highcharts/ECharts 配置命令式且发散，先产**轻量中性 spec 再确定性编译**正是对的路。
5. **可信边界与可审计设计**：Assistant 强调控制"哪些 API/数据可被查询"、给引用来源（[Assistant everywhere/可定制](https://grafana.com/blog/grafana-assistant-everywhere/)、[SDK/API 参考](https://grafana.com/docs/grafana-cloud/platform/grafana-assistant/reference/)）；ChartBrain 应保留 自然语言 → 中性 spec → 库配置 的全链路可预览/可 diff/可回滚，这是它能给企业客户的核心卖点。
6. **把统计/计算与 LLM 解耦**：真正的聚合、统计、异常检测用确定性代码/专门后端（对应 Assistant Investigations 的分工），LLM 只做意图解析与叙事——与 ChartBrain"LLM 产 spec/变换计划 + 确定性转换器执行"一致。
7. **MCP 是 2025+ 的新消费通道**：Grafana 官方在推 [MCP servers](https://grafana.com/docs/grafana-cloud/machine-learning/mcp/) 与面向编码代理的 [gcx](https://pkg.go.dev/github.com/grafana/gcx)；ChartBrain 未来可把"NL→spec"包装成 MCP 工具，但内部仍走中立 spec 以复用。

---

## 6. 帮我们避坑的点

1. **不要模仿"生成查询语句"作为通用中间层**：它绑定数据源/执行环境/权限，无法独立复用，且幻觉成本高。ChartBrain 让**真实数据由消费端提供、变换在消费端确定性执行**，天然绕开这一整类问题——务必保持这个边界。
2. **别被 Grafana 插件生态诱惑去实现 Grafana 插件**：插件 SDK 版本兼容、面板/数据源 API 演进、云版/OSS 功能分叉（llm-app Public Preview vs Assistant SaaS）都意味着高维护成本；如需演示对标，只做"Grafana 插件调 ChartBrain HTTP API"的薄适配层。
3. **不要让 LLM 直接产出 Highcharts/ECharts 配置**：这些库配置命令式、体积大、能力知识在模型里不准；必须"LLM → 中性 spec → 确定性转换器"（Grafana 直接产 PromQL/面板 JSON 的做法在这里恰恰是反例）。
4. **提示注入与输出校验**：自然语言里可能夹带指令，元数据里可能有脏标签；服务端对 LLM 产出的 spec/变换计划做 **schema 校验 + 字段白名单 + 类型约束**，防止越界字段与恶意类型流入转换器。
5. **元数据向量库会漂移**：指标/字段改名、库版本升级都会让 RAG 上下文过期；向量索引只能当提示辅助，**不能当权威 schema**，权威校验走代码。
6. **数值统计别交给 LLM**：聚合/分位/归一化用确定性代码；LLM 只出意图，否则结果不可复现（Grafana 也是把统计类调查放到专门后端）。
7. **"生成图表 vs 生成看板"要分清**：很多对标产品做的是"NL → 一整块看板/报表"，复杂度高且评估主观；ChartBrain 聚焦**单图表 spec + 变换计划**更易验证与落地。
8. **警惕社区项目"看起来能用"**：grafana-llmanalysis-app 这类个人插件在数据源版本变化后迅速失效；做技术选型评估时以官方文档/仓库 issue 新鲜度为先，不要以第三方目录站描述为准。

---

## 7. 引用来源列表

**官方仓库与包**
- https://github.com/grafana/grafana-llm-app
- https://github.com/grafana/grafana-llm-app/releases
- https://github.com/grafana/grafana-llm-app/pull/751
- https://github.com/grafana/grafana-llm-app/issues/377
- https://pkg.go.dev/github.com/grafana/grafana-llm-app@v0.6.4
- https://pkg.go.dev/github.com/grafana/grafana-llm-app@v0.4.0
- https://deps.dev/go/github.com%2Fgrafana%2Fgrafana-llm-app%2Fllmclient/v0.20.0
- https://github.com/grafana/grafana-llm-app/blob/main/README.md
- https://github.com/fabianbaier/grafana-llm-app（README：https://github.com/fabianbaier/grafana-llm-app/blob/main/README.md ；https://raw.githubusercontent.com/fabianbaier/grafana-llm-app/refs/heads/main/README.md）
- https://github.com/tamcore/grafana-llmanalysis-app
- https://github.com/tamcore/grafana-llmanalysis-app/blob/master/docs/grafana-operator.md
- https://github.com/hydrosquall/vega-mcp-server
- https://github.com/hydrosquall/vega-mcp-server/blob/main/README.md
- https://github.com/hydrosquall/vega-mcp-server/blob/main/docs/frequently-asked-questions.md
- https://github.com/pradeeppai/mcp-grafana ；https://github.com/Filip-Stastny-Philips/mcp-grafana-debug

**官方插件目录与文档**
- https://grafana.com/grafana/plugins/grafana-llm-app/
- https://grafana.com/plugins/grafana-ml-app/latest/（LLM plugin 文档入口）
- https://grafana.com/docs/plugins/marcusolsson-static-datasource/latest/features/llm-app/
- https://grafana.com/grafana/plugins/consensys-asko11y-app/
- https://grafana.com/grafana/plugins/grafana-advisor-app/

**Grafana Assistant（产品/文档/博客）**
- https://grafana.com/docs/grafana-cloud/machine-learning/assistant/query-assistance/
- https://grafana.com/docs/grafana-cloud/machine-learning/assistant/guides/querying/
- https://grafana.com/docs/grafana-cloud/machine-learning/assistant/introduction/
- https://grafana.com/docs/grafana-cloud/machine-learning/assistant/self-managed/
- https://grafana.com/docs/grafana-cloud/platform/grafana-assistant/
- https://grafana.com/docs/grafana-cloud/platform/grafana-assistant/reference/
- https://grafana.com/docs/grafana/latest/administration/assistant/
- https://grafana.com/docs/learning-hub/intro-to-grafana-assistant/01-intro/02-what-is-assistant/
- https://grafana.com/blog/llm-grafana-assistant/
- https://grafana.com/blog/grafana-assistant-ga-assistant-investigations-preview/
- https://grafana.com/whats-new/2025-10-08-grafana-assistant-is-now-generally-available/
- https://grafana.com/press/2025/10/08/grafana-labs-revolutionizes-ai-powered-observability-with-ga-of-grafana-assistant-and-introduces-assistant-investigations/
- https://grafana.com/blog/grafana-assistant-why-you-can-trust-our-agent-and-yourself-in-an-era-of-ai-hallucinations/
- https://grafana.com/blog/grafana-assistant-everywhere/
- https://grafana.com/blog/going-beyond-ai-chat-response-how-were-building-an-agentic-system-to-drive-grafana/
- https://grafana.com/blog/smarter-onboarding-and-planning-with-grafana-assistant-how-to-ensure-observability-is-baked-in-from-the-start/

**MCP / 路线图 / 发布**
- https://grafana.com/docs/grafana-cloud/machine-learning/mcp/
- https://grafana.com/docs/grafana-cloud/machine-learning/mcp/developer/observability-metrics-and-tracing/
- https://grafana.com/docs/grafana/next/developer-resources/mcp/
- https://grafana.com/blog/llm-powered-insights-into-your-tracing-data-introducing-mcp-support-in-grafana-cloud-traces/
- https://grafana.com/whats-new/2025-08-08-access-tracing-data-using-mcp-server-in-grafana-cloud-traces/
- https://pkg.go.dev/github.com/grafana/gcx
- https://grafana.com/blog/grafana-12-2-release-all-the-latest-features/
- https://grafana.com/whats-new/2025-09-05-sql-expressions-now-in-public-preview/
- https://grafana.com/blog/how-to-explore-metrics-without-promql-queries-in-grafana/
- https://grafana.com/whats-new/2024-04-09-explore-metrics/
- https://grafana.com/press/2025/05/07/grafana-labs-demonstrates-open-source-leadership-at-grafanacon-2025/
- https://grafana.com/blog/observabilitycon-2025-announcements/
- https://grafana.com/press/2026/04/21/grafana-labs-targets-the-ai-blind-spot-with-new-observability-tools-announced-at-grafanacon-2026/
- https://grafana.com/blog/grafanacon-2026-announcements/
- https://grafana.com/blog/ai-week-recap/
- https://grafana.com/blog/use-ai-to-turn-any-json-api-into-a-dashboard-in-minutes-with-the-infinity-data-source-and-grafana-assistant/
- https://grafana.com/blog/how-to-use-ai-to-analyze-and-visualize-can-data-with-grafana-assistant/
- https://grafana.com/blog/grafana-llm-plugin-updates-choose-the-large-language-models-and-providers-that-work-best-for-you/
- https://grafana.com/grafana/plugins/grafana-metricsdrilldown-app/

**第三方佐证/教程**
- https://help.aliyun.com/en/arms/observable-visualization-grafana-edition/how-to-use-the-promql-gadget （及 zh：https://www.alibabacloud.com/help/zh/grafana/use-cases/how-to-use-the-promql-chatbot）
- https://dev.to/pickuma/ai-powered-observability-querying-telemetry-in-plain-english-33bi
- https://github.com/trushashah14/30-Days-of-AI-in-Devops-SRE-Challenge-/blob/main/Dayy%2018%20-%20Natural-Language%20Dashboard%20Queries/Step-by-Step-Solution.md
- https://dev.classmethod.jp/articles/grafana-assistant/
- https://markaicode.com/architecture/grafana-rag-architecture/
- https://github.com/WoodProgrammer/prometheus-llm-proxy
- https://skill4agent.com/en/skill/grafana-skills/ml-ai
