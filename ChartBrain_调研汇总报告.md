# ChartBrain 竞品调研汇总报告

> 调研日期：2026-09-05 · 方法：web_search 检索 GitHub / 官方文档 / 官方博客 / 论文，三路并行深挖（LLM 图表框架 / 开源 BI / 商业产品），另有一手检索交叉验证。
> 证据边界：本环境无法直连抓取 GitHub API，文中 star 数与 commit 时间多为第三方快照的**数量级估计**，引用前请按文末链接复核。详细分报告见文末「存档文件」。

---

## 0. 一句话结论

「自然语言 → 图表」方向已被大厂验证（微软 2026-07 开源 **Flint** 可视化中间语言；ThoughtSpot 发行业文章《The Missing Language Between LLMs and Charts》）。但**「库无关中性 spec + 确定性转换到 Highcharts/ECharts + 声明式数据变换 + 消费端 SDK 执行」这个完整组合，在所有调研对象里都不存在**——ChartBrain 的真实空位成立。

---

## 1. 全景：四类玩家

| 类别 | 代表 | 对我们的意义 |
|---|---|---|
| 中间层 / 规格语言（最相关） | Flint、Vega-Lite、glyph、vega-mcp、NL4DV、chart-llm | 直接印证「中性 spec + 确定性执行」路线 |
| LLM 图表生成库/工具（2023 世代，多停更） | LIDA、VMind、AVA、Rath/VizGPT、chartgpt 群 | 反面教材：直出代码、绑单库、自采样 |
| 开源 BI 平台（平台绑定） | Superset、Metabase、Grafana、Lightdash、Evidence、Vanna、WrenAI、PyGWalker | 借鉴语义层、权限治理、工程化 |
| 商业产品（受控翻译层范式） | ThoughtSpot、Power BI、Tableau、QuickSight、Looker、国内 | 借鉴可信度、语义约束、安全设计 |

---

## 2. 仍在维护且做得好的（重点）

### 2.1 ★ microsoft/flint-chart（Flint）—— 与 ChartBrain 理念最接近，战略参照 / 潜在竞品
- 定位：面向 AI agent 的**可视化中间语言 + 确定性编译器**。LLM 只产出「高层语义意图」的简洁 spec，布局/坐标轴/标签由编译器推导，可渲染到 Vega-Lite / ECharts / Chart.js 等多后端（约 48 图表 × 5 后端）。
- 状态：**活跃、官方级、2026-07 新开源**（0.2 版本，自带 MCP server，npm 包 flint-chart / flint-chart-mcp）。
- 借鉴：整套「语义 spec + 确定性多后端编译 + MCP 交付」架构；adding-a-backend / adding-a-chart-template 扩展点设计。
- 空位：Highcharts 是否一等支持待核实；**声明式数据变换是否为 spec 一等公民**，公开资料未见强调——这正是 ChartBrain 可差异化的点。

### 2.2 VisActor/VMind —— 工业级 text2chart，但绑 VChart
- 定位：文本/CSV → 数据抽取 → 字段推断 → 图表 spec → 主题，一步出图。
- 借鉴：pipeline 模块分层 + **BYOK（自带 LLM key）/ 官方 Open API 双轨服务化**（即 ChartBrain 服务端应有的模块边界与商业模式）。

### 2.3 Apache Superset —— 官方 MCP 工具面
- 约 7.4 万 star，极活跃。上游开源核心**没有内置 text-to-SQL / NL→图表**，最实质的 AI 面是内置 MCP 服务（chart/dashboard/dataset/query 工具）；生产级 text-to-SQL 在 Preset 商业侧。
- 借鉴：受管执行端点防越权、显式 JSON chart spec + 插件注册表、人在回路、MCP 工具带 annotation。

### 2.4 Metabase —— single-shot text-to-SQL + 语义层 repr
- 约 5 万 star，极活跃，AI（Metabot）已全面开源。
- 借鉴：① 语义层对象做**喂 LLM 的文本 repr**；② single-shot（不搞多步 agent）+ 受控上下文 + prompt 缓存；③ **权限在「喂 LLM 的内容」与「实际查询」两层都按用户过滤**。

### 2.5 Grafana Assistant —— LLM 网关 + 确定性统计
- 约 7.6 万 star。路线是 NL→查询语句/面板 JSON，闭环在自家面板系统。
- 借鉴：provider 无关网关 + 可 import SDK；元数据向量库做语义 RAG；**统计计算交给确定性代码，LLM 只出意图**；全链路可预览/审计/回滚的信任设计。

### 2.6 Lightdash —— 语义层白名单 scope
- 约 1 万 star。agent text-to-SQL 受 dbt 语义层白名单约束（agent SQL scope 治理 API），图表配置透传 ECharts。
- 借鉴：**「变换计划白名单」治理思路**；把「合法图表语法」固化成 skill/chart-reference 知识约束 LLM。

### 2.7 Vanna.ai —— RAG 三段式（但有 RCE 教训）
- 约 2.4 万 star。DDL/文档/问答对三段式向量化注入，成功样本自动回流。
- 借鉴：RAG 三段式知识分层、训练闭环、澄清追问交互、可插拔接口。
- ⚠️ 避坑：其「LLM 生成 Plotly 代码并 exec」出过 **CVE-2024-5565（CVSS 8.1 prompt injection → RCE）**。

### 2.8 WrenAI —— 最全的全栈对标（但平台绑定）
- 约 1 万 star。语义层 MDL + text-to-SQL + 独立 chart 生成端点 + TS/Python SDK + MCP。
- 借鉴：chart 生成做成显式 API；语义层显著提升质量。空位：图表 spec 绑自家渲染、变换在服务端 SQL 引擎。

### 2.9 PyGWalker —— 统一 spec + 多渲染后端（思路的最直接证明）
- 约 1.3 万 star。**统一声明式 spec → vega/g2/streamlit 多渲染后端**，spec/渲染分离做得最好；ask-to-viz 接 OpenAI 兼容 API。
- 价值：证明「统一 spec + 多渲染后端」可行。局限：仅 Python、进程内 DataFrame。

### 2.10 glyph —— 与 ChartBrain 确定性哲学最同构
- 定位：给 agent 用的确定性图表服务——**52 个受控动词 + 强类型参数**（把 LLM 自由度压到枚举选择）+ **byte-stable**（同输入同输出逐字节一致，可 diff 自校验、可 golden 测试）+ **DuckDB 在引擎内做过滤聚合**（LLM 不写 SQL）。
- 借鉴：受控动词闭集 + byte-stable + 引擎内变换。局限：产物是 SVG，非 Highcharts/ECharts。

### 2.11 vega-mcp-server —— spec/渲染分离样板
- MCP 让 LLM 产 Vega-Lite 声明式 spec → 确定性 Vega runtime 渲染；文档/架构说明质量高。绑 Vega 生态。

---

## 3. 这些项目的不足（= ChartBrain 的空白）

1. **都绑单一生态/库**：Vega-Lite / VChart / ECharts / Plotly / 自家运行时，没有库无关中性层（官方 echarts-mcp、Highcharts ChartChooser MCP 也都是"单库 + AI"）。
2. **数据变换几乎全在服务端 SQL 引擎**：没有「消费端自带真实数据 + SDK 执行声明式变换」的模型——这是 ChartBrain 独有的覆盖点。
3. **多数不是独立可嵌入的中间件**：要么是完整 BI 平台（Superset/Metabase/Grafana/Lightdash/WrenAI），要么是库/CLI（LIDA/VMind/Vanna），要么是 demo（VizGPT/chartgpt 群）。
4. **"grammar-agnostic"名不副实**：LIDA 实为给 matplotlib/ggplot 等**生成代码**，无中性 spec、无确定性编译——"库无关是口号不是架构"。
5. **让 LLM 直出代码/配置的三大弱点**（2025–2026 有论据）：正确性不可控且错误静默（Posit BluffBench）；非确定性 × 目标库 API 漂移 = 脆弱；为修补随机性走"写码→校验→改码"回路套娃（延迟/成本/SLA 难保证）。

---

## 4. 可借鉴清单（按优先级，每个给「最值得抄的一个点」）

1. **Flint**：spec 由「人类可编辑的高层语义」组成，细节由确定性编译器推导填充——**把 LLM 从画图工降级为意图表达者**；顺带抄扩展点与 agent-workflows 教程组织。
2. **VMind**：数据抽取 → 字段推断 → 图表推荐 → spec 生成 → 主题的模块化 stage 划分 + BYOK/Open API 双轨。
3. **chart-llm**（CHI'24）：把 filter/aggregate/bin/derive 变换步骤作为 spec 一等公民纳入标注维度；用「真实 spec 种子 + LLM 生成 NL + LLM 评分过滤」流水线构建评测集。
4. **viz-gpt**：每轮维护 {datasetSchema + 当前 spec + 历史编辑} 的机器可读「图表状态」，LLM 只做增量修改而非每次从零生成。
5. **ChartMimic**：把「生成 → 确定性渲染 → 图像/结构比对」建成转换器的自动回归测试（"能跑≠对"反过来成为质量护城河）。
6. **glyph**：受控动词闭集 + byte-stable 可 diff（spec 窄化的极端形态）。
7. **Metabase**：语义层 repr 喂 LLM + 权限双层执行 + single-shot + prompt 缓存。
8. **Lightdash**：变换计划白名单 scope；把合法语法固化成结构化知识。
9. **Evidence**：一切皆文本、可序列化、可 diff、可 review——把「spec + 变换计划」做成可版本化工件。
10. **商业产品共性**：schema 声明收敛 LLM 可答域（QuickSight Q Topics / Looker LookML）；生成结果可回读、可确认、可追溯（PBI Copilot 展示 DAX 供审）；数据面与 LLM 面分离 + 脱敏/零留存/私有化推理 + 审计（Sisense 按字段白名单、PBI RLS）；解释层做成产品功能（Pulse data guide、Looker 下钻）；角色分层——LLM 只翻译与规划，数值计算与渲染全走确定性代码。

---

## 5. 避坑清单（重点）

### 安全与正确性
1. **绝不让 LLM 生成并执行代码/SQL**：Vanna CVE-2024-5565（prompt injection → RCE）是血的教训；ChartBrain 应只出受限 schema 的中性 spec/计划。
2. **别让 LLM 直出 ECharts/Highcharts 全量配置**（echarts-mcp 反面）：面向实现、schema 不稳定、非意图级、错得静默。
3. **别做 text-to-SQL**："demo 能跑、生产不行"是行业共识；权限可被任意 SQL 绕过（Superset RLS）。ChartBrain 根本不需要——消费端自带数据。
4. **别让 LLM 碰数值计算/统计**：确定性代码做，LLM 只出意图与选择（Grafana 已验证）。
5. **别自采样数据喂 LLM**（LIDA）：丢精度；要么用真实数据 + 声明式变换，要么 schema + 受控摘要。

### spec 与校验
6. **宽 schema 校验形同虚设**（Vega-Lite 校验通过 ≠ 可渲染）：spec 语义层做窄——可枚举的一律 enum、`additionalProperties:false`、消除 anyOf 宽 union；三层校验 L1 schema/类型 → L2 字段命中真实列 schema → L3 渲染冒烟；修复只允许一轮 validate→repair→revalidate。
7. **别把 spec 做成库方言**（Lightdash 被 ECharts 绑住反噬复用）：坚持 adapter 隔离，中性 spec 稳定、库升级只影响受版本控制的转换器。
8. **歧义要澄清而非硬答**（NL4DV / QuickSight Q 的教训）。

### 工程与治理
9. **供应链纪律**：AntV npm 2026-05 投毒事件（GMS-2026-75）提醒锁版本 + 镜像 + 依赖审计；图表领域 npm 包名大量重名（echarts-mcp 系、chartgpt 系）→ 注册自有命名空间。
10. **同名/改名陷阱**：chartgpt 至少 3 实现 + 2 论文同名；daVinci-LLM 名称漂移成基座模型论文。竞品监控以 **repo URL + commit 时间戳** 为准。
11. **成本/治理前置**：single-shot + 受控上下文 + prompt 缓存优先；用量限额/审计从第一天设计（Metabase usage-controls 教训）。
12. **权限在执行期强制，不在提示词期**：把「喂 LLM 的元数据」与「实际可变换的数据」都当受信面；每轮请求状态隔离（Superset 跨会话泄漏 bug 教训）。
13. **"能跑 ≠ 对"**：建立 golden 测试/快照/渲染比对回归，作为核心卖点而非事后补救。
14. **别信 star 数/"精准率"宣传**：国内厂商"精准率"多为 PR 口径，需 POC 实测。
15. **语义 schema 维护是隐性成本**：自动推断 + 可覆写，别让客户手工维护。

---

## 6. 对 ChartBrain 的行动建议

1. **立即建 Flint 跟踪**：盯 microsoft/flint-chart 的 releases/spec 演进（0.x 未固化，是互操作窗口）；评估「接受 Flint spec 作为输入方言之一」，把 Flint 当参照系 + 潜在竞品双重对待。
2. **对外差异点 = 声明式数据变换 + Highcharts/ECharts 确定性转换器 + 消费端 SDK 执行**——调研确认这是全行业空位，也是 Flint 公开叙事未强调的部分。
3. **评测集先行**：用 chart-llm 方法论 + ChartMimic 渲染比对，构建 ChartBrain 自己的评测/回归管线。
4. **交付形态对齐 MCP**：服务端出「中性 spec + 可选库 option」，客户端选渲染器（vega-mcp-server 样板），但不绑死单一客户端协议。

---

## 7. 存档文件（详细分报告，含全部来源 URL）

- `ChartBrain_竞品调研_2026-09-05.md` — LLM→图表生成框架全量报告
- `research/00-synthesis-nl2chart-bi-survey.md` — 开源 BI 综合报告（含 Superset/Metabase/Grafana/Lightdash/Evidence/Vanna/WrenAI 等 + 七维对比）
- `research/nl-to-chart-spec-survey.md` — NL→中性 spec/确定性渲染方向（glyph/vega-mcp/NL4DV/Chat2Vis/ChartBench/Vega-Lite/Draco/Highcharts MCP）
- `research/superset-nl-ai-report.md`、`research/metabase-ai-nl-query-report.md`、`research/lightdash-evidence-ai-research-report.md`、`research/vanna-ai-nl-query-report.md`、`research/other-nl-open-source-projects-report.md`、`grafana_llm_nl_research_report.md` — 各主题分报告

> 注：本报告所有 star 数与 commit 时间均为估计，对外引用前请按上述文件内 URL 打开 GitHub/npm 页二次核对。
