# Apache Superset 自然语言查询与图表生成能力调研报告（面向 ChartBrain 复用评估）

> 调研方式：web_search 检索 GitHub / superset.apache.org 官方来源及权威镜像；沙箱无外网直连、无法抓取页面全文，细节依据检索标题/片段与多源交叉印证；凡属推断或需开页/读原文复核处，已显式标注「（推断）」或「（需开页复核）」「（需读 PDF 复核）」。
> 调研时点：约 2026 年年中（依据 Preset 月度 Repo Recap（2026-05/06）、Apache Superset 6.1.0 版本文档与 Release tag、7.0 路线图讨论等）。
> 重要区分：本报告调研对象是 **Apache Superset（BI 平台，apache/superset）**；同名项目 superset.sh（Codecademy 的 AI 代码编辑器）与本主题无关；另有大量第三方 "superset-mcp" 包与官方无关，需鉴别归属。
> 结论先行：Apache Superset 的 NL 能力无法脱离其平台对象模型作为独立中间件复用；官方已把 AI 能力面（以内置 MCP 服务为中心）文档化为「用户文档页 + 管理员部署鉴权文档」双层形态，但上游核心**没有内置 text-to-SQL、也没有内置「NL→图表配置生成」**——后者截至 2026 年仍处学术研究阶段（Lviv Polytechnic 论文即证），且产出 spec 绑定 Superset/ECharts。它验证了「受管执行端点 + 语义元数据上下文 + 显式 JSON chart spec + 插件化渲染 + MCP/CLI 工具面」这套工程形态的可行性，同时反向印证 ChartBrain「库无关中性 spec + 确定性声明式变换 + 客户端执行」路线存在空白与差异化价值。重点要防：SQL 幻觉与授权绕过——把 LLM 限制在「出计划/出 spec、不做不受管执行」正是行业反复验证的收敛方向。

---

## 0. 补充核实专节（两个重要来源）

### 0.1 官方文档页 "Using AI with Superset"

- 入口：https://superset.apache.org/user-docs/using-superset/using-ai-with-superset/
- 已证实：这是 **Apache Superset 官方用户文档（user-docs/using-superset/ 目录）下专门讲 AI 用法的页面**；从 URL 锚点可见页面含 `browse-databases` 等小节，说明「AI 能力使用说明」已被正式收编进官方用户文档体系（此前 AI 相关内容主要在 admin/configuration 侧，如 6.1.0 的 MCP Server 部署鉴权文档：https://superset.apache.org/admin-docs/6.1.0/configuration/mcp-server/ ）。
- （需开页复核）页面各小节具体覆盖哪些功能（text-to-SQL？chart 描述？chat？MCP 使用指引？），检索无法还原正文结构；如需离线佐证，可在 apache 文档仓库检索 `using-ai-with-superset` 源文件。
- 结论影响：把「上游 AI 只有提案态」修正为 **「官方已存在正式的用户级 AI 文档页 + 6.1.0 管理员级 MCP 文档」**——官方 AI 能力面（以 MCP 为主）已进入「正式文档化」阶段；但该页偏「用户如何用 AI 浏览/查询数据」，并非「让 LLM 直接生成图表配置」。

### 0.2 论文《Natural Language–Driven Chart Specification and Generation in Superset》（Lviv Polytechnic，2026）

- 英文页面：https://science.lpnu.ua/cds/all-volumes-and-issues/volume-8-number-1-2026/natural-language-driven-chart-specification-and
- PDF：https://science.lpnu.ua/sites/default/files/journal-paper/2026/apr/42311/202612.pdf
- 乌语版页面：https://science.lpnu.ua/uk/cds/vsi-vypusky/vypusk-8-nomer-1-2026/specyfikaciya-ta-generaciya-diagram-na-osnovi-pryrodnoyi-movy
- 已证实事实：
  - 作者：Yaroslav Mashtaliar、Alexander Belej、Yulian Fedirko；期刊 2026 年第 8 卷第 1 期，PDF 落款 2026-04。
  - 主题：**自然语言直接驱动 Superset 的「图表规格（chart specification）生成与图表生成」**——与 text-to-SQL 相反方向：NL →（Superset chart spec）→ 图表。
  - 关键词页证实涉及 natural language interfaces / large language models（великі мовні моделі）：https://science.lpnu.ua/keywords-paper/natural-language-interfaces 、https://science.lpnu.ua/uk/keywords-paper/velyki-movni-modeli
  - PDF 可检索文本含结论性表述："This research shows a great potential of using LLMs for automating data visualization and analysis."（命中锚点：https://science.lpnu.ua/sites/default/files/journal-paper/2026/apr/42311/202612.pdf#2#2 ）
- （需读 PDF 复核）方法细节：所用 LLM（GPT 系/开源）、输出 spec 形态（Superset `form_data`/ECharts JSON？）、上下文注入方式（dataset schema？列与指标？）、评估方式与准确率、失败案例。搜索引擎未索引正文，建议直接下载 PDF 通读。

---

## 1. 项目信息与定位

- 项目：**Apache Superset**
- GitHub：https://github.com/apache/superset
- 定位：Apache 基金会顶级项目，云原生开源 BI / 数据可视化平台（Python Flask 后端 + React 前端 + 基于 Apache ECharts 的 superset-ui 可视化插件体系），主打「人人可用的数据探索与看板」。
- 一句话：**完整 BI 平台（数据库连接 / 数据集与指标 / 图表与看板 / 权限治理），不是库无关的中间件。**
- 官方站点与文档体系：https://superset.apache.org （user-docs / admin-docs / developer-docs 三级）。

## 2. 维护状态（截至调研时点）

- **Star 量级**：约 **7.4 万**（第三方统计站快照 74.5k、全球排名约 #237）：https://www.star-history.com:2096/apache/superset/ ；2026 趋势页佐证：https://www.datamatastudios.com/tools/trending/superset
- **版本节奏**：v5.0.0 → **v6.1.0** 的 Release tag 均可见（6.1.0 / 6.1.0rc1）：https://github.com/apache/superset/releases/tag/6.1.0 、https://newreleases.io/project/github/apache/superset/release/6.1.0
- **活跃度**：极活跃。Preset 月度社区/仓库回顾连载到 2026-05/06（https://preset.io/blog/apache-superset-repo-recap-june-2026/ 、https://preset.io/blog/apache-superset-community-update-february-2026/ ）；主干持续合入新 PR（MCP 相关 #38641 / #38827，见 3.1）；Apache dev 邮件列表活跃：https://lists.apache.org/list.html?dev@superset.apache.org
- **演进方向**：7.0 路线图公开讨论已开（讨论 #40904）：https://github.com/apache/superset/discussions/40904
- 备注：精确单日/单周 commit 时间无法核实（无 GitHub API 网络访问），「月更博客 + 持续发版 + 主干高频合入」足以支撑「活跃维护」结论。

## 3. NL → 图表能力实现机制

**总判断**：官方路线 = **「平台内置 MCP 工具面（可查询 / 可操作 / 部分可生成）+ 正式 AI 文档（见 0.1）」**，而非「NL→图表库配置」。上游核心没有内置 text-to-SQL、也没有内置「NL→图表 spec/配置」；后者目前只见于学术研究（见 3.6 / 0.2）与商业/生态实现；真正生产级 text-to-SQL / 会话分析在 Preset（商业）一侧。

### 3.1 官方已内置：MCP（Model Context Protocol）服务 —— 目前最实质的「AI 可调用面」

- 由 **SIP-171** 提出、经 **SIP-187** 修订架构，已在源码树内实现（`superset/mcp_service/...`，按 chart / dashboard / dataset / query / system 等域组织 tools 与 resources）：
  - SIP-171 #33870：https://github.com/apache/superset/issues/33870 ；SIP-187 #35498：https://github.com/apache/superset/issues/35498
  - 源码实证（6.1.0rc1）：https://gitlab.com/gitlab-oss-package-research/source/pypi/ap/apache-superset-0a31d8da/-/blob/6.1.0rc1/superset/mcp_service/chart/tool/list_charts.py
  - 实例元数据资源源码：https://github.com/apache/superset/blob/d23b0cad/superset/mcp_service/system/resources/instance_metadata.py
- 官方文档：部署与鉴权（6.1.0 admin-docs）：https://superset.apache.org/admin-docs/6.1.0/configuration/mcp-server/ ；开发者 MCP 扩展：https://superset.apache.org/developer-docs/extensions/mcp/
- 工具能力：查询型 + 操作型（按数据集查询、列/指标信息、图表/看板列表，乃至 `generate_dashboard` 类生成工具）：
  - 官方修复「generate_dashboard 跨会话 SQLAlchemy 状态」PR #38827（佐证存在生成类工具，且跨会话状态是真实工程坑）：https://github.com/apache/superset/pull/38827
  - MCP 工具带面向 LLM 可发现性的 annotation 元数据（PR #38641）：https://github.com/apache/superset/pull/38641
- 第三方源码导读（非官方）：https://deepwiki.com/apache/superset/4.6.2-mcp-tools-and-resources 、https://deepwiki.com/apache/superset/4.6-mcp-service 、https://deepwiki.com/apache/superset/4.6.1-mcp-service-architecture
- Preset 技术深挖（工具面/鉴权/安全设计）：https://preset.io/blog/superset-mcp-service-deep-dive/
- Preset 企业版 MCP（多租户隔离、能「构建」图表/看板）：https://preset.io/blog/preset-mcp-announcement/ 、https://preset.io/blog/preset-mcp-open-source-to-enterprise/ 、产品页 https://preset.io/ai/mcp/
- 鉴别：第三方 superset-mcp 包泛滥（Winding2020 / thedeceptio / bintocher 等 npm/PyPI），与官方内置并存，需鉴别归属：https://github.com/Winding2020/superset-mcp 、https://github.com/thedeceptio/superset-mcp

### 3.2 官方 AI 能力「文档化」现状（用户 + 管理员双层）

- 用户侧："Using AI with Superset" 官方用户文档专页（详见 0.1）：https://superset.apache.org/user-docs/using-superset/using-ai-with-superset/
- 管理员侧：MCP Server 部署与鉴权（6.1.0）：https://superset.apache.org/admin-docs/6.1.0/configuration/mcp-server/
- 判断（推断）：官方 AI 面以 MCP 为中心进入「正式文档化」阶段，但「文档化 ≠ 功能完整」——上游核心 text-to-SQL / NL→图表仍未见正式内置。

### 3.3 上游提案中的 AI Assistant / Agentic 蓝图（多为提案/进行中状态）

- **SIP-166 AI Assistant**（#33215）：规划对话式 AI 助手（作用于数据集/图表/看板/语义查询的 assistant 层）：https://github.com/apache/superset/issues/33215
  - 存在带 `docs/docs/configuration/ai_assistant.mdx` 的实现分支（tenstorrent 的 apache-superset-tt fork，awilliamsTT/ai-assistant）：https://github.com/tenstorrent/apache-superset-tt/blob/awilliamsTT/ai-assistant/docs/docs/configuration/ai_assistant.mdx
  - （需开页复核）是否合入上游主干无法确认；从 6.x 主干结构与官方文档看更像「进行中/未完成」。
- **SIP-128 AI/LLM query generation in SQL Lab**（#28167）：https://github.com/apache/superset/issues/28167
- **SIP-155 Agentic Dashboard and Chart Summarization**（#32408）：https://github.com/apache/superset/issues/32408
- **SIP-157 Agentic Query In Dashboard**（#32650）：https://github.com/apache/superset/issues/32650
- 备注：SIP-128/155/157 均未见「已合入主干」的直接证据（需开页复核）。

### 3.4 生产化 text-to-SQL / 会话 BI 在 Preset（商业）侧

- **Preset AI Assist**（text-to-SQL 代表实现）：语义层/受控元数据 + LLM 生成 SQL + 人在回路/护栏，而非裸 schema 提示：https://preset.io/blog/building-preset-ai-assist-how-we-brought-text-to-sql-into-apache-superset/
- **Preset Chatbot**（原型到生产：上下文/RAG、语义层、权限、评估）：https://preset.io/blog/preset-chatbot-technical-deep-dive/ ；产品页 https://preset.io/ai/chatbot/
- **Preset Agent Skills**（选图/度量口径等专家知识沉淀为可复用 agent 技能）：https://preset.io/blog/announcing-preset-agent-skills/
- **LLM 方案（BYOK/外接）**：官方/上游无「自带 LLM」，管理员配置外部模型 API（供应商矩阵与自托管与否需开页核对官方配置文档）；Preset 商业产品走「托管 + 自带 Key」。结论：生态整体为**外接/自带 Key（BYOK）**，无内置模型。

### 3.5 sup CLI（preset-io/superset-sup）

- **sup**：Preset 推出的现代 CLI，面向自动化与 agent（非 Apache 官方，但作者为 Superset 核心团队），定位为 Superset/Preset workspace 的脚本化操作层：
  - 官方博客：https://preset.io/blog/meet-sup-supersets-new-cli-for-automation-and-agents/
  - 仓库 https://github.com/preset-io/superset-sup 、README https://github.com/preset-io/superset-sup/blob/main/README.md 、PyPI https://libraries.io/pypi/superset-sup
- （需开页复核）命令面细节未读到全文；从定位推断：声明式/脚本化操作 workspace 对象（datasets/charts/dashboards/SQL），供 agent 调用，底层能力与 REST API / MCP 能力面重叠。

### 3.6 「NL → 图表 spec」生成：截至 2026 年仍是研究课题（详见 0.2）

- **论文（0.2）**是「直接 NL→Superset chart spec→图表」方向的最新学术尝试（2026-04，Lviv Polytechnic），已证实其结论方向为「LLM 在自动化数据可视化与分析上潜力巨大」；方法/评测细节需读 PDF 补全（0.2）。
- **相邻研究佐证「chart spec 作 LLM 中间表示」是活跃方向**：
  - VLM chart-to-code 用结构化 chart spec 提升推理：https://ar5iv.labs.arxiv.org/html/2602.10880
  - 系统评估 LLM 制图能力：https://www.mendeley.com/catalogue/b6423953-3b56-3784-8ec9-d8c60a28d104/
  - 语义层中介 NL2SQL agent（异构企业库）：https://arxiv.org/html/2606.31041v1
  - 这些「spec 中间层」思路与 ChartBrain「中性 spec」同构，但均绑定特定平台/图表库；未见「库无关中性 spec + 客户端确定性转换」的实现。
- **生态零星实践**（二手）：社区用 Qwen3-14B 接 Superset 看板生成洞察：https://blog.csdn.net/weixin_33814090/article/details/155367346

## 4. 不足 / 空白点（ChartBrain 视角）

1. **强绑定 Superset 平台，无法当独立中间件复用**：NL 能力全部长在 Superset 对象模型上（database / dataset / metrics / charts / dashboards、`form_data` spec、superset-ui / ECharts 插件、RLS/角色权限体系）；官方 MCP 只是「运行中实例的工具面」。**没有可摘出的「NL→中性图表 spec + 声明式变换」独立服务**——这正是 ChartBrain 的差异化空间。
2. **「NL→图表 spec 生成」至今是研究课题**：2026 年论文仍把「NL 直接产出 Superset chart spec 并生成图表」当作待验证研究（0.2/3.6），且 spec 绑定 Superset/ECharts；图表类型映射与配置正确性无官方兜底。
3. **两条路线都不「库无关」、数据变换位置固定**：text-to-SQL 线产物是 SQL、聚合在数据库端下推；NL→图表线产物是 ECharts 私有配置。都没有「消费端真实数据在手 + 库无关 spec + 客户端确定性变换」这一层。
4. **上游 AI 碎片化、多数未落地**：SIP-128/155/157/166 多为提案态；当前官方开源可用面 = 内置 MCP + 自己写 agent；正式文档（3.2）虽有，但「文档化 ≠ 功能完整」。
5. **无统一「语义层」元数据**：Superset 数据集只有列/指标/计算列，缺口径、层级、同义词等语义元数据，LLM 上下文单薄（Preset 为此自建语义层）。ChartBrain 的中性 spec 需自带一套与图表库、业务语义解耦的表达，Superset 无现成抽象可抄。
6. **权限模型不可移植**：Superset 安全 = 数据集 ACL + 行级安全（RLS）+ 角色，只在「受管查询路径」生效；**任意 SQL（SQL Lab / DBA）可绕过**，需自行收口。ChartBrain 需「与数据访问策略解耦的沙箱/授权」设计，而非复制平台权限。

## 5. 可以借鉴的点

- **受管执行端点防越权**：PADISO 实践——agent 只被允许调用「数据集查询」这类受管 API、天然套用 RLS，而非给任意 SQL：https://www.padiso.co/blog/agentic-ai-apache-superset-claude-query-dashboards/ → ChartBrain 的变换计划应做成受管、白名单化、只作用于已授权数据的操作。
- **显式 JSON chart spec + 插件注册表**：Superset form_data + viz 插件体系多年稳定，证明「配置与渲染分离、插件化注册」生产可行；结合 chart-spec 作 LLM 中间表示的学界共识（3.6），印证 ChartBrain「中性 spec + 确定性转换器」方向正确，缺的只是「库无关」这一环（尚无先例）。
- **LLM 只做受限决策、执行前人在回路/干跑**：Preset AI Assist / Chatbot 工程经验（语义层上下文、护栏、评估、成本控制），见 3.4。
- **选图/度量等专家知识做成可复用 agent 技能**（Preset Agent Skills），避免每次把专家规则塞进 prompt：见 3.4。
- **MCP 标准接口 + 工具描述元数据**：官方把「工具 annotation 写给 LLM 看」当工程问题（PR #38641）；用 instance metadata 资源做上下文（3.1）——ChartBrain 应把「图表库能力声明 + 数据字段语义」做成结构化上下文而非原始 schema。
- **提案制（SIP）+ 双层文档化推进大特性**：MCP 从 SIP-171 修订到 SIP-187 落地并配套用户/管理员文档（3.2/0.1），值得学习。

## 6. 帮我们避坑的点（含官方教训）

- **SQL 幻觉与「Demo 能跑、生产不行」**（行业共识：需语义层、检索、校验、重试与人在回路）：https://querypanel.io/blog/nl-sql-production-2026 、https://dev.to/aniketsoni/dont-put-an-llm-in-charge-of-your-production-database-1o9e 、https://dev.to/vivekdraxlr/dont-trust-ai-generated-sql-blindly-a-developers-validation-checklist-5f9g
- **权限防绕过的具体教训**：LLM 拿到「任意 SQL」工具则 RLS 形同虚设；社区实践是限定受管查询 API、把 RLS/角色执行于请求用户上下文（PADISO 上文）；中文实践：https://adg.csdn.net/6a61c26c662f9a54cb9382f1.html → ChartBrain「LLM 出计划、确定性执行器执行」必须能证明计划只引用已授权数据、变换是可验证的纯函数。
- **执行状态/会话管理是真实 bug 源**：官方 MCP 修过「跨会话共享 SQLAlchemy session」bug（PR #38827）——agent 长连接场景的**每轮隔离与状态清理**要当一等工程问题：https://github.com/apache/superset/pull/38827
- **图表类型映射与配置生成不可全信 LLM**：viz 选择与 ECharts option 生成至今是论文级难题（0.2 即证）；需要**约束化类型枚举 + schema 校验 + 确定性兜底**（schema 通过 ≠ 语义正确），ChartBrain 的声明式计划天然适合做这层。
- **元数据注入的「信息卫生」**：schema 注入过多稀释注意力、过少致幻觉；避免把敏感列名/未授权表泄给模型（PADISO / CSDN 治理文）。应设计「最小必要元数据 + 白名单列」。
- **别把平台对象模型当通用抽象**：Superset 的 form_data 与数据集强耦合；ChartBrain 若把「数据集 + 指标」当上下文会重蹈「绑定平台/绑定 SQL」覆辙——坚持库无关 spec，且不要以「聚合下推 SQL」为唯一路径（消费端数据在手的场景不需要 text-to-SQL）。
- **同名/仿冒项目多**：superset.sh（Codecademy AI 编辑器）与大量第三方 superset-mcp 包均与 Apache 官方无关，集成前务必核对 apache/ vs preset-io/ vs 个人归属。

---

## 7. 引用来源清单（全部 URL）

官方（apache/superset、superset.apache.org）：
- https://github.com/apache/superset
- https://superset.apache.org （官方站点/文档入口）
- https://github.com/apache/superset/releases/tag/6.1.0 （Release 6.1.0）
- https://newreleases.io/project/github/apache/superset/release/6.1.0
- https://superset.apache.org/user-docs/using-superset/using-ai-with-superset/ （Using AI with Superset，用户文档）
- https://superset.apache.org/admin-docs/6.1.0/configuration/mcp-server/ （MCP Server 部署与鉴权）
- https://superset.apache.org/developer-docs/extensions/mcp/ （MCP 集成）
- https://github.com/apache/superset/discussions/40904 （7.0 路线图讨论）
- https://lists.apache.org/list.html?dev@superset.apache.org （dev 邮件列表）
- https://github.com/apache/superset/issues/33870 （SIP-171 MCP 提案）
- https://github.com/apache/superset/issues/35498 （SIP-187 MCP 修订架构）
- https://github.com/apache/superset/issues/33215 （SIP-166 AI Assistant）
- https://github.com/apache/superset/issues/28167 （SIP-128 SQL Lab LLM 查询）
- https://github.com/apache/superset/issues/32408 （SIP-155 Agentic 摘要）
- https://github.com/apache/superset/issues/32650 （SIP-157 看板内 Agentic Query）
- https://github.com/apache/superset/blob/5.0.0rc1/CHANGELOG/5.0.0.md （5.0.0 变更日志）
- https://github.com/apache/superset/pull/38641 （feat(mcp): tool annotations）
- https://github.com/apache/superset/pull/38827 （fix(mcp): generate_dashboard 跨会话 SQLAlchemy 错误）
- https://github.com/apache/superset/discussions/38703 （6.1.0rc1 Docker 启动 MCP server 讨论）
- https://github.com/apache/superset/blob/d23b0cad/superset/mcp_service/system/resources/instance_metadata.py （MCP instance metadata 源码）
- https://gitlab.com/gitlab-oss-package-research/source/pypi/ap/apache-superset-0a31d8da/-/blob/6.1.0rc1/superset/mcp_service/chart/tool/list_charts.py （6.1.0rc1 MCP chart 工具源码实证）

论文与学术：
- https://science.lpnu.ua/cds/all-volumes-and-issues/volume-8-number-1-2026/natural-language-driven-chart-specification-and （论文标题页）
- https://science.lpnu.ua/sites/default/files/journal-paper/2026/apr/42311/202612.pdf （论文 PDF）
- https://science.lpnu.ua/sites/default/files/journal-paper/2026/apr/42311/202612.pdf#2#1 、#2#2 （PDF 片段锚点：作者行/结论片段）
- https://science.lpnu.ua/uk/cds/vsi-vypusky/vypusk-8-nomer-1-2026/specyfikaciya-ta-generaciya-diagram-na-osnovi-pryrodnoyi-movy （乌语版页面）
- https://science.lpnu.ua/keywords-paper/natural-language-interfaces 、https://science.lpnu.ua/uk/keywords-paper/velyki-movni-modeli （论文关键词页）
- https://ar5iv.labs.arxiv.org/html/2602.10880 （Chart Specification：VLM chart-to-code，相邻研究）
- https://www.mendeley.com/catalogue/b6423953-3b56-3784-8ec9-d8c60a28d104/ （系统评估 LLM 制图能力，相邻研究）
- https://arxiv.org/html/2606.31041v1 （语义层中介 NL2SQL agent，相邻研究）

Preset（Superset 核心团队公司，非 Apache 官方）：
- https://preset.io/blog/meet-sup-supersets-new-cli-for-automation-and-agents/ （Meet 'sup!' CLI）
- https://github.com/preset-io/superset-sup 、https://github.com/preset-io/superset-sup/blob/main/README.md 、https://libraries.io/pypi/superset-sup （sup CLI）
- https://preset.io/blog/building-preset-ai-assist-how-we-brought-text-to-sql-into-apache-superset/ （Preset AI Assist）
- https://preset.io/blog/preset-chatbot-technical-deep-dive/ （Preset Chatbot 深挖）
- https://preset.io/ai/chatbot/ （Chatbot 产品页）
- https://preset.io/blog/announcing-preset-agent-skills/ （Preset Agent Skills）
- https://preset.io/blog/superset-mcp-service-deep-dive/ （Superset MCP Service 技术深挖）
- https://preset.io/blog/preset-mcp-announcement/ （Preset MCP：AI That Doesn't Just Answer, It Builds）
- https://preset.io/blog/preset-mcp-open-source-to-enterprise/ （Preset MCP：从开源到企业版）
- https://preset.io/ai/mcp/ （Preset MCP 产品页）
- https://preset.io/blog/superset-5-0-0-release-notes/ 、https://preset.io/blog/apache-superset-6-0-release/ 、https://preset.io/blog/apache-superset-6-1-release/ （版本 Release Notes）
- https://preset.io/blog/apache-superset-repo-recap-june-2026/ 、https://preset.io/blog/apache-superset-community-update-february-2026/ （月度社区回顾）

实现分支 / 生态 MCP（鉴别归属用）：
- https://github.com/tenstorrent/apache-superset-tt/blob/awilliamsTT/ai-assistant/docs/docs/configuration/ai_assistant.mdx （SIP-166 AI Assistant 实现分支文档）
- https://github.com/Winding2020/superset-mcp 、https://github.com/thedeceptio/superset-mcp （第三方 superset-mcp，与官方无关）
- https://superset.atwish.org/docs/MCP/Authentication/HS256SharedSecret/ （第三方部署文档：MCP HS256 共享密钥鉴权，供参考）

观点 / 治理 / 二手（含警示）：
- https://www.padiso.co/blog/agentic-ai-apache-superset-claude-query-dashboards/ （Letting an Agent Query Superset Without Breaking Governance）
- https://querypanel.io/blog/nl-sql-production-2026 （NL2SQL 生产化失败模式）
- https://dev.to/aniketsoni/dont-put-an-llm-in-charge-of-your-production-database-1o9e
- https://dev.to/vivekdraxlr/dont-trust-ai-generated-sql-blindly-a-developers-validation-checklist-5f9g
- https://adg.csdn.net/6a61c26c662f9a54cb9382f1.html （接入 AI Agent 并确保数据权限不被绕过，中文实践）
- https://blog.csdn.net/weixin_33814090/article/details/155367346 （Qwen3-14B 与 Superset 看板集成，二手）

活跃度佐证（第三方统计）：
- https://www.star-history.com:2096/apache/superset/ （star 74.5k 快照）
- https://www.datamatastudios.com/tools/trending/superset （2026 趋势）
- https://deepwiki.com/apache/superset/4.6.2-mcp-tools-and-resources 、https://deepwiki.com/apache/superset/4.6-mcp-service 、https://deepwiki.com/apache/superset/4.6.1-mcp-service-architecture （DeepWiki 源码导读，非官方）
