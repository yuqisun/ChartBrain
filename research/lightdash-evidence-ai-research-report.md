# Lightdash 与 Evidence.dev 的 AI / 自然语言 / 图表生成能力调研报告（面向 ChartBrain 复用评估）

> 调研方式：web_search 检索 GitHub / 官方 docs / 官方 blog / changelog 及权威第三方评测。本沙箱无法直连外网，无法逐字打开页面正文，个别细节只能依据页面标题、URL 路径与搜索摘要；凡属推断或未能从摘要直接证实的内容，均用 **（推断）** 或 **（需核实）** 标注，落地决策前请以原文页复核。
> 调研时点：2026-03（Lightdash 仓库仍在高频发版：PR #21036 于 2026-03-11 合并）。

---

# 第一部分：Lightdash（Agentic BI）

## 1. 项目名 + GitHub URL + 一句话定位

- 项目：**Lightdash**
- GitHub：https://github.com/lightdash/lightdash
- 定位：**dbt 原生的开源 BI 平台**，当前官方自我定位已改为 **"Agentic BI. Analytics at the speed of code"**（仓库标语，见 GitHub 页摘要）；围绕 dbt 语义层（metrics/dimensions YAML）提供自助式探索、图表、仪表板，并把 LLM 以「AI agents」形态嵌入整条「查数 → 出图 → 解释 → 写回」链路。

## 2. 维护状态

- **非常活跃，商业化正盛**：
  - 2026-03 仍有持续合并的 PR（版本 0.2607.0 的 compare 出自 2026-03-11 的 PR #21036：https://github.com/lightdash/lightdash/pull/21036 ）；第三方发版追踪可见 2.16.0（https://newreleases.io/project/github/lightdash/lightdash/release/2.16.0 ）。
  - 产品 changelog 高频更新，其中大量条目与 AI 相关（如「Describe a chart type, Lightdash builds it」：https://changelog.lightdash.com/describe-a-chart-type-lightdash-builds-it-341612 ）。
  - 2024-10 获得 Accel 投资、主打「把 AI 带进 BI」（TechCrunch：https://techcrunch.com/2024/10/08/open-source-bi-platform-lightdash-gets-accels-backing-to-bring-ai-to-business-intelligence/ ；Yahoo Finance 转载：https://au.finance.yahoo.com/news/open-source-bi-platform-lightdash-080000402.html ）。
  - star 数量级：约 **1 万上下**（第三方 BI 榜单常将其列为 dbt/开源 BI 头部项目，dbt topic 页按 star 排序可查到它：https://repos.ecosyste.ms/hosts/GitHub/topics/dbt?order=desc&sort=stargazers_count ；精确值本次无法直连 GitHub 核验，请以仓库页为准）。
- 结论：**活跃维护**，OSS 仓库 + 云产品双轨，且 AI 是当前主推路线。

## 3. 自然语言 → 图表能力的具体实现

LLM 在 Lightdash 里不止用在一层，而是铺在整条 BI 链路上（官方概览「Using AI with Lightdash」：https://docs.lightdash.com/guides/ai-overview ；选型指南：https://docs.lightdash.com/guides/choosing-ai-workflow ）：

- **查数层（核心）：Agent 式 text-to-SQL，但被语义层约束**。
  - 主产品「AI agents」是类 chat 的多步 agent：提问 → 经语义层（dbt 里定义的 metrics/dimensions）生成查询 → 在你的数据仓库执行 → 把结果做成图/仪表板（https://docs.lightdash.com/agents 、https://docs.lightdash.com/agents/use-ai-agents ）。
  - 关键治理机制 **"agent SQL scope"**：可以限定 agent 只能访问哪些 metrics/维度/字段，甚至有 API 可动态读取/更新该范围（https://docs.lightdash.com/api-reference/projects/get-agent-sql-scope 、https://docs.lightdash.com/api-reference/projects/update-agent-sql-scope ）。即：**不是裸 text-to-SQL，而是「语义层白名单内的 SQL 生成」**。
- **出图层：LLM 生成「图表」，而不是只给数据**。changelog 明确宣传「Describe a chart type, Lightdash builds it」（用户用自然语言描述图类型，Lightdash 帮你建出来，见上 URL）——说明 LLM 参与选择图表类型并写图表定义。
- **解释/写回层（Beta）**：AI writeback 可把 agent 产出写回仓库（https://docs.lightdash.com/agents/ai-writeback ）；另有 Self-improvement（Beta，https://docs.lightdash.com/guides/ai-agents/self-improvement ）与 Deep research（多步研究型任务，https://docs.lightdash.com/agents/deep-research 、API：https://docs.lightdash.com/api-reference/start-deep-research-run ）。
- **AI coding agent（Beta）**：面向开发者的 coding agent，仓库里甚至自带 `skills/developing-in-lightdash/` 技能包与图表编写参考文档（如 cartesian-chart-reference.md：https://github.com/lightdash/lightdash/blob/main/skills/developing-in-lightdash/resources/cartesian-chart-reference.md ），即把「如何在 Lightdash 里建图」的结构化知识喂给 coding agent（https://docs.lightdash.com/agents/ai-coding-agent ）。
- 文档站提供 llms.txt（为 LLM 检索优化的文档入口：https://docs.lightdash.com/llms.txt ）（推断：面向 agent 的文档可发现性设计）。

**图表配置如何描述（重要）**：Lightdash 的图是「查询（SQL 结果）+ 图表配置」：常规图类型用自家 JSON 配置；并支持 **custom project charts / custom charts——直接透传 ECharts 配置**（https://docs.lightdash.com/explore/chart-types/custom-project-charts 、https://docs.lightdash.com/references/chart-types/custom-charts ）；仓库 issue #1020 标题即为「Create custom echarts」（https://github.com/lightdash/lightdash/issues/1020 ），可视化引擎就是 ECharts。前端/后端共享 TS 包（第三方 npm 镜像可见 `@lightdash/common` 内含 visualization 指南：https://tessl.io/registry/tessl/npm-lightdash--common/0.2231.5/files/docs/guides/visualization.md ）（推断：图表定义在前后端以共享 TS/JSON 类型描述，避免两端漂移）。

## 4. 不足 / 空白点（ChartBrain 视角）

- **深度绑定 dbt + SQL 数据仓库**：语义层必须来自 dbt 项目的 metrics YAML（https://docs.lightdash.com/integrations/dbt 、https://docs.lightdash.com/semantic-layer 、https://docs.lightdash.com/get-started/build-your-semantic-layer ）。没有 dbt + 数据仓库，Lightdash 的 agent 就没有「腿」。
- **不是库无关的中间件**：它是完整平台（自有后端 + React 前端 + 授权/权限体系 + 云）。图表配置是 **Lightdash/ECharts 特定**的，不会产出「面向任意前端图表库的中性 spec」；消费端不可能只拿一个 TS SDK 在自家页面渲染。
- **变换/聚合完全在 SQL 侧**：聚合与变换由语义层编译成 SQL 在仓库执行（语义层文档提到 sql filter / pre-aggregates：https://docs.lightdash.com/semantic-layer ）。因此它天然要求你有能跑 SQL 的数据栈，也无法处理「真实数据在浏览器端、做声明式变换」这类 ChartBrain 场景。
- **agent 能力与权限/成本模型紧耦合**：agent SQL scope、额度等都是其平台治理的一部分，不能单独拆出来复用。
- **第三方生态的 MCP server**（如 https://glama.ai/mcp/servers/poddubnyoleg/lightdash_mcp/tools/run-chart-query 提供 run-chart-query 等工具）说明「把 BI 能力暴露给 LLM」需求真实存在，但该 MCP 是社区项目而非官方核心（需核实其维护度）。

## 5. 我们可以借鉴的点

- **「语义层白名单内的 text-to-SQL / 查询 scope」的治理思路** → ChartBrain 可类比为「变换计划白名单」：LLM 只允许产出受约束的声明式变换/图表类型组合，杜绝任意代码/SQL 注入。
- **skill/知识文件（chart reference）喂 agent**：他们给 coding agent 提供结构化图表编写规范（见 3.）——与 ChartBrain「用确定性子集约束 LLM 输出」思路同构：把「合法图表语法」固化成文档/模式，而不是让 LLM 自由发挥。
- **NL →（查数）+（选图/定义图）两步都被 agent 覆盖**：印证「LLM 生成图表定义 + 数据真实结果」这一交互范式可行且用户买单。
- **文档 llms.txt / agent-ready 文档**：面向 LLM 的可发现性设计，值得 ChartBrain 文档站照做。
- **共享 TS 类型前后端同源描述图表定义**（推断，见 3.）：避免「服务端产出 schema 与客户端渲染库不一致」——与 ChartBrain spec+adapter 的一致性诉求一致。

## 6. 帮我们避坑的点

- **别把「查数」做成裸 text-to-SQL**：Lightdash 都要靠语义层 + SQL scope 兜底；ChartBrain 若允许 LLM 直接生成聚合逻辑，至少要 schema 约束 + 只读/纯函数变换，否则无法落地到任意消费端。
- **图表配置耦合具体库会阻碍复用**：Lightdash 自己也被 ECharts 绑住（custom charts 本质是 echarts 透传），证明「LLM 直接产 ECharts 配置」这条路只能服务单库用户。ChartBrain 的「中性 spec + 确定性转换器」正是解耦点，别学他们把 spec 做成库方言。
- **agent 编辑代码（AI coding agent / writeback）是高风险面**：Beta 期且面向开发者，生产环境需要 review/CI；若 ChartBrain 让 LLM 直接改消费端代码，必须提供可 diff、可回滚的产物形态。
- **平台级授权/成本治理很重**：agentic BI 一旦要规模化，RLS/scope/限额是标配，不是可选项——在设计 API 时就应预留 scope 参数（即使 V1 不做）。
- **先确认 star/发版真实现状再对标**：本次无法直连 GitHub 核验精确 star 与近期 commit 密度，建议打开仓库页（https://github.com/lightdash/lightdash ）复核后再引用。

---

# 第二部分：Evidence.dev（Evidence）

## 1. 项目名 + GitHub URL + 一句话定位

- 项目：**Evidence**（Evidence.dev，产品侧亦称 Evidence Studio；注意与同名医疗 AI "OpenEvidence" 无关）
- GitHub：https://github.com/evidence-dev/evidence
- 定位：**"BI as code"**——用 **SQL + Markdown 写数据报表/仪表板**，仓库级版本管理、可编译成可交互网站；官方描述「build fast, interactive data visualizations in SQL and markdown」（GitHub 描述）。YC S21 出身（Launch HN：https://hn.svelte.dev/item/28304781 ）。

## 2. 维护状态

- **活跃，但形态在从单体仓库走向平台化**：
  - 官方 docs 站、changelog（https://docs.evidence.dev/changelog ）、博客（https://evidence.dev/blog ）均在更新；docs 已出现 **Evidence Studio 域名**（https://docs.evidence.studio/features/evidence-agent ），说明产品/文档重心向 Studio（其工具链产品名）演进。
  - 功能拆包发布：`@evidence-dev/evidence` 与 `@evidence-dev/sdk` 等 npm 包持续有新版本（npm：https://www.npmjs.com/package/@evidence-dev/sdk ；版本页：https://security.snyk.io/package/npm/@evidence-dev%2Fevidence/versions ）。
  - star 数量级：约 **6.9k**（第三方开源替代品榜单快照明确标注 `MIT` `⭐ 6.9K`：https://github.com/piotrkulpinski/open-source-alternatives ）；MIT 许可证（另有第三方介绍佐证：https://dev.co/devops/open-source/evidence ）。
- 结论：**活跃维护**；OSS 核心（MIT）+ 托管产品双轨，近期产品化/Agent 化动作明显。

## 3. 自然语言 → 图表能力的具体实现

- **基础模型不是"问一个问题出一张图"，而是"代码工件 + 声明式组件"**：页面 = Markdown；数据查询写在页面内命名 SQL 块里（https://docs.evidence.dev/core-concepts/queries 、语法：https://docs.evidence.dev/core-concepts/syntax/ ）；渲染用声明式组件消费查询结果（如 `<LineChart data={myQuery} .../>`，图表组件体系见 https://docs.evidence.dev/core-concepts/components/ ，全组件列表页/组合图示例：https://docs.evidence.dev/components/combo_chart ）。即 **数据查询声明与展示组件分离、显式用 `data=` 连接**。
- **LLM 落在「写/改这些工件」这一层**：官方功能 **Evidence Agent**（docs：https://docs.evidence.dev/features/evidence-agent ；发布博客：https://evidence.dev/blog/evidence-agent ）。从 docs changelog 出现「agent 快捷键」（https://docs.evidence.dev/changelog#agent-keyboard-shortcut ）判断，它已深度嵌入 Studio 编辑器（推断：以对话/并排方式在项目内创建或修改查询与图表，产出的是可 diff、可 review 的代码变更，而不是一次性渲染图；精确能力边界需在 docs 页核实）。
- **哲学层面更激进**：官方博客「That dashboard should be a skill」（https://evidence.dev/blog/that-dashboard-should-be-a-skill ）主张把「仪表板」封装成 **agent 可调用的技能（skills）**——数据产品即代码、可被 LLM 编排。这与 ChartBrain「消费端执行渲染」不同，但极有参考价值。
- **本地/数据侧实现**：支持 DuckDB 本地跑（社区实践：https://dev.to/wellallytech/from-messy-wearables-to-insights-building-a-personal-health-data-warehouse-with-duckdb-evidence-5d92 ）及多数据库连接器；自托管/数据刷新见 https://docs.evidence.dev/self-host （推断：架构为「查询块 → 结果物化 → 编译期 Svelte/组件渲染」，查询块仍是 SQL）。

## 4. 不足 / 空白点（ChartBrain 视角）

- **仍是「整套应用/框架」而非独立中间件**：要跑 Evidence 需要它的编译管线、连接器与组件运行时（组件体系是 Svelte 系，可写 custom components：https://docs.evidence.dev/core-concepts/custom-components ）。消费端没法只取一个轻量 SDK 在任意图表库里渲染。
- **图表配置以「组件 props 写进 Markdown」表达**：绑定其组件库与运行时；不是「中性 spec + 多库适配器」——换个图表库就得换组件。
- **数据查询仍以 SQL 为主**：变换/聚合在 SQL 块（或 DuckDB）里做，天然绑定 SQL 数据源；对「消费端自带真实数据、需要声明式变换计划」的 ChartBrain 场景不覆盖。
- **Agent 属产品化功能**：是否在 OSS 本地版可用、用什么模型/提供商、额度如何，**需核实**（docs/博客有专门页面但本次无法读正文）。
- **仓库演进方向有不确定性**：核心能力正在拆包并向 Studio/云演进，社区有对 OSS 单体仓库维护节奏的讨论（需核实）；选型时注意其「官方推荐使用方式」可能已从「自建整个 OSS repo」转向托管 Studio。

## 5. 我们可以借鉴的点

- **它的声明式模型与 ChartBrain 的 spec+渲染解耦高度同构**：SQL 查询块 = 数据声明，`<Chart data={q}/>` = 展示声明，二者之间是显式契约——这正是 ChartBrain「数据 + 轻量中性 spec + 客户端渲染」想法的源码级验证。**最值得借鉴的项目**。
- **一切皆文本、可版本化、可 diff、可 review**：LLM 改的是仓库里的 markdown/SQL，而非一次性图——ChartBrain 若把「spec + 变换计划」做成可序列化、可 diff 的工件（而非即时字符串），就能获得同样的可审计性与 CI 能力。
- **数据查询与渲染分离 → 渲染端可离线/确定性执行**：与 ChartBrain「LLM 只产 spec、确定性转换器转目标库」的精神一致：LLM 不碰渲染库，只碰声明层。
- **「dashboards as skills」叙事**：若 ChartBrain 的 spec/变换计划是标准工件，未来同样可打包成 agent skills，被更上层 agent 编排调用。
- **开发者体验范式**：Markdown 起步、渐进到组件——低门槛让用户（含 LLM）更容易产出合法工件，值得借鉴「可读、可写、低语法噪音」的 spec 设计。

## 6. 帮我们避坑的点

- **LLM 直接写 SQL 查询块风险不小**（未见官方声称完全消除）：SQL 写错/跑贵/权限问题都在运行时才暴露。ChartBrain 若保留数据侧 SQL 能力，需要编译期/沙箱校验；若走「消费端真实数据 + 声明式变换计划」，则天然绕开该坑——这正是优势。
- **声明式组件参数只在编译/渲染期校验**：props 写错要等构建才报错。ChartBrain 应在 LLM 产出 spec 后立刻做 schema 校验（比 Evidence 更前置），并让确定性转换器承担「不可能产出非法配置」的保证。
- **别把 spec 绑死在自家运行时**：Evidence 的组件 = 它的运行时；若 ChartBrain 把「中性 spec」实现成「自家组件的 JSON 化」，就重蹈覆辙。必须用 adapter 隔离。
- **警惕产品重心漂移**：Evidence 向 Studio/托管演进提醒我们：依赖 OSS 单体仓库做平台底座有战略风险；ChartBrain 作为独立服务 + 消费端 SDK，应把「自家可完全掌控的契约层（spec/schema）」与任何上游依赖解耦。
- **DuckDB/本地化虽香，但会悄悄引入数据栈假设**：别让「本地跑」变成「必须跑 DuckDB/SQL」，否则与「库无关、数据栈无关」的定位冲突。

---

# 第三部分：对 ChartBrain 的总判断（两项目横向）

| 维度 | Lightdash | Evidence | ChartBrain 相对位置 |
|---|---|---|---|
| LLM 产出物 | 语义层约束的 SQL + 自家/ECharts 图表 JSON | 改写 markdown + SQL 块 + 声明式组件 | 轻量中性 spec + 声明式变换计划（两者都不做） |
| 数据层 | dbt + SQL 仓库（强绑定） | SQL 查询块 / DuckDB / 连接器（强绑定 SQL） | 消费端真实数据（数据栈无关） |
| 渲染层 | 自有前端 + ECharts（绑定） | Svelte 组件运行时（绑定） | Highcharts/ECharts 均可，由确定性 adapter 转换 |
| 能否作独立中间件 | 否（完整平台） | 否（整套框架） | 是（这正是它的差异化） |
| 变换/聚合 | SQL 侧 | SQL 侧 | 客户端声明式变换计划（空白地带） |
| 可借鉴 | 语义层 scope 治理、chart 知识技能、agent 分层 | 声明式「数据声明与展示分离」、文本化可 diff 工件、dashboards-as-skills | —— |
| 主要避坑 | 库方言耦合、agent 写代码、平台授权成本 | 组件 props 晚校验、SQL 风险、运行时绑定、重心漂移 | —— |

**核心结论（推断，基于上述来源综合判断）**：ChartBrain「独立中间件 + 中性 spec + 确定性转换器 + 消费端 TS SDK」的定位，在两个项目之间确实存在空白——Lightdash 证明了「agent 化查数与出图」的市场叙事与治理必要性，Evidence 证明了「声明式数据/展示分离 + 一切可 diff 代码工件」的工程范式；二者都没有提供「库无关、数据栈无关、可嵌入任意消费端、变换在客户端确定性执行」的产品。建议把 Evidence 作为架构范式参照、Lightdash 作为 agent 治理与图表知识约束的参照，同时坚持 spec/schema 契约自持，避免绑定任何上游运行时。

---

# 引用的全部来源 URL

## Lightdash（官方）
- https://github.com/lightdash/lightdash
- https://github.com/lightdash/lightdash/pull/21036
- https://github.com/lightdash/lightdash/issues/1020
- https://github.com/lightdash/lightdash/blob/main/skills/developing-in-lightdash/resources/cartesian-chart-reference.md
- https://docs.lightdash.com/agents
- https://docs.lightdash.com/agents/use-ai-agents
- https://docs.lightdash.com/agents/set-up-agents
- https://docs.lightdash.com/agents/ai-coding-agent
- https://docs.lightdash.com/agents/ai-writeback
- https://docs.lightdash.com/agents/deep-research
- https://docs.lightdash.com/guides/ai-overview
- https://docs.lightdash.com/guides/choosing-ai-workflow
- https://docs.lightdash.com/guides/ai-agents/self-improvement
- https://docs.lightdash.com/semantic-layer
- https://docs.lightdash.com/get-started/build-your-semantic-layer
- https://docs.lightdash.com/integrations/dbt
- https://docs.lightdash.com/api-reference/projects/get-agent-sql-scope
- https://docs.lightdash.com/api-reference/projects/update-agent-sql-scope
- https://docs.lightdash.com/api-reference/start-deep-research-run
- https://docs.lightdash.com/explore/chart-types/custom-project-charts
- https://docs.lightdash.com/references/chart-types/custom-charts
- https://docs.lightdash.com/llms.txt
- https://changelog.lightdash.com/describe-a-chart-type-lightdash-builds-it-341612
- https://newreleases.io/project/github/lightdash/lightdash/release/2.16.0

## Lightdash（第三方）
- https://techcrunch.com/2024/10/08/open-source-bi-platform-lightdash-gets-accels-backing-to-bring-ai-to-business-intelligence/
- https://au.finance.yahoo.com/news/open-source-bi-platform-lightdash-080000402.html
- https://atlan.com/know/ai-agent/lightdash-open-source-bi-tool/
- https://www.modern-datatools.com/tools/lightdash
- https://dev.to/pickuma/lightdash-review-open-source-bi-built-on-dbt-1g5o
- https://fastero.com/blog/metabase-vs-lightdash-general-vs-dbt-native-bi
- https://repos.ecosyste.ms/hosts/GitHub/topics/dbt?order=desc&sort=stargazers_count
- https://repos.ecosyste.ms/hosts/GitHub/owners/lightdash?sort=stargazers_count
- https://whatstrending.ai/repos/lightdash/lightdash
- https://glama.ai/mcp/servers/poddubnyoleg/lightdash_mcp/tools/run-chart-query
- https://tessl.io/registry/tessl/npm-lightdash--common/0.2231.5/files/docs/guides/visualization.md

## Evidence（官方）
- https://github.com/evidence-dev/evidence
- https://evidence.dev/
- https://evidence.dev/blog
- https://evidence.dev/blog/evidence-agent
- https://evidence.dev/blog/that-dashboard-should-be-a-skill
- https://evidence.dev/changelog
- https://docs.evidence.dev/
- https://docs.evidence.dev/features/evidence-agent
- https://docs.evidence.dev/changelog
- https://docs.evidence.dev/core-concepts/syntax/
- https://docs.evidence.dev/core-concepts/queries
- https://docs.evidence.dev/core-concepts/components/
- https://docs.evidence.dev/core-concepts/custom-components
- https://docs.evidence.dev/components/combo_chart
- https://docs.evidence.dev/editing
- https://docs.evidence.dev/self-host
- https://docs.evidence.studio/features/evidence-agent
- https://www.npmjs.com/package/@evidence-dev/sdk

## Evidence（第三方）
- https://github.com/piotrkulpinski/open-source-alternatives
- https://dev.co/devops/open-source/evidence
- https://dev.to/wellallytech/from-messy-wearables-to-insights-building-a-personal-health-data-warehouse-with-duckdb-evidence-5d92
- https://fastero.com/blog/evidence-vs-lightdash-bi-as-code-for-dbt-teams
- https://security.snyk.io/package/npm/@evidence-dev%2Fevidence/versions
- https://hn.svelte.dev/item/28304781

## 需重点复核的未核实事项
1. Lightdash 与 Evidence 的**精确 star 数与最新 commit 日期**（本次沙箱无法直连 GitHub，仅给出量级：Lightdash ≈1 万上下 / Evidence ≈6.9k）。
2. **Evidence Agent** 的具体能力边界：OSS 本地可用性、模型提供商、运行位置（Cloud vs Studio）——docs/博客有专页但正文未逐字核读。
3. Lightdash **AI coding agent / writeback / self-improvement** 的 Beta 成熟度与权限细节。
4. Evidence 单体仓库与 Studio/托管产品的分工演进方向。
