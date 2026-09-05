# 其他开源 text-to-SQL / NL 数据分析项目调研报告（ChartBrain 视角）

> 调研时点：约 2026 年年中。star/发版信息基于公开来源数量级估计，精确值以 GitHub 为准。

## 主选 6 项目

### 1. WrenAI（GenBI：text-to-SQL + text-to-chart + 语义层，最接近 ChartBrain 的全栈对标）
- GitHub: https://github.com/Canner/WrenAI（原 Decentralised-AI/WrenAI，组织已迁移）；文档 https://docs.getwren.ai/oss ；API https://wrenai.readme.io
- 定位：开源"生成式 BI（GenBI）"智能体——语义层（MDL 建模）+ NL 查询 12+ 数据源，产出 SQL、图表与洞察。
- 维护：非常活跃，2025 持续发版至 0.22/0.23.x（https://github.com/Canner/WrenAI/releases ），发布 "2025 Year in Review"（https://www.getwren.ai/post/wren-ai-2025-year-in-review-from-open-source-to-agentic-bi-in-production ）。star 曾超 9000 并登 GitHub 日增榜前二（https://dxpress.gelonghui.com/live/2011256 ），现约万级。
- NL→图表：非 SQL-only。独立图表生成端点 POST /generate-chart（https://wrenai.readme.io/reference/post_generate-chart ），LLM 产 SQL + 图表 JSON（类型/字段映射），自家前端渲染；LLM 无关；对 DB 报错自纠正。组件：WrenUI（前端）+ wren-ai-service（Python text-to-SQL/chart）+ wren-engine（查询引擎），提供 TS/Python SDK 与 LangChain 集成。
- 空白点：端到端 BI 平台/智能体、部署重（多服务 docker-compose）；图表 spec 绑定自有渲染/UI，无面向任意消费端图表库的中立 spec 抽象；数据变换在服务端 SQL 引擎（要求 DB 连接），与 ChartBrain"消费端已有真实数据、无 DB 依赖"模型互补而非同构。
- 借鉴：语义层（MDL）显著提升 text-to-SQL 质量；chart 生成做成显式 API 端点；LLM 无关 + 自托管；TS/Python SDK 与 MCP 生态位意识。
- 避坑：当独立中间件调用会拖入整套平台与 DB 依赖；语义建模需持续维护；README/宣传快于文档。

### 2. DB-GPT（AI Native 数据应用框架）
- GitHub: https://github.com/eosphoros-ai/DB-GPT ；文档 https://docs.dbgpt.cn
- 定位：开源"AI Native 数据应用开发框架"：多模型 + RAG + Agent，内置与数据库对话（text2sql）、图表、dashboard，以 AWEL 编排应用。
- 维护：非常活跃。v0.7.1 支持多模态/Qwen3/GLM4/Oracle；文档到 v0.8.0，Release Alert 显示 v0.8.1 stable。star 约 1.5 万。
- NL→图表：text2sql 只是其中一块；聊天内可基于查询结果出图表（内置 Web 前端）；可搭 dashboard 类 App；模型层开放。
- 空白点：Python 单体框架 + 自带 Web，作轻量中间件过重；图表在自身 UI 内消费，无中立 spec/导出通道；变换靠服务端 SQL。
- 借鉴：AWEL agent 工作流抽象；多 DB/多模型接入面；"对话→查询→图表→应用"管线化。
- 避坑：部署与模型服务运维成本高；学习曲线陡；其"图表"不是可交付给消费端的中立产物。

### 3. Chat2DB（AI 数据库客户端）
- GitHub: https://github.com/chat2db/Chat2DB ；文档 https://docs.chat2db.ai
- 定位：国产跨平台 AI 驱动数据库工具/SQL 客户端，30+ 数据库，NL 生成 SQL。
- 维护：star 约 2.6 万（报道 25.7k）。3.0 宣传 Claude3.7/DeepSeek 接入。注意团队重心转商业云版 chat2db.ai，开源侧发版放缓讨论、出现活跃 fork（OtterMind/Chat2DB），采用前核实官方仓库最近 push。
- NL→图表：本质 SQL 客户端 + AI 助手：NL→SQL→执行→结果表格，一键把结果集转内置图表（客户端内渲染）；非独立图表生成服务。
- 空白点：桌面/Web 端产品，非可嵌入服务或库；图表绑定客户端；无开源语义层。
- 借鉴：NL→SQL→结果可视化的端到端 UX；多数据库驱动覆盖；可插拔 LLM。
- 避坑：开源/商业双轨的维护不确定性；不要把它当 API/中间件；大规模 AI 能力会导向商业订阅。

### 4. PyGWalker（DataFrame→可视化分析 UI，spec 与渲染分离做得最好）
- GitHub: https://github.com/Kanaries/pygwalker（组织更名 secureonelabs：https://github.com/secureonelabs/pygwalker ）；官网 https://kanaries.net/pygwalker
- 定位：把 pandas/polars DataFrame 原地变交互式可视化分析 UI（Jupyter/Streamlit/Gradio），底层 Graphic Walker 声明式 spec。
- 维护：活跃，0.4.5/0.4.7 持续发布；star 约 1.2–1.4 万。
- NL→图表：核心是拖拽生成 spec（无 LLM 也能用）；支持 GPT/AI "ask-to-viz"（NL 提问返回图表 spec，需 OpenAI 兼容 API）；关键：spec 与渲染分离——同一 spec 可输出 vega / g2 / streamlit 三种渲染后端（README theme: 'vega'|'g2'|'streamlit'）。
- 空白点：Python-only、进程内 DataFrame，非远程数据服务，不适配 TS 消费端；spec 语义是 Graphic Walker 领域模型，不等于直达 Highcharts/ECharts 的中立配置；ask-to-viz 是附加能力。
- 借鉴："统一声明式 spec + 多渲染后端"正是 ChartBrain 思路的近亲证明；导出/嵌入思路；文档与生态运营。
- 避坑：不做 text-to-SQL（面向内存数据框）；AI 问答非主路径、质量有限；渲染后端是 vega/g2/streamlit 系。

### 5. Dataherald（独立 NL→SQL 引擎 API，形态最接近"独立中间件"）
- GitHub: https://github.com/dataherald/dataherald ；https://www.langchain.com/blog/dataherald
- 定位：NL 转 SQL 并执行的独立引擎，REST API 优先，供业务系统调用。
- 维护：中等偏缓。曾宣布引擎完全开源（https://fr.news.hada.io/topic?id=15008 ）；近期向自有新引擎 "Kula" 重构端点（https://github.com/Dataherald/dataherald/commit/a226a9d99b792e82d39a2ff043e2bc2ecf2b6265 ），方向在变；star 仅约 1k。
- NL→图表：纯 text-to-SQL（生成并执行 SQL、返回行集），无图表/spec 能力；早期基于 LangChain：schema 上下文 + few-shot + 执行自纠。
- 空白点：无可视化链路，停在 ChartBrain 要补的"图表"一半；变换靠服务端执行 SQL，不支持"数据给消费端后客户端声明式变换"；社区支撑弱。
- 借鉴：API-first 独立引擎定位可行；schema/上下文注入 + 结果校验自纠；DB 连接器集合。
- 避坑：star/社区量级低，受商业转向影响；选型需锁版本并评估断更风险。

### 6. OpenMetadata（元数据目录平台 + Ask Me Anything）
- GitHub: https://github.com/open-metadata/OpenMetadata ；1.8.0 发版 https://newreleases.io/project/github/open-metadata/OpenMetadata/release/1.8.0-release
- 定位：开源数据目录/治理平台（元数据、血缘、质量、术语、策略），GenAI "Ask Me Anything" 助手 + MCP server。
- 维护：非常活跃、商业双轨（Collate）。
- NL→图表：无 text-to-chart；Ask Me Anything 用 NL 查元数据/找表/问血缘；MCP server 供外部 agent 调用（https://blog.open-metadata.org/introducing-the-model-context-protocol-mcp-in-openmetadata-e757385f4fb2 ）。
- 空白点：完整企业平台，与轻量独立 NL→图表服务相距最远；无数据变换/图表交付业务消费端的链路。
- 借鉴：语义层/元数据上下文的工程化（命名、血缘、术语表）是 NL 数据产品准确率地基；MCP 化开放启发。
- 避坑：别因"活跃+大 star"误当可嵌入 NL→图表组件；自托管成本高。

## 落选/谨慎名单
- **SQL Chat（sqlchat/sqlchat）**：https://github.com/sqlchat/sqlchat 。NL→SQL→执行→表格+基础图表，star 约 7k；但 2024 年后活跃度明显下降，不符合"仍积极维护"，作 UI/交互参考。
- **TableGPT/TableGPT2（浙大 ZJU-M3）**：研究向开源权重模型：https://github.com/ZJU-M3/TableGPT-techreport 、https://huggingface.co/tablegpt/TableGPT2-7B 。表格问答 + 代码沙箱生成图表（Python 系），可作 ChartBrain 模型层候选，但需 GPU 自托管、无中立 spec/API 服务。
- **PandasAI**（sinaptik-ai/pandas-ai）：NL→Python 代码（含 matplotlib），库形态可嵌入，代表"NL→代码"路线，图表非声明式 spec。

## 横向比较
| 项目 | 形态 | SQL-only/有图表 | 图表库无关 | 变换在哪 | 可嵌入调用 | 维护/star |
|---|---|---|---|---|---|---|
| WrenAI | 平台(多服务) | 图表✅ | ❌ 绑定自有 UI | 服务端 SQL 引擎 | SDK/API，拖整套平台 | 很活跃/约万级 |
| DB-GPT | 平台/框架 | 图表✅(内置) | ❌ | 服务端 SQL | 重，框架级 | 很活跃/约1.5万 |
| Chat2DB | 客户端工具 | 结果集图表✅ | ❌ | 客户端连库 | 否 | 存疑(转商业)/约2.6万 |
| PyGWalker | 库(Python) | spec+渲染✅ | ⚠️ spec→vega/g2/streamlit | Python 进程内 | 是(仅 Python) | 活跃/约1.3万 |
| Dataherald | 独立引擎 API | 图表❌ | — | 服务端 SQL | 是(API-first) | 中缓/约1k |
| OpenMetadata | 企业平台 | 图表❌ | — | 无 | MCP/API，重 | 很活跃/数千 |

## 共同空白（= ChartBrain 的机会）
1. 没有一家是"库无关的 NL→中立 spec + 确定性变换→任意图表库"的独立服务。WrenAI 有 text-to-chart 但绑定自家 UI/引擎；PyGWalker 证明 spec/渲染分离可行但只落 vega/g2/streamlit；其余要么 SQL-only、要么图表锁死在产品内。
2. 数据变换普遍在"服务端 SQL 引擎"完成；"消费端自带真实数据、由 TS SDK 执行声明式变换"的模型未被覆盖。
3. 可借鉴共性：语义层/元数据上下文（WrenAI、OpenMetadata）；显式 chart API（WrenAI）；spec 多渲染分离（PyGWalker）；API-first 独立引擎（Dataherald）；结果集图表 UX（Chat2DB/DB-GPT）；MCP 化开放；SQL 自纠回路与 golden-SQL 评测。
4. 避坑共性：大 star ≠ 可嵌入（Chat2DB 转商业、OpenMetadata 是企业平台）；SQL-only 项目交不出图表产物；自托管 LLM 与平台运维成本被低估；开源→商业转向改变发版节奏（Chat2DB、Dataherald）。

## 主要来源 URL
- https://github.com/Canner/WrenAI ；https://docs.getwren.ai/oss/sdk/overview ；https://wrenai.readme.io/reference/post_generate-chart ；https://github.com/Canner/WrenAI/releases ；https://www.getwren.ai/post/wren-ai-2025-year-in-review-from-open-source-to-agentic-bi-in-production
- https://github.com/eosphoros-ai/DB-GPT ；https://releasealert.dev/github/eosphoros-ai/DB-GPT ；http://docs.dbgpt.cn/docs/v0.8.0/getting-started/web-ui/
- https://github.com/chat2db/Chat2DB ；https://docs.chat2db.ai ；https://github.com/OtterMind/Chat2DB/releases
- https://github.com/Kanaries/pygwalker ；https://github.com/secureonelabs/pygwalker ；https://kanaries.net/pygwalker ；https://stackoverflow.com/questions/78139469/how-to-enable-gpt-features-like-ask-to-viz-in-pygwalker ；https://raw.githubusercontent.com/Kanaries/pygwalker/main/README.md
- https://github.com/dataherald/dataherald ；https://www.langchain.com/blog/dataherald ；https://github.com/Dataherald/dataherald/commit/a226a9d99b792e82d39a2ff043e2bc2ecf2b6265
- https://github.com/open-metadata/OpenMetadata ；https://blog.open-metadata.org/introducing-the-model-context-protocol-mcp-in-openmetadata-e757385f4fb2
- https://github.com/sqlchat/sqlchat ；https://github.com/ZJU-M3/TableGPT-techreport ；https://huggingface.co/tablegpt/TableGPT2-7B
