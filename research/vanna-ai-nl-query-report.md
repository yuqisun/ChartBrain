# Vanna.ai（vanna-ai/vanna）调研报告 —— ChartBrain 视角

> 来源：后台调研子代理综合 20+ 次 web 检索（GitHub / try.vanna.ai 官方文档 / PyPI / Snyk / DeepWiki 等），部分 v2 内部细节为推断，落地前建议复核官方 MIGRATION_GUIDE 与源码。
> 调研时点：2025–2026。

---

## 0. 一句话结论
Vanna 是"库形态"的 text-to-SQL + RAG + Plotly 图表生成 Python 框架（v2 改为 Agentic Retrieval），训练即"把 DDL/文档/问答对写进向量库并检索注入提示词"，图表层是**让 LLM 直接写 Plotly Python 代码并动态执行**——没有中性 spec、没有声明式变换计划、与 Python/数据库/Plotly 深度绑定。

## 1. 项目名 / URL / 一句话定位
- GitHub：[github.com/vanna-ai/vanna](https://github.com/vanna-ai/vanna)
- 定位："Chat with your SQL database — Accurate Text-to-SQL Generation via LLMs using RAG（v1）/ Agentic Retrieval（v2）"；NL 问库 → 生成并执行 SQL → 生成 Plotly 图表返回"答案+图"。

## 2. 维护状态
- Star：约 **2.38 万**（[star-history](https://www.star-history.com/vanna-ai/vanna/)），活跃热门。
- 版本：0.x 末版 v0.7.6 → **v2.0.x 大版本重写**（Agentic Retrieval、`Agent` 类 API，issue #1007）；提供 [MIGRATION_GUIDE.md](https://github.com/vanna-ai/vanna/blob/main/MIGRATION_GUIDE.md) 与 LegacyVannaAdapter。MIT 许可，pip 安装。
- 生态：vanna-flask（Web UI）、notebooks、商业托管 Vanna Hosted。

## 3. 自然语言 → 图表能力的具体实现

### 3.1 训练/知识库机制（不是微调）
三类知识（官方 [vn.train](https://try.vanna.ai/docs/train/)）：
1. DDL（表结构/Schema）
2. 文档（业务口径、列含义）
3. 问答对（question → 正确 SQL）
向量化后存入向量库（默认 ChromaDB 或 Vanna Hosted），查询时相似度 top-k 注入 prompt。成功交互可自动回写 (question, SQL)，越用越准。

### 3.2 text-to-SQL 流程
`ask(question)` → `generate_sql`（不足时可反问澄清，issue #190/#246）→ `run_sql(sql)`（**框架自建数据库连接直接执行**）→ DataFrame。LLM/向量库/数据库三者为可插拔接口（OpenAI/Anthropic/Ollama…；Snowflake/BigQuery/Postgres/SQLite/DuckDB…）。v2 "Agentic Retrieval" 推断为智能体多步编排（动态检索→生成→校验纠错），需以官方文档复核。

### 3.3 图表生成与数据变换（关键）
- **机制：LLM 直接写 Plotly 代码**：`generate_plotly_code(question, sql, df)` → 框架**动态执行代码**得到 plotly Figure → Jupyter/Streamlit/Web 渲染。
- **无中性 spec**，图表库硬绑定 Plotly(Python)。
- 数据变换由 LLM 现场写在两处：SQL 内的聚合/过滤 + Plotly 代码里的二次加工（groupby/resample/透视），**无独立声明式变换计划，不可审计、不可复现**。

## 4. 不足 / 空白点（ChartBrain 视角）
1. 图表层不库无关、无中性 spec → 消费端用 Highcharts/ECharts 无法复用。
2. "LLM 生成代码→exec" = 高危设计（CVE，见 §6）。
3. 深度绑定 Python + 持有 DB 连接凭据 + 自带执行 SQL；无官方 JS SDK。
4. 语义锚定在"数据库 Schema + 训练知识"，而非"图表语义 + 数据形态"。
5. 准确率开箱低、依赖大量训练调优（第三方实测 3%→80%）。
6. SQL 执行安全/权限风险在使用方（官方只有外围 [Hardening Guide](https://try.vanna.ai/docs/hardening-guide/)）。
7. 作为"独立中间件"适配度中低（Python/向量库/DB 连接/Plotly 四重绑定 + 闭源托管组件）。

## 5. 可以借鉴的点
1. **RAG 三段式知识**（DDL 类/自由文本/示范对）分层存储、动态检索注入 → 可移植为 ChartBrain 的"数据形态元信息 + 图表规范文档 + NL→中性 spec 范例对"。
2. **训练闭环**：成功交互与用户修正回写示范对。
3. **喂真实数据（样例/摘要）再让 LLM 产出** 比只给元信息靠谱。
4. **可插拔接口分层**（llm / vector store / 连接器各自抽象）。
5. **澄清/追问式交互**处理模糊 NL 需求。
6. **嵌入式/被集成形态样板**：pip 库 + 文档矩阵 + 迁移指南 + Legacy 兼容层。

## 6. 避坑点
1. **绝不复制"LLM 写可执行代码→动态 exec"管线**：Vanna 被爆 **CVE-2024-5565**（vanna ≤ 0.5.5，CVSS 8.1，prompt injection→RCE：[Snyk](https://security.snyk.io/vuln/SNYK-PYTHON-VANNA-7411411)、[SC World](https://www.scworld.com/news/vanna-ai-prompt-injection-vulnerability-enables-rce)），后续仍有 [issue #1078](https://github.com/vanna-ai/vanna/issues/1078) 报告 RCE。ChartBrain"LLM 只出受限 schema 的中性 spec + 确定性执行"正是对该风险的正面规避。
2. SQL 执行与"数据进 prompt"双重注入面：数据库内容/列名可携带恶意文本 → 消费端上传数据不可信，只允许进结构化摘要。
3. "训练"不是微调，是向量库写入；预留评测集与迭代预算。
4. 大版本 API 动荡（0.x→2.0 破坏性重写）→ 内部抽象隔离、锁版本。
5. 绑定即负债：Python/向量库/DB 连接/Plotly 四重绑定 + 官方默认含闭源托管组件。
6. 图表代码不具可复现/可审计性 → ChartBrain 的"确定性计划→确定性转换"有测试/快照/回归优势。
7. 成本与延迟：RAG top-k + 多次 LLM 调用（v2 agent 化后更多）→ 需缓存与评测。

## 7. 引用来源 URL（主要）
- https://github.com/vanna-ai/vanna
- https://github.com/vanna-ai/vanna/blob/main/MIGRATION_GUIDE.md
- https://github.com/vanna-ai/vanna/issues/1078 / issues/1007 / issues/190 / issues/246 / discussions/340 / discussions/767 / issues/122 / issues/40
- https://github.com/vanna-ai/vanna-flask
- https://github.com/vanna-ai/notebooks
- https://pypi.org/project/vanna/
- https://try.vanna.ai/docs/vanna.html / docs/train/ / docs/hardening-guide/
- https://try.vanna.ai/docs/sqlite-openai-standard-chromadb/ 等文档矩阵
- https://deepwiki.com/vanna-ai/vanna/（1.2-core-concepts / 1.3-architecture-overview / 2.1-agent-system / 11.1-legacyvannaadapter 等，二手参考）
- https://www.star-history.com/vanna-ai/vanna/
- https://newreleases.io/project/github/vanna-ai/vanna/release/v2.0.0
- https://security.snyk.io/vuln/SNYK-PYTHON-VANNA-7411411
- https://www.scworld.com/news/vanna-ai-prompt-injection-vulnerability-enables-rce
- https://www.wraith.sh/incidents/vanna-ai-prompt-injection-rce
- https://www.incibe.es/index.php/incibe-cert/alerta-temprana/vulnerabilidades/cve-2024-5565
- https://blog.gitcode.com/9ff16435d6f2740220358372dff2110f.html（准确率 3%→80% 实测）
- https://idinsight.github.io/tech-blog/blog/compare_aam_vanna/
