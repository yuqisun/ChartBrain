# 开源 BI / 数据分析工具「自然语言 → 图表」能力调研（ChartBrain 视角）— 综合报告

> 调研时点：2025–2026 年间公开资料（各主题子报告完成于 2026 年）。方法：web_search 检索 GitHub / 官方文档 / 官方博客为主、第三方佐证为辅，7 个并行子代理分主题深挖后汇总。
> 证据边界：本环境无法直连抓取网页/GitHub 全文，star 数与 commit 时间多为第三方快照的数量级估计（已注明），个别内部实现标注「推断/需复核」。落地前请按文末各主题报告文件与链接复核一手来源。

---

## 1. 总览表

| 项目 | 形态 | NL→图表的主要产出物 | 库无关？ | 可作独立中间件/库被业务复用？ | 活跃度（约） |
|---|---|---|---|---|---|
| Apache Superset | 完整 BI 平台 | 官方开源侧无内置 text-to-SQL/NL→图；主推内置 MCP 工具面；text-to-SQL/NL→chart 在 Preset 商业与研究论文侧 | ❌（ECharts/form_data） | ❌ 强绑定平台对象模型 | 极活跃 / ~7.4 万 star |
| Metabase | 完整 BI 平台 | Single-shot text-to-SQL（语义层 repr 注入）→「SQL+数据」，自家前端出图 | ❌ | ❌ | 极活跃 / ~5 万 star |
| Grafana | 可观测平台+插件 | LLM 网关插件 + Assistant：NL→PromQL/LogQL/SQL/面板 JSON；遥测元数据向量库 RAG | ❌ | ❌（llm-app 仅是插件宿主内 SDK） | 活跃（Assistant 2025-10 GA）/ ~7.6 万 star |
| Lightdash | dbt 原生 Agentic BI | 语义层白名单内 agent text-to-SQL +「描述图类型即建图」（ECharts 配置透传） | ❌（绑定 ECharts） | ❌ | 活跃 / ~1 万 star |
| Evidence.dev | BI as code（SQL+MD） | 改写 SQL 块/声明式组件 `<Chart data={q}/>`（数据声明与展示分离） | ❌（绑 Svelte 运行时） | ❌ 整套框架 | 活跃（MIT）/ ~6.9k star |
| Vanna.ai | Python 库（text-to-SQL+RAG） | LLM 直写 **Plotly Python 代码并动态执行** | ❌（绑 Plotly） | ⚠️ pip 可嵌入，但 Python/DB/向量库/Plotly 四重绑定 | 活跃 / ~2.4 万 star |
| WrenAI | GenBI 平台（语义层+agent） | text-to-SQL + 独立 text-to-chart 端点（图表 JSON 绑定自家 UI/引擎） | ❌ | ⚠️ 有 TS/Python SDK，但拖整套平台+DB | 很活跃 / ~1 万 star |
| DB-GPT | AI Native 数据应用框架 | text2sql + 内置聊天图表/报表（AWEL 编排） | ❌ | ❌ 重框架 | 很活跃 / ~1.5 万 star |
| Chat2DB | AI 数据库客户端 | NL→SQL→结果表格→客户端内图表 | ❌ | ❌ 端产品 | 存疑（重心转商业）/ ~2.6 万 star |
| PyGWalker | Python DataFrame 分析库 | ask-to-viz：NL→统一 spec→vega/g2/streamlit 多渲染后端 | ⚠️ spec 半开放（仅三类后端） | ✅ 库形态（仅 Python） | 活跃 / ~1.3 万 star |
| Dataherald | 独立 NL→SQL 引擎（REST API） | 纯 text-to-SQL（执行返回行集），无图表 | — | ✅ API-first 但社区小 | 中缓（转向 Kula）/ ~1k star |
| OpenMetadata | 数据目录/治理平台 | Ask-Me-Anything 元数据问答 + MCP，无数据分析图表 | — | ❌ 企业平台 | 很活跃 / 数千 |
| glyph（seanhanca） | agent/MCP 用确定性图表服务 | **52 受控动词 + DuckDB 引擎内变换 + byte-stable SVG** | ✅ SVG 中性产物 | ✅ MCP-native 独立服务 | 活跃演进（0.3.0） |
| vega-mcp-server（hydrosquall） | MCP server | LLM 产 **Vega-Lite 声明式 spec** → 确定性编译渲染 | ⚠️ 绑 Vega 生态 | ✅ MCP 服务 | 中活跃 |
| NL4DV / Chat2Vis / ChartBench / 2408.13391 等 | 研究/基准 | NL→中间 analytic spec / 直接 Vega-Lite；评测基准 | — | — | 研究项目 |

---

## 2. 逐项目深度评估

### 2.1 Apache Superset

1. **项目**：[github.com/apache/superset](https://github.com/apache/superset) — Apache 顶级开源 BI 平台（Python/Flask + React + ECharts superset-ui 插件体系）。
2. **定位**：完整 BI（DB 连接/数据集与指标/图表看板/权限治理），不是库无关中间件。
3. **维护**：约 **7.4 万 star**（[star-history](https://www.star-history.com:2096/apache/superset/)）；最新稳定 **6.1.0**（[release](https://github.com/apache/superset/releases/tag/6.1.0)），月度社区回顾连载到 2026-06（[Preset recap](https://preset.io/blog/apache-superset-repo-recap-june-2026/)），7.0 路线图讨论已开（[#40904](https://github.com/apache/superset/discussions/40904)）。极活跃。
4. **NL→图表实现**：上游开源核心**没有内置 text-to-SQL、也没有内置 NL→图表**；目前最实质的官方 AI 面是**内置 MCP 服务**（[SIP-171 #33870](https://github.com/apache/superset/issues/33870) → [SIP-187 #35498](https://github.com/apache/superset/issues/35498)，源码 `superset/mcp_service/`，按 chart/dashboard/dataset/query 提供 tools/resources，官方 [6.1.0 部署鉴权文档](https://superset.apache.org/admin-docs/6.1.0/configuration/mcp-server/) 与 [用户文档 Using AI with Superset](https://superset.apache.org/user-docs/using-superset/using-ai-with-superset/)）。上游 [SIP-166 AI Assistant #33215](https://github.com/apache/superset/issues/33215)、SIP-128 SQL Lab LLM、SIP-155/157 agentic 均在提案态。生产级 text-to-SQL/会话分析在 **Preset 商业侧**（[AI Assist](https://preset.io/blog/building-preset-ai-assist-how-we-brought-text-to-sql-into-apache-superset/)、[Chatbot](https://preset.io/blog/preset-chatbot-technical-deep-dive/)、[Agent Skills](https://preset.io/blog/announcing-preset-agent-skills/)）。「NL→Superset chart spec→图表」直到 2026 年仍是研究课题（[Lviv Polytechnic 论文](https://science.lpnu.ua/cds/all-volumes-and-issues/volume-8-number-1-2026/natural-language-driven-chart-specification-and)）。LLM 均为外接/BYOK。
5. **空白点**：NL 全绑 Superset 对象模型（dataset/form_data/viz 插件/RLS），无可摘出的「NL→中性 spec」独立服务；聚合发生在数据库端 SQL 下推；上游 AI 碎片化、多未落地；图表类型映射与 ECharts 配置生成仍是论文级难题；权限靠 ACL+RLS 且**任意 SQL 可绕过**。
6. **可借鉴**：受管执行端点防越权（[PADISO 实践](https://www.padiso.co/blog/agentic-ai-apache-superset-claude-query-dashboards/)）；显式 JSON chart spec+插件注册表；LLM 只做受限决策、执行前人在回路；语义元数据当 prompt 上下文；MCP 工具带 annotation 元数据（[PR #38641](https://github.com/apache/superset/pull/38641)）；Agent Skills 知识沉淀。
7. **避坑**：text-to-SQL「demo 能跑、生产不行」；跨会话状态泄漏是真实 bug（[PR #38827](https://github.com/apache/superset/pull/38827) 修 MCP generate_dashboard 跨会话 SQLAlchemy）；元数据注入卫生；RLS 绕过需把 agent 收口到受管 API；同名/仿冒项目多（superset.sh、第三方 superset-mcp 均非官方）。

### 2.2 Metabase

1. **项目**：[github.com/metabase/metabase](https://github.com/metabase/metabase) — AGPL，Clojure 后端 + React/TS 前端，AI 助手名 Metabot。
2. **定位**：面向非技术用户的自助式 BI；AI 从 v59/v60 起在 OSS 全面开源。
3. **维护**：约 **5 万 star**（[star-history](https://www.star-history.com/metabase/metabase/)）；v52（2024）→ v62（2026），v63 开发中，AI 代码/文档在主分支（[docs/ai/*](https://github.com/metabase/metabase/tree/master/docs/ai)）。极活跃。
4. **NL→图表实现**：链路 = NL →（Metabot/LLM 生成 **SQL/MBQL**）→ 数据库执行 → 数据回 Metabase 由自家前端渲染（可存 Question/进 Dashboard/推 Slack/经官方 [MCP](https://www.metabase.com/docs/latest/ai/mcp)）。机制要点：① **[single-shot text-to-SQL]**（OSS [PR #67883](https://github.com/metabase/metabase/pull/67883)）：单请求塞上下文直出 SQL，不搞多步 agent；② **语义层** Models/Metrics/Segments 做成**文本 repr 喂 LLM**（[PR #67368](https://github.com/metabase/metabase/pull/67368)、[PR #71656](https://github.com/metabase/metabase/pull/71656)），官方甚至公开 [system prompts](https://www.metabase.com/docs/latest/ai/system-prompts)；③ provider 抽象 + BYOK/自配代理（[PR #71714](https://github.com/metabase/metabase/pull/71714)），默认 Anthropic，加 prompt caching（[PR #72851](https://github.com/metabase/metabase/pull/72851)）；④ 聚合/变换全部落成 SQL 在数据库端执行，**不产出库无关图表 spec**（v62「AI 客户端图表」仍在 Metabase 渲染体系内）。版本里程碑：v57 Metabot → v59 AI SQL 生成+Data Studio 语义层 → v60「made AI open source」+官方 MCP+Slack Metabot（[博客](https://www.metabase.com/blog/ai-for-everyone-with-confidence)）→ v61 AI 治理（token 限额/用量/访问控制）+ MCP 建 Question/Dashboard → v62 自定义可视化。
5. **空白点**：强平台绑定，输出「SQL+数据」而非跨库 spec，无声明式变换计划层；权限靠 Metabase 既有行级沙箱（红利不可移植）；单实例单租户假设。
6. **可借鉴**：语义对象专门做「喂 LLM 的 repr」；single-shot+受控上下文+prompt 缓存；**权限在「喂 LLM 的内容」与「实际查询」两层都按用户过滤**（v63 [PR #80150](https://github.com/metabase/metabase/pull/80150) 让 LLM context 查询走 user-aware DB 访问）；能力分阶段开源；MCP/仪表板即代码暴露。
7. **避坑**：官方博客「[build for chaos](https://www.metabase.com/blog/lessons-learned-building-ai-analytics-agents/)」——agent 环境要结构/重试/兜底/可观测性；无策展语义层放大幻觉（[Data Studio 博客](https://www.metabase.com/blog/meet-data-studio-semantic-layer)）；成本治理前置（[usage controls](https://www.metabase.com/docs/latest/ai/usage-controls)）；防 **spec/查询幻觉**（字段名、聚合语义、时间粒度、单位），需 schema 校验+白名单；生成会扫全表的计划等于打挂消费端。

### 2.3 Grafana

1. **项目**：[github.com/grafana/grafana-llm-app](https://github.com/grafana/grafana-llm-app)（官方 LLM 插件）+ 产品 [Grafana Assistant](https://grafana.com/blog/llm-grafana-assistant/)。
2. **定位**：llm-app = 给 Grafana 插件生态用的 **LLM 网关/向量库基础设施**（Go module，可 import 的 `llmclient` 子包）；Assistant = 内建 LLM agent（2025-10-08 GA，从云扩展到 self-managed/OSS）。
3. **维护**：官方正常维护（Releases、dependabot、[Anthropic provider PR #751](https://github.com/grafana/grafana-llm-app/pull/751)、Go module v0.6.4）；Grafana 本仓约 7.6 万 star（[star-history](https://www.star-history.com:2096/grafana/grafana/)）。社区插件（tamcore/grafana-llmanalysis-app 等）生命周期短。
4. **NL→图表实现**：路线是 **NL→查询语句/面板 JSON**（PromQL/LogQL/SQL/云数据源，多轮 refine），渲染闭环在 Grafana 面板系统内；**不做库无关图表 spec**。语义层思路 = 把遥测元数据（指标名/标签）embedding 进向量库做 RAG 注入（llm-app 抽象向量存储）。Grafana 12.2 增加 LLM-powered SQL expressions；2025-10 起 Assistant Investigations（专门后端做统计/模式调查，LLM 只做编排叙述）。官方另有 [MCP servers](https://grafana.com/docs/grafana-cloud/machine-learning/mcp/)。作者同为 Grafana 开发者的 [vega-mcp-server](https://github.com/hydrosquall/vega-mcp-server) 反而是调研中最接近 ChartBrain 的实现（LLM 出声明式 Vega-Lite spec → 确定性渲染，但绑定 Vega 生态）。
5. **空白点**：全家桶互相绑定（插件 SDK/数据源框架/查询语言/面板渲染），不能作库无关独立中间件；「查询生成」路线绑定执行环境/权限，幻觉直接表现为错查询/错聚合；llm-app 层统计能力弱。
6. **可借鉴**：LLM 能力做成 provider 无关网关+可 import SDK；元数据向量库做语义上下文而非全量塞 schema；多轮 refine；「LLM 出声明式 spec + 确定性渲染」已被验证可行；全链路可预览/可审计/可回滚的信任设计（[博客](https://grafana.com/blog/grafana-assistant-why-you-can-trust-our-agent-and-yourself-in-an-era-of-ai-hallucinations/)）；**统计计算交给确定性代码，LLM 只出意图**；MCP 作为新消费通道。
7. **避坑**：别模仿「生成查询语句」当通用中间层（绑定数据源/权限）；别做成 Grafana 插件（SDK 兼容/云 OSS 分叉维护成本）；别让 LLM 直出 Highcharts/ECharts 命令式配置——必须中间 spec+确定性转换器；服务端 schema 校验+白名单防提示注入/越界字段；向量索引会漂移不能当权威 schema；LLM 不做数值统计；区分「单图表 spec」与「整块看板生成」（后者评估主观、复杂度高）。

### 2.4 Lightdash

1. **项目**：[github.com/lightdash/lightdash](https://github.com/lightdash/lightdash)
2. **定位**：dbt 原生开源 BI，自我定位「**Agentic BI. Analytics at the speed of code**」。
3. **维护**：约 **1 万 star**（需复核）；2026-03 仍高频合 PR（[#21036](https://github.com/lightdash/lightdash/pull/21036)），2.16.0 release；2024-10 Accel 投资（[TechCrunch](https://techcrunch.com/2024/10/08/open-source-bi-platform-lightdash-gets-accels-backing-to-bring-ai-to-business-intelligence/)）。活跃。
4. **NL→图表实现**：LLM 铺满整条链路：①查数层 = **受语义层（dbt metrics YAML）白名单约束的 agent text-to-SQL**，有「agent SQL scope」治理 API（[get/update agent sql scope](https://docs.lightdash.com/api-reference/projects/get-agent-sql-scope)）；②出图层 = NL 描述图类型即建图（[changelog](https://changelog.lightdash.com/describe-a-chart-type-lightdash-builds-it-341612)）；③AI writeback / self-improvement / deep research / AI coding agent（Beta，仓库自带 [skills/developing-in-lightdash chart reference](https://github.com/lightdash/lightdash/blob/main/skills/developing-in-lightdash/resources/cartesian-chart-reference.md) 喂给 coding agent）；文档站有 llms.txt。图表配置 = 自家 JSON + **custom charts 直接透传 ECharts 配置**（[issue #1020](https://github.com/lightdash/lightdash/issues/1020)），即绑定 ECharts/自有平台。
5. **空白点**：深度绑定 dbt+SQL 数据仓库（无 dbt+DW 则 agent 无腿）；非库无关中间件；聚合/变换全在 SQL 侧；agent scope/额度是平台治理不可拆出。
6. **可借鉴**：「语义层白名单内的 SQL 生成/查询 scope」治理思路 → ChartBrain 可做「**变换计划白名单**」；skill/chart-reference 文件把「合法图表语法」固化成结构化知识约束 LLM；共享 TS 类型前后端同源防 spec/渲染漂移。
7. **避坑**：别做裸 text-to-SQL；**别把 spec 做成库方言**（Lightdash 自己被 ECharts 绑住）；agent 编辑代码必须可 diff/review/回滚；RLS/scope/限额是规模化标配（API 设计时就留 scope 参数）。

### 2.5 Evidence.dev

1. **项目**：[github.com/evidence-dev/evidence](https://github.com/evidence-dev/evidence)
2. **定位**：「**BI as code**」——SQL+Markdown 写报表，仓库级版本管理，编译成交互网站（MIT）。
3. **维护**：约 **6.9k star**（第三方榜单快照）；活跃但重心向 Evidence Studio/托管演进，核心拆包为 @evidence-dev/sdk 等 npm 包。
4. **NL→图表实现**：基础模型是「**代码工件 + 声明式组件**」：页面=Markdown；命名 SQL 块查数；渲染用声明式组件 `<LineChart data={q}/>` 消费查询结果——**数据声明与展示分离、显式 `data=` 契约**（与 ChartBrain「spec+渲染解耦」最同构）。LLM 层为 **Evidence Agent**（改写 markdown/SQL/组件工件，可 diff 可 review）；官方博客主张 [dashboards-as-skills](https://evidence.dev/blog/that-dashboard-should-be-a-skill)。
5. **空白点**：整套框架（Svelte 组件运行时+编译器+连接器）而非独立中间件；图表=组件 props 绑定其运行时；查询仍以 SQL 为主（DuckDB/连接器）；Agent 的 OSS 可用性/模型供应商需核实；重心向 Studio 漂移。
6. **可借鉴**：声明式数据/展示分离是 ChartBrain 思路的「源码级验证」；**一切皆文本、可版本化、可 diff、可 review**——把「spec+变换计划」做成可序列化工件以获得 CI/审计能力；数据查询与渲染分离 → 渲染端确定性执行；低语法噪音的 spec DX。
7. **避坑**：组件 props 只在编译/渲染期校验——ChartBrain 应在 LLM 产出 spec 后**立即 schema 校验**并由确定性转换器保证「非法配置不可能」；LLM 直写 SQL 有运行时风险；别把中性 spec 实现成自家运行时的 JSON（用 adapter 隔离）；警惕上游重心漂移；「本地跑 DuckDB」会悄悄引入数据栈假设。

### 2.6 Vanna.ai

1. **项目**：[github.com/vanna-ai/vanna](https://github.com/vanna-ai/vanna)
2. **定位**：Python **库形态**的 text-to-SQL + RAG（v2 改 Agentic Retrieval），自带 Plotly 图表生成。
3. **维护**：约 **2.4 万 star**（[star-history](https://www.star-history.com/vanna-ai/vanna/)）；活跃；0.x（末 v0.7.6）→ **v2.0.x 破坏性重写**（[MIGRATION_GUIDE](https://github.com/vanna-ai/vanna/blob/main/MIGRATION_GUIDE.md) + LegacyVannaAdapter）；MIT。
4. **NL→图表实现**：①「训练」=把 **DDL/文档/问答对**三类知识向量化入向量库（默认 ChromaDB 或商业 Vanna Hosted），查询时 top-k 注入 prompt（检索注入，非微调），成功交互自动回写 (question, SQL)；②`ask()` = generate_sql → run_sql（**框架自建 DB 连接直接执行**）→ DataFrame；③图表 = **LLM 直接写 Plotly Python 代码并动态执行**（`generate_plotly_code`），**无中性 spec、无声明式变换计划**，变换由 LLM 现场写在 SQL 与 Plotly 代码两处，不可审计/复现。LLM/向量库/数据库三者为可插拔接口。
5. **空白点**：图表层不库无关（绑 Plotly）；「生成代码→exec」高危（见避坑）；绑定 Python+持有 DB 凭据+代执行 SQL；无官方 JS SDK；开箱准确率依赖大量训练调优（第三方实测 [3%→80%](https://blog.gitcode.com/9ff16435d6f2740220358372dff2110f.html)、[IDInsight 对比](https://idinsight.github.io/tech-blog/blog/compare_aam_vanna/)）；作独立中间件适配度中低。
6. **可借鉴**：RAG 三段式知识（schema 类/自由文本/「问题→目标产物」示范对）分层注入；**训练闭环**（成功/修正样本回流）→ ChartBrain 可做「NL+库声明+数据 → spec」样本回流；**喂真实数据（轻量摘要）再让 LLM 产出**；澄清/追问交互；可插拔接口分层；嵌入式库的文档矩阵+迁移指南样板。
7. **避坑**：**绝不复刻「LLM 生成可执行代码→exec」管线**——已出 [CVE-2024-5565](https://security.snyk.io/vuln/SNYK-PYTHON-VANNA-7411411)（CVSS 8.1，prompt injection→RCE，vanna ≤ 0.5.5）且后续仍有 [issue #1078](https://github.com/vanna-ai/vanna/issues/1078) RCE 报告；「训练」不是微调（营销词陷阱）；大版本 API 动荡需锁版本；绑定即负债；图表代码不可复现/审计——ChartBrain「确定性计划→确定性转换」恰好有测试/快照/回归优势。

### 2.7 其他值得关注的开源项目（横向结论见 §3）

- **WrenAI**（[github.com/Canner/WrenAI](https://github.com/Canner/WrenAI)，原 Decentralised-AI/WrenAI）：GenBI 平台。语义层 MDL 建模 + text-to-SQL + **独立 chart 生成端点**（[POST /generate-chart](https://wrenai.readme.io/reference/post_generate-chart)，LLM 产 SQL+图表 JSON）→ 自家 UI/引擎渲染；组件拆为 WrenUI + wren-ai-service（Python）+ wren-engine；提供 TS/Python SDK 与 LangChain 集成、MCP。约 1 万 star、很活跃（0.22/0.23.x）。**最接近 ChartBrain 的全栈对标**，但图表 spec 绑定自家渲染、变换在服务端 SQL 引擎（要求 DB 连接）。借鉴：语义层显著提升 text-to-SQL 质量；chart 生成做成显式 API。
- **DB-GPT**（[github.com/eosphoros-ai/DB-GPT](https://github.com/eosphoros-ai/DB-GPT)）：AI Native 数据应用框架，多模型+RAG+Agent+AWEL 编排，text2sql + 内置图表/报表（锁死自家前端）。约 1.5 万 star、很活跃（v0.8.1）。借鉴 AWEL agent 工作流抽象；对 ChartBrain 过重。
- **Chat2DB**（[github.com/chat2db/Chat2DB](https://github.com/chat2db/Chat2DB)）：AI 数据库客户端，30+ DB，NL→SQL→结果集→客户端内图表。约 2.6 万 star，但**重心转商业云版、开源发版放缓**（出现活跃 fork [OtterMind/Chat2DB](https://github.com/OtterMind/Chat2DB/releases)），选型需复核。
- **PyGWalker**（[github.com/Kanaries/pygwalker](https://github.com/Kanaries/pygwalker)）：Python DataFrame→交互分析 UI；**统一声明式 spec → vega/g2/streamlit 多渲染后端**（spec/渲染分离做得最好）；ask-to-viz（NL→spec）需接 OpenAI 兼容 API。约 1.3 万 star、活跃。Python-only、进程内 DataFrame；借鉴「统一 spec+多渲染后端」可证明 ChartBrain 思路。
- **Dataherald**（[github.com/dataherald/dataherald](https://github.com/dataherald/dataherald)）：**API-first 独立 NL→SQL 引擎**（REST，业务系统可调用），纯 text-to-SQL 无图表；约 1k star、中缓（向自有引擎 Kula 重构）。形态最像「独立中间件」但社区小、无图表。
- **OpenMetadata**（[github.com/open-metadata/OpenMetadata](https://github.com/open-metadata/OpenMetadata)）：数据目录/治理平台，Ask-Me-Anything 元数据问答 + [MCP server](https://blog.open-metadata.org/introducing-the-model-context-protocol-mcp-in-openmetadata-e757385f4fb2)，无 text-to-chart。
- 落选/谨慎：**SQL Chat**（[sqlchat/sqlchat](https://github.com/sqlchat/sqlchat)，2024 后放缓）、**TableGPT/TableGPT2**（[ZJU-M3](https://github.com/ZJU-M3/TableGPT-techreport)，开源权重模型而非软件中间件）、**PandasAI**（NL→Python 代码路线，图表非声明式 spec）。

### 2.8 与 ChartBrain 最同构的方向：NL → 中性 spec + 确定性渲染

- **glyph**（[github.com/seanhanca/glyph](https://github.com/seanhanca/glyph)）：**给 agent 用的确定性图表服务**——tagline「52 verbs, byte-stable SVG, DuckDB inside, MCP-native, AI-built/maintained」。机制：**受控动词闭集**（52 个动词+强类型参数）把 LLM 自由度压到「枚举选择+少参数」（犯错空间有限）；**byte-stable**（同输入同输出逐字节一致）让 agent 可 diff 自校验、可 golden 测试；**DuckDB 在引擎内做过滤/聚合**——LLM 不写 SQL、不写 pipeline。活跃演进中（0.3.0）。⚠️ README 细部需人工复核。
- **vega-mcp-server**（[github.com/hydrosquall/vega-mcp-server](https://github.com/hydrosquall/vega-mcp-server)）：MCP 让 LLM 产 **Vega-Lite 声明式 spec** → 确定性 Vega runtime 编译渲染进对话；绑定 Vega 生态。同类 MCP 通行「LLM 出 spec → 服务端校验（如 [validate_spec 工具](https://glama.ai/mcp/servers/inteligencianegociosmmx/vegaLite_mcp_server/tools/validate_spec)）→ 渲染」。
- **研究路线**：**NL4DV**（[arxiv 2008.10723](https://arxiv.org/abs/2008.10723)）NL→**中间 analytic specification**（字段/类型/任务/聚合）→Vega-Lite，且**显式处理歧义**（歧义时列候选让用户确认，不静默猜）；[2408.13391](https://arxiv.org/abs/2408.13391)（NLVIZ'24）把 analytic spec 作为 LLM 输出中间物研究。**Chat2Vis**（[2302.02094](https://arxiv.org/abs/2302.02094)）证明 LLM 直出 Vega-Lite JSON/代码不稳定需人工迭代（微调版 2303.14292）；**ChartBench/NL2Chart/Chart2Code**（[2312.15915](https://arxiv.org/abs/2312.15915)、[2510.17932](https://arxiv.org/abs/2510.17932)、[2512.19173](https://arxiv.org/abs/2512.19173)）证明复杂图表下「模型直接出可渲染物」准确率不足。
- **Vega-Lite 官方**（[vega.github.io/vega-lite](https://vega.github.io/vega-lite/)）：声明式 spec → 编译器/runtime 确定性执行数据变换+渲染——ChartBrain 的成熟参照；其 schema 宽、$ref 复杂（[json-refs #207](https://github.com/whitlockjc/json-refs/issues/207)），校验通过 ≠ 可渲染，故需 **L1 schema → L2 语义（字段/类型）→ L3 渲染冒烟**三层校验 + 单轮修复（[Spring AI](https://docs.spring.io/spring-ai/reference/2.0-SNAPSHOT/api/structured-output/validation.html)、[TYPO3 ADR-082](https://docs.typo3.org/p/netresearch/nr-llm/main/en-us/Adr/Adr082StructuredOutputs.html) 模式）；[Draco](https://github.com/uwdata/draco) 用 ASP 约束做超 schema 的语义校验。
- **厂商动作**：Highcharts 官方 MCP = **「design, validate, render」三步** + 独立的 [Chartchooser MCP](https://www.highcharts.com/blog/tutorials/highcharts-chartchooser-mcp/) 做图表选型——与 ChartBrain 三段式同构。

---

## 3. 横向对比（ChartBrain 七维视角）

| 维度 | Superset | Metabase | Grafana | Lightdash | Evidence | Vanna | ChartBrain（我们） |
|---|---|---|---|---|---|---|---|
| LLM 产出物 | SQL/私有 spec（研究/商业） | SQL+数据 | 查询语句/面板 JSON | 语义层内 SQL + 自家/ECharts JSON | 改写 MD/SQL/组件 | Plotly Python 代码 | **轻量中性 spec + 声明式变换计划** |
| text-to-SQL 是否核心 | 否（官方） | 是（single-shot） | 是（查询语句生成） | 是（scope 约束） | 查询块仍是 SQL | 是 | **不需要**（消费端自带数据） |
| 图表是否库无关 | ❌ | ❌ | ❌ | ❌（ECharts） | ❌（Svelte 运行时） | ❌（Plotly） | **是**（适配 Highcharts/ECharts…） |
| 数据变换在哪 | DB SQL 下推 | DB SQL | DB/表达式 | DB SQL（dbt） | SQL 块/DuckDB | SQL+Plotly 代码（LLM 现写） | **消费端 TS SDK 确定性执行** |
| 可作独立中间件/库 | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️（绑定重） | **是（本定位）** |
| 权限/治理 | ACL+RLS（任意 SQL 可绕） | 沙箱+治理补洞中 | 工具边界+引用 | SQL scope+平台治理 | 无内置 | 使用方自担 | **执行端强制+可审计（需自建）** |
| 对 ChartBrain 的参考价值 | 受管端点/MCP/插件注册 | 语义 repr/single-shot/权限双层 | 语义 RAG/信任设计 | scope 白名单/chart 知识 | 声明式分离/可 diff 工件 | RAG 三段式/训练闭环 | —— |

**核心观察（= ChartBrain 的产品空白）**：没有任何一个活跃项目提供「库无关的 NL→中立 spec + 声明式变换计划 + 确定性转换到任意消费端图表库、且变换在消费端执行」的独立服务。WrenAI 最全但有平台/DB 绑定；PyGWalker 证明 spec/渲染分离可行但仅 Python 且只落 vega/g2/streamlit；vega-mcp-server/glyph 证明「LLM 出受限声明 + 确定性执行」被真实采用但都绑单一生态（Vega/SVG）。数据变换几乎全部发生在「服务端 SQL 引擎」，ChartBrain「消费端自带真实数据 + TS SDK 执行声明式变换」的模型没有被任何项目覆盖。

---

## 4. 小结：行业踩过的坑 → ChartBrain 应该怎么避免

### 4.1 SQL 幻觉 / 查询正确性
- **现象**：NL→SQL 的「demo 能跑、生产不行」是行业共识（[querypanel](https://querypanel.io/blog/nl-sql-production-2026)、[dev.to 警示文](https://dev.to/aniketsoni/dont-put-an-llm-in-charge-of-your-production-database-1o9e)）；需要语义层、检索、校验、重试与人在回路（[Preset AI Assist](https://preset.io/blog/building-preset-ai-assist-how-we-brought-text-to-sql-into-apache-superset/)、[dbt: why your AI will fail without a semantic layer](https://www.getdbt.com/blog/why-your-ai-will-fail-without-a-semantic-layer)）。
- **ChartBrain 对策**：**根本不做 text-to-SQL**——消费端已有真实数据，LLM 只产出描述「对哪些列做什么变换」的声明式计划；字段引用必须命中消费端上报的真实列 schema（L2 校验），聚合语义、时间粒度、单位歧义通过枚举/受控词汇消解（参考 Metabase 的 repr 与 Lightdash 的 scope）。

### 4.2 数据权限与越权
- **现象**：权限放「提示词里不写」会被绕过；Metabase 官方红线=「只给 LLM 权限内可见元数据」，但仍要 v61 治理、v63 [PR #80150](https://github.com/metabase/metabase/pull/80150) 补「context 查询也要 user-aware」的洞；Superset 任意 SQL 工具可绕过 RLS（[PADISO](https://www.padiso.co/blog/agentic-ai-apache-superset-claude-query-dashboards/)、[CSDN 实践](https://adg.csdn.net/6a61c26c662f9a54cb9382f1.html)）；agent 长连接还有跨会话状态泄漏类 bug（[Superset PR #38827](https://github.com/apache/superset/pull/38827)）。
- **ChartBrain 对策**：把「喂给 LLM 的元数据」与「实际可变换的数据」都当作受信面：服务端执行强制过滤钩子、变换计划只引用已授权字段、每轮请求状态隔离、权限过滤在**执行期**（而非提示词期）强制；对超大结果集/全表扫描式计划设防。

### 4.3 结果可信度 / 可复现
- **现象**：让 LLM 生成可执行代码再 exec = RCE 面（[Vanna CVE-2024-5565](https://security.snyk.io/vuln/SNYK-PYTHON-VANNA-7411411) 及 [issue #1078](https://github.com/vanna-ai/vanna/issues/1078)）；生成式图表代码不可审计、不可复现（每次 LLM 现写）；「同问不同答」漂移；官方宣传的「confidence」实际来自权限/审计工程而非模型能力（[Metabase](https://www.metabase.com/blog/ai-for-everyone-with-confidence)、[Grafana trust 博客](https://grafana.com/blog/grafana-assistant-why-you-can-trust-our-agent-and-yourself-in-an-era-of-ai-hallucinations/)）。
- **ChartBrain 对策**：LLM **只出受限 schema 的中性 spec/计划、绝不产出代码/SQL**；确定性转换器 + SDK 执行使产物可测试、可快照、可回归（golden 测试）；全链路（NL→spec→库配置→渲染）可预览/可 diff/可回滚作为核心卖点。

### 4.4 上下文 / 元数据注入
- **现象**：塞全量 schema 又贵又稀释注意力；schema/语义不策展会放大幻觉（Metabase 推 Data Studio、dbt 语义层论、Cube [AI agents trustworthy](https://cube.dev/articles/ai-agents-for-data-analysis)、[GROUND](https://www.academia.edu/171779363/GROUND_Reducing_Hallucinations_in_LLM_Based_Enterprise_Analytics_Through_Governed_Semantic_Definitions)）；向量索引会漂移不能当权威 schema（Grafana）；大表不能整表进 prompt。
- **ChartBrain 对策**：上下文 = 「数据形态指纹/列 schema（白名单）+ 目标库能力声明 + 少量 NL→spec 范例」，用**结构化 repr**（参考 Metabase repr 思想）而非原始 schema；最小必要元数据、敏感信息不进 prompt；权威校验走代码而非检索。

### 4.5 图表侧：spec 幻觉与「直接出库配置」失败
- **现象**：字段/列名幻觉与无效 JSON 是最高频失败（[Chat2Vis](https://arxiv.org/abs/2302.02094) 系）；数值字面量即使有结构化解码仍可能重复死循环（[vLLM #40080](https://github.com/vllm-project/vllm/issues/40080)、[Gemini 帖子](https://discuss.ai.google.dev/t/structured-output-repetition-loop-inside-a-json-number-literal-runs-to-max-tokens-flash-vertex/175138)）；宽 schema 校验形同虚设（Vega-Lite 校验通过 ≠ 可渲染，[json-refs #207](https://github.com/whitlockjc/json-refs/issues/207)）；图表类型误判与编码组合错误（ChartBench/Chart2Code、NL4DV 的歧义设计）；Lightdash 把 spec 做成 ECharts 方言反噬复用。
- **ChartBrain 对策**：spec 语义层做**窄**：可枚举的一律 enum（图表意图/聚合方式/受控 chart-type 白名单）、`additionalProperties:false`、消除 anyOf 宽 union；**三层校验** L1 schema/类型 → L2 字段与类型命中真实列 schema → L3 渲染冒烟+字节级断言；修复**只允许一轮** validate→repair→revalidate（[TYPO3 ADR-082](https://docs.typo3.org/p/netresearch/nr-llm/main/en-us/Adr/Adr082StructuredOutputs.html)），把结构化错误回喂 LLM 重出 spec；裸数值/坐标/尺寸尽量交给确定性层；图表类型选型独立成环节（Highcharts [Chartchooser MCP](https://www.highcharts.com/blog/tutorials/highcharts-chartchooser-mcp/)、NL4DV 列候选思路）。

### 4.6 成本 / 治理 / 工程化
- **现象**：NL 服务被 token 成本与滥用打爆 → Metabase 单开 [usage-controls](https://www.metabase.com/docs/latest/ai/usage-controls) 与 v61 限额；agent 化（Vanna 2.0、Deep research）多次 LLM 调用延迟/成本上升；Grafana 官方「build for chaos」教训。
- **ChartBrain 对策**：single-shot + 受控上下文 + prompt 缓存优先；用量限额/审计从第一天设计；把统计计算从 LLM 剥离（LLM 只出意图与选择）。

---

## 5. 一句话结论

行业在「自然语言→图表」上踩的坑——SQL 幻觉、数据权限绕过、生成代码 exec 的 RCE、spec 幻觉、宽 schema 校验失效、脏语义放大幻觉、成本失控——几乎全部指向同一个收敛方向：**LLM 只做受约束的声明/选择，把执行、变换、校验、权限交给确定性的代码**。ChartBrain「LLM 出轻量中性 spec + 声明式变换计划，确定性转换器转目标库配置、消费端 TS SDK 执行」正是对这个方向最彻底的落地，且在「库无关、数据栈无关、可嵌入任意消费端的独立中间件」这一点上，与 Superset/Metabase/Grafana/Lightdash/Evidence/Vanna/WrenAI/DB-GPT/PyGWalker 等相比**没有现成竞品**（最接近：Vega-Lite 系/glyph 但绑单一生态，Evidence 的声明式分离但绑自家运行时）。建议：spec 学 Evidence 的「可序列化可 diff 工件」、窄度学 glyph 的「闭集枚举」、治理学 Lightdash 的 scope 白名单与 Metabase 的权限双层执行、校验学 Vega-Lite 生态的「L1/L2/L3 + 单轮修复」，并坚持 adapter 隔离、绝不产出可执行代码。

---

## 6. 存档文件与来源

各主题完整报告（含各自全部来源 URL 清单）：
- `research/superset-nl-ai-report.md` — Apache Superset
- `research/metabase-ai-nl-query-report.md` — Metabase
- `research/lightdash-evidence-ai-research-report.md` — Lightdash + Evidence.dev
- `research/vanna-ai-nl-query-report.md` — Vanna.ai
- `research/other-nl-open-source-projects-report.md` — WrenAI / DB-GPT / Chat2DB / PyGWalker / Dataherald / OpenMetadata 等
- `grafana_llm_nl_research_report.md`（工作区根目录）— Grafana
- `research/nl-to-chart-spec-survey.md` — NL→中性 spec/确定性渲染方向（glyph / vega-mcp / NL4DV / Chat2Vis / ChartBench / Vega-Lite / Draco / Highcharts MCP）

（以上路径均位于会话工作区 `D:\workspace\Python\viz-ai`。）
