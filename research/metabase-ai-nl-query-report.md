# Metabase AI / 自然语言查询能力调研报告（面向 ChartBrain 复用评估）

> 调研方式：web_search 检索 GitHub / metabase.com / docs 官方来源及权威镜像（metabase.net.cn 为官方文档中文镜像），辅以独立第三方评测。沙箱无外网直连，个别细节只能依据页面标题与摘要，已在文中用「（推断）」标注，落地前请以原文页复核。
> 调研时点：2026 年中（Metabase 已发到 v60/61/62，v63 处于开发中）。

---

## 1. 项目名 + GitHub URL + 一句话定位

- 项目：**Metabase**
- GitHub：https://github.com/metabase/metabase
- 定位：AGPL 开源的现代 BI 平台（Clojure 后端 + React/TS 前端单体仓库），面向非技术用户提供「问问题（NL）→ 出报表/图表 → 上仪表板」的自助式分析；其 AI 助手叫 **Metabot**。
- 相关 AI 体系（本报告主线）：Metabot（AI 探索/问答助手）、AI SQL 生成、官方 MCP Server、语义层（Models / Metrics / Segments）、Data Studio（语义层编辑工具）。

## 2. 维护状态

- **高度活跃、社区体量顶级**：star 数量级约 **5 万**（第三方统计站显示 49k、全球排名约 #501，见 https://www.star-history.com/metabase/metabase/ ）。
- 发版节奏极快：产品版本从 2024 年的 v52 一路到 2026 年的 v60/v61/v62，v63 已在开发中。官方 release 页：https://www.metabase.com/releases 。（第三方 changelog 记录 v60 发布于 2026-05 前后：https://www.clever.cloud/developers/changelog/2026/05-12-metabase-60/ ）
- 仓库仍在高频提交，近期 PR 编号已达 8 万量级，且 AI 相关代码/文档全部开源在主分支（如 https://github.com/metabase/metabase/blob/master/docs/ai/metabot.md 、PR #80150 目标 v63：https://github.com/metabase/metabase/pull/80150 ）。
- 结论：活跃维护，社区版（OSS）+ 商业版（Pro/Enterprise/Cloud）并行的经典开源商业模式。

## 3. 自然语言 → 图表能力的具体实现

### 3.1 链路总览（自下而上）
架构上仍是传统 BI：**NL 问题 →（Metabot/LLM）生成查询（SQL 或 MBQL）→ 数据库执行 → 结果数据回 Metabase → 前端自动/手工选图渲染 → 可存为 Question、拼进 Dashboard、推到 Slack**。LLM 并不直接产出「跨图表库的图表配置文件」，它产出的是「查询 + 数据」，可视化由 Metabase 自家前端完成。

官方 AI 能力全景（按版本演进）：
- v57：正式引入「新版 AI 助手」Metabot（第三方报道：https://devbytes.co.in/news/metabase-v57-is-here-with-dark-mode-and-a-new-ai-assistant ）
- v59：**开源版 AI SQL 生成** + Data Studio 语义层工作台（https://metabase.net.cn/releases/metabase-59 、https://www.metabase.com/changelog/59 ）
- v60：**把 AI 功能开源化** + 官方 MCP Server + Slack 版 Metabot + 分屏图表 + 指标浏览器（https://dev.to/metabase/metabase-60-we-made-ai-open-source-official-mcp-server-metabot-in-slack-split-panel-charts-and-3eb0 、https://www.metabase.com/releases/metabase-60 、官方博客 https://www.metabase.com/blog/ai-for-everyone-with-confidence ）。该博客是与 v60 同步发布的旗舰宣言：「AI for everyone, with confidence」= 把 AI 开放给所有用户/版本，并把「可信/可控」作为卖点——官方叙事从「AI 能力」转向「权限 + 治理 + 审计带来的信心」（标题主旨推断，镜像/转载：https://metabase.net.cn/blog/ai-for-everyone-with-confidence 、https://www.diff.blog/post/ai-for-everyone-with-confidence-386485/ ）。
- v61：**AI 治理**（访问控制、Token 限额、Metabot 定制、用量分析）+ MCP 可「构建 Question/Dashboard」（https://dev.to/metabase/metabase-61-ai-fun-police-build-questions-and-dashboards-with-mcp-and-much-more-4850 、https://metabase.net.cn/releases/metabase-61 ）
- v62：自定义可视化、AI 客户端中的图表、Metabase CLI 等（https://metabase.net.cn/releases/metabase-62 ）
- v63 方向：LLM context 查询也要走「用户感知的数据库访问」权限（https://github.com/metabase/metabase/pull/80150 ）

### 3.2 text-to-SQL：单次调用（Single Shot）方案
- 任务点名的 PR #67883「Metabot OSS Single Shot Text-2-Sql」（作者 tsplude，Metabase AI 团队成员）：https://github.com/metabase/metabase/pull/67883 。它把 Metabot 的 text-to-SQL 做成 **OSS 单次调用**：不搞多步 agent 循环，而是把上下文一次性塞进单个 LLM 请求、直接产出 SQL（推断：这是为把此前 Cloud/EE 的多轮 Metabot 流程收敛为可自托管、低成本、低延迟的 OSS 实现，PR 标题即为此意）。
- 后续演化佐证：同一团队做了「Metabot with Search 2.0」（#62067）、「BE support for dynamic agent profiles」（#62544）、「via ai proxy w/o API key」（#71714，即 OSS 部署可接自有代理而无需在 Metabase 配 key）、「Anthropic prompt caching」（#72851）、「Claude Sonnet 5 支持」（#76756）、「Z.AI provider」（#78521）——可见 OSS 里已形成 **provider 抽象 + 单请求 + prompt 缓存** 的工程形态。

### 3.3 语义层如何喂给 LLM
- 官方把 **Models（数据模型）/ Metrics（指标）/ Segments（分段）** 定位为 Metabase 的「语义层」：https://www.metabase.com/features/semantic-layer 、https://www.metabase.com/features/models ；v59/v60 用 **Data Studio** 来策展这层（https://www.metabase.com/blog/meet-data-studio-semantic-layer ）。
- 喂 LLM 的方式（代码级佐证）：
  - PR #67368「Support measures and segments for Metabot」：https://github.com/metabase/metabase/pull/67368
  - PR #71656「[metabot] add repr for measures and segments」：https://github.com/metabase/metabase/pull/71656 —— 给 measure/segment 增加**文本表示（repr）**，正是把语义对象转成 prompt 上下文的机制。
- 按官方文档（docs/ai/metabot.md，https://github.com/metabase/metabase/blob/master/docs/ai/metabot.md ）的表述框架：Metabot 的可见范围是**受数据权限约束的元数据**——表/字段名与描述、Models、Metrics、用户可见的已保存 Question 等，而非整表原始数据；基于这些「可读语义摘要 + 少量 schema」做单次生成（推断细节：具体上下文拼装规则以仓库源码与 docs/ai/settings.md 为准：https://www.metabase.com/docs/latest/ai/settings ）。
- 对 ChartBrain 的启示点：Metabase 走的路线是「**用语义对象的有损文本摘要代替完整 schema/数据**」喂给 LLM——这正是控制 token、防幻觉的关键动作，且有专门 PR 持续打磨这些 repr 的质量。

### 3.4 图表生成链路
- Metabot/OSS AI 的产物是「可执行的查询（SQL/MBQL）+ 结果」，随后：在 Web 端渲染为表格/图表（可继续存为 Question 或加到 Dashboard）；Slack 端直接把结果/图表推到频道（docs/ai/metabot-slack.md：https://github.com/metabase/metabase/blob/master/docs/ai/metabot-slack.md 、https://www.metabase.com/docs/latest/ai/metabot-slack ）；MCP 场景把能力暴露给 Claude/Cursor 等外部 agent（官方 MCP 文档：https://www.metabase.com/docs/latest/ai/mcp ）。
- **它不做「库无关图表 spec」**：视觉层由 Metabase 前端负责（v62 的「AI 客户端中的图表 / 自定义可视化」仍在 Metabase 渲染体系内）。聚合/变换几乎全部以 SQL 形式发生在数据库端，前端只做视觉映射。
- LLM 方案演化（自带/BYOK/闭源转开源）：先 Cloud/EE 内托管（默认 Anthropic Claude），随 v59→v60 开源化后，自托管 OSS 用户可 **BYOK / 自配代理**（docs/ai/settings.md、PR #71714），provider 支持 Anthropic、OpenAI 兼容、Z.AI 等（PR #76756/#78521）。AI 功能从闭源（付费）到开源（v60）的时间线见第 3.1 节各 release 链接。

### 3.5 能力边界的一手文档：docs/latest/ai/start（"AI in Metabase"）及文档族
- 官方文档站入口 **"AI in Metabase"**：https://www.metabase.com/docs/latest/ai/start ，即 OSS 仓库 [docs/ai/start.md](https://github.com/metabase/metabase/blob/master/docs/ai/start.md)（另有同族 overview 页 https://www.metabase.com/docs/latest/ai/overview ↔ 仓库 docs/ai/overview.md ↔ 中文镜像「Metabase 中的 AI 概览」https://metabase.net.cn/docs/latest/ai/overview ）。**这是理解 Metabot/AI 当前能力边界的关键一手入口。**
- 从该文档族（start / overview / metabot / metabot-slack / mcp / settings / usage-controls）可拼出的能力边界（推断，具体条目以原文页复核）：
  1. **覆盖哪些 AI 能力与入口**：Metabot 的 NL 问答（Web 内嵌、Slack、MCP/API 客户端）、Native（SQL）编辑器里的 AI SQL 生成、对 Question/Dashboard 的解释与摘要，以及 AI 治理下的用量控制。
  2. **依赖什么、在哪配置**：需要把 Metabase 接到 LLM（默认 Anthropic；OSS 自托管为 BYOK/自配代理，见 docs/ai/settings 与 PR #71714）；AI settings 集中配置。不同版本（OSS/Pro/Enterprise/Cloud）可用功能集合不同，治理类能力（访问控制、token 限额、用量分析）主要在 v61 起面向付费版/Cloud。
  3. **信任边界**：AI 回答受既有数据权限约束、基于语义层（Models/Metrics/Segments）与 schema 元数据，而非原始行数据；官方还**公开了实际使用的 system prompts**：https://www.metabase.com/docs/latest/ai/system-prompts ——把「喂给 LLM 的指令」透明化，是可复刻/审计其做法的珍贵一手材料。
- 对 ChartBrain 的价值：这套文档是「NL 查询产品对外承诺什么、不承诺什么」的现成蓝本——system prompts 文档化、能力/版本矩阵化、信任边界声明化，都值得 ChartBrain 在对外文档里对应设计（透明提示词、能力矩阵、权限与局限声明）。

## 4. 不足 / 空白点（站在 ChartBrain 视角）

1. **强平台绑定，无法作独立中间件复用**：Metabot/OSS AI 深嵌 Metabase 平台——依赖其数据库连接、权限/沙箱体系、MBQL、自带渲染器。没有 Metabase 实例（或至少其语义层与查询执行层）就无法独立运行；它输出的 SQL 也只能在它接的那些数据库上执行。
2. **库无关性 = 无**：输出是「SQL + 结果数据」，不产出可移植到 Highcharts/ECharts 的配置；选图与样式由 Metabase 前端决定。ChartBrain 的「中性 spec + 声明式变换计划 + 确定性转目标库配置」在其架构里不存在对应物。
3. **数据变换/聚合发生在数据库 SQL 层**：聚合（含 Metrics 定义的聚合）、筛选、JOIN 全部落成 SQL 由数据库执行；图表整形（排序、取 top-N、堆叠、坐标轴）没有抽成声明式、可审计、库无关的中间表示——这正是 ChartBrain 与它的本质差异点与可差异化空间。
4. **权限与可信度是平台红利而非可移植能力**：Metabot 之所以「敢」放权给 LLM，是因为查询执行被 Metabase 既有行级权限/沙箱包住（且 v61 治理、v63「user-aware database access」仍在补 MCP/context 查询的权限洞）。一旦脱离 Metabase，这套信任模型不成立；ChartBrain 若做成通用服务，权限过滤必须自己设计与服务端执行。
5. **单机/单服务假设**：语义层、问题库、权限都在一个 Metabase 实例内；跨租户、跨图表库、纯 API 化、事件驱动变换（消费端已有数据的重排/变换）等场景它不覆盖。
6. 独立第三方也指出其结构性天花板：AI 能力受限于 BI 内建的 schema 策展与查询范式（https://www.definite.app/blog/metabase-ai 、机制科普 https://letdataspeak.com/metabase-ai-features/ ）。

## 5. 我们可以借鉴的点

- **语义对象 = NL 的锚，且要专门做「喂 LLM 的 repr」**：Metabase 用 Models/Metrics/Segments 的文本表示进 prompt（PR #67368/#71656），而非裸 schema。ChartBrain 可定义自己的中性语义对象（指标定义、维度、图表意图、声明式变换），并把 repr 质量当产品来打磨。
- **Single-shot + 受控上下文 + prompt 缓存**（PR #67883 + #72851）：单次调用降低延迟/成本/漂移，把确定性放在 LLM 之外。ChartBrain「LLM 只出 spec+变换计划、转换器确定性执行」与此同构且更彻底。
- **权限前置、执行期强制**：v63 PR #80150 明确 context 查询也要 user-aware——即「喂给 LLM 的内容」和「真正能查到的数据」都要按用户过滤，教训可内化为 ChartBrain 服务端对数据的强制过滤钩子。
- **能力分阶段开源**：SQL 生成 → 问答助手 → Slack → MCP → 构建仪表板，一步一收敛再外扩；ChartBrain 也可先只做「NL→受控 spec→转换」单环，再逐步开放 agent 能力。
- **用 MCP 暴露能力 + dashboards as code**：把服务能力工具化、可审计化（61 的仪表板即代码），便于被 Claude/Cursor 等消费。

## 6. 帮我们避坑的点（含官方教训）

- **别让 LLM 看见它不该查的数据**：Metabase 官方把「权限内可见」当作 Metabot 的设计红线（docs/ai/metabot.md），但仍出现需要专门 PR 修补的洞（v61 AI 治理、v63 让 LLM context 查询走 user-aware 访问），说明 NL 服务的权限面要当一等安全问题反复审计，**不能假设「提示词里不写 = 不会发生」**。
- **无策展的语义层会放大幻觉**：官方专门推出 Data Studio 来「策展」语义层（https://www.metabase.com/blog/meet-data-studio-semantic-layer ），第三方分析也把「schema/语义缺乏维护」列为天花板（https://www.definite.app/blog/metabase-ai ）——对 ChartBrain：字段/指标/图表映射的元数据必须人可维护、可版本化，否则 LLM 在脏语义上生成再准也没用。
- **agent 环境是混乱的，要为混乱而设计**：官方博客标题即「Lessons learned from building AI analytics agents: build for chaos」：https://www.metabase.com/blog/lessons-learned-building-ai-analytics-agents/ （中文镜像：https://metabase.net.cn/blog/lessons-learned-building-ai-analytics-agents ）。主旨推断：结构、重试、兜底、可观测性优先于「让模型更聪明」；不要做会自己乱跑的开放性循环。ChartBrain 的确定性转换器正是对这种教训的正面回应——但要防 **spec 幻觉**（字段名不存在、聚合语义错、时间粒度歧义、单位错误），需 schema 校验 + 结果往返校验 + 白名单化高频图表类型。
- **成本与用量治理要前置**：官方为此单开 usage-controls（docs/ai/usage-controls.md：https://github.com/metabase/metabase/blob/master/docs/ai/usage-controls.md ）与 v61 的 token 限额/用量分析，说明裸奔的 NL 服务会被 token 成本与滥用打爆。
- **不要把「生成结果」和「执行结果」混为一谈**：Metabot 的提问默认在 Metabase 里跑真查询；对 ChartBrain，输出 spec 前最好让用户/系统预知「将执行哪些变换与聚合」，并对超大结果集设防（生成一个会扫全表的聚合计划等于把消费端打挂）。
- **宣传口径谨慎**：Metabase 官方以「confidence / 可信、可治理」作为 AI 卖点（https://www.metabase.com/blog/ai-for-everyone-with-confidence ），对应的是大量权限/审计工程投入，而非模型能力本身——我们对外叙事也应把信任建立在「确定性转换 + 权限 + 审计」而非「LLM 很聪明」上。

---

## 7. 引用来源清单（全部 URL）

官方（GitHub / metabase.com / 官方中文镜像 metabase.net.cn）：
- https://github.com/metabase/metabase
- https://www.star-history.com/metabase/metabase/ （star 统计）
- https://www.metabase.com/releases
- https://www.metabase.com/releases/metabase-60
- https://metabase.net.cn/releases/metabase-59
- https://www.metabase.com/changelog/59
- https://metabase.net.cn/releases/metabase-60
- https://metabase.net.cn/releases/metabase-61
- https://metabase.net.cn/releases/metabase-62
- https://dev.to/metabase/metabase-60-we-made-ai-open-source-official-mcp-server-metabot-in-slack-split-panel-charts-and-3eb0
- https://dev.to/metabase/metabase-61-ai-fun-police-build-questions-and-dashboards-with-mcp-and-much-more-4850
- https://www.metabase.com/blog/ai-for-everyone-with-confidence
- https://metabase.net.cn/blog/ai-for-everyone-with-confidence （中文镜像）
- https://www.diff.blog/post/ai-for-everyone-with-confidence-386485/ （转载）
- https://www.metabase.com/blog/lessons-learned-building-ai-analytics-agents/
- https://metabase.net.cn/blog/lessons-learned-building-ai-analytics-agents
- https://www.metabase.com/blog/meet-data-studio-semantic-layer
- https://github.com/metabase/metabase/pull/67883 （Metabot OSS Single Shot Text-2-Sql）
- https://github.com/metabase/metabase/pull/67368 （Support measures and segments for Metabot）
- https://github.com/metabase/metabase/pull/71656 （[metabot] add repr for measures and segments）
- https://github.com/metabase/metabase/pull/71714 （metabot via ai proxy w/o api key）
- https://github.com/metabase/metabase/pull/72851 （Anthropic prompt caching）
- https://github.com/metabase/metabase/pull/76756 （Claude Sonnet 5 support）
- https://github.com/metabase/metabase/pull/78521 （Add Z.AI metabot provider）
- https://github.com/metabase/metabase/pull/80150 （[v63] Run LLM context queries with user-aware database access）
- https://github.com/metabase/metabase/pull/62067 、https://github.com/metabase/metabase/pull/62544 （Metabot Search 2.0 / dynamic agent profiles）
- https://github.com/metabase/metabase/blob/master/docs/ai/start.md （"AI in Metabase" 源文档）
- https://github.com/metabase/metabase/blob/master/docs/ai/metabot.md
- https://github.com/metabase/metabase/blob/master/docs/ai/metabot-slack.md
- https://github.com/metabase/metabase/blob/master/docs/ai/settings.md
- https://github.com/metabase/metabase/blob/master/docs/ai/overview.md
- https://github.com/metabase/metabase/blob/master/docs/ai/usage-controls.md
- https://www.metabase.com/docs/latest/ai/start （"AI in Metabase" 文档站入口）
- https://www.metabase.com/docs/latest/ai/overview
- https://www.metabase.com/docs/latest/ai/system-prompts （官方公开的 AI system prompts）
- https://www.metabase.com/docs/latest/ai/metabot
- https://www.metabase.com/docs/latest/ai/metabot-slack
- https://www.metabase.com/docs/latest/ai/mcp
- https://www.metabase.com/docs/latest/ai/settings
- https://metabase.net.cn/docs/latest/ai/mcp 、https://metabase.net.cn/docs/latest/ai/metabot-slack 、https://metabase.net.cn/docs/latest/ai/settings 、https://metabase.net.cn/docs/latest/ai/overview
- https://www.metabase.com/features/metabot-ai
- https://www.metabase.com/features/metabase-ai
- https://www.metabase.com/features/models
- https://www.metabase.com/features/semantic-layer
- https://metabase.net.cn/features/semantic-layer
- https://deepwiki.com/metabase/metabase/7.4-ai-features-and-agent-api （AI Features & Agent API 代码导读，第三方）

第三方报道 / 评测：
- https://devbytes.co.in/news/metabase-v57-is-here-with-dark-mode-and-a-new-ai-assistant
- https://www.clever.cloud/developers/changelog/2026/05-12-metabase-60/
- https://www.pursuittechnology.co.uk/metabase-april-26-update/
- https://www.definite.app/blog/metabase-ai （结构性限制评析）
- https://letdataspeak.com/metabase-ai-features/ （机制科普）
- https://github.com/metabase/metabase/issues/44214 （Integrate Metabase with AI models 议题）
