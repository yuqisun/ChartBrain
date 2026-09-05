# 「自然语言 → 图表」中间 Spec + 确定性渲染路线 —— 调研报告（ChartBrain 对标）

> 调研日期：2026-02（本会话环境无外网直连，全部信息来自 web_search 检索到的索引/快照/摘要；凡属推断处已显式标注「推断」）。
> 结论先行：业内与 ChartBrain 最同构的成熟路线是 **Vega-Lite 的「声明式 spec → 确定性编译器/运行时执行变换与渲染」**；glyph 是这条路线在 agent/MCP 场景下的极端窄化版本（受控动词 + 引擎内执行）；NL4DV 证明了「窄的中间分析 spec」可作为 LLM 之前的产物；而 Chat2Vis/ChartBench/Chart2Code 等则反复证明「LLM 直接出库配置/代码」准确率低、失败模式可预期 —— 我们的「LLM 只出中性 spec，变换/渲染确定性执行」方向与证据一致，关键设计量在于 spec 的「窄度」与「校验-修复-冒烟」三层防线。

---

## 0. 各项目/论文一览（名称 / URL / 定位 / 活跃状态）

| 项目 | URL | 一句话定位 | 维护/活跃状态（可查到的） |
|---|---|---|---|
| **glyph** (seanhanca) | https://github.com/seanhanca/glyph | 「Deterministic, MCP-native charts for AI agents —— AI-built, AI-maintained. 52 verbs, byte-stable SVG, DuckDB inside.」：给 agent 用的小型确定性图表服务 | 仓库含 mvp.md / post-mvp.md / phase-3-agent-graph.md 路线图、CONTRIBUTING.md（自述 AI-maintained）、SECURITY.md；文档站有 "What's new" 与 0.3.0 发布页（"Glyph 0.3.0 — charts for agentic frameworks"）→ 处于活跃演进期（具体提交日期无法从检索源确认） |
| **vega-mcp-server** (hydrosquall) | https://github.com/hydrosquall/vega-mcp-server | 让 Claude 等 agent 通过 MCP 在对话内产出并渲染交互式 Vega(-Lite) 图表 | 有 docs/FAQ、README 大改版 PR（#10）已合入；被 protodex、mcpworld 等 MCP 注册表收录（活跃度中，具体日期无法确认） |
| **NL4DV**（论文 + 工具包） | 论文 https://arxiv.org/abs/2008.10723 ；工具 https://github.com/nl4dv/nl4dv | 把 NL 查询解析成**分析型中间 spec**（属性 + 数据类型 + 任务/图表类型 + 聚合），再映射到 Vega-Lite | 工具 PyPI 有 4.1.0（https://pypi.org/project/nl4dv/4.1.0/），文档站 https://nl4dv.github.io/nl4dv/ ；2024 仍有基于它的 LLM 研究（见 2408.13391） |
| **「用 LLM 生成 analytic specification」**(Sah/Mitra) | https://arxiv.org/abs/2408.13391（IEEE VIS NLVIZ'24 workshop） | 直接用 LLM 生成 NL4DV 式中间分析 spec 的研究 | 2024 会议论文；作者页 https://subhamsah.com/nl4dv_llm.html |
| **Chat2Vis**（两篇） | https://arxiv.org/abs/2302.02094（IEEE Access 10121440）；微调版 https://arxiv.org/abs/2303.14292 | 让 ChatGPT/Codex/GPT-3 直接生成 Vega-Lite JSON / Python 代码做可视化并人工评估 | 2023 年论文；思路后续被新工作接续，仓库未见维护 |
| **ChartLlama** | https://ar5iv.labs.arxiv.org/html/2311.16483 | 多模态 LLM（LLaVA 系指令微调）做图表理解与生成 | 2023.11 arXiv；有第三方代码镜像（ChartLlama-code） |
| **ChartBench** | 论文 https://arxiv.org/abs/2312.15915 ；仓库 https://github.com/DataArcTech/ChartBench ；HF 数据 https://huggingface.co/datasets/SincereX/ChartBench-Demo | 复杂图表视觉推理基准，含图表生成类任务（NL2Chart 等），用 ROUGE-L/PSNR/CLIP 等评估 | 数据/仓库存在；2025 仍有论文（CycleChart 2512.19173）在其上评测 |
| **Chart2Code / From Charts to Code** | https://github.com/CSU-JPG/Chart2Code ；https://arxiv.org/abs/2510.17932 | 图→代码的难度分层基准，评估多模态模型把图表还原为代码的能力 | 2025 新工作 |
| **Draco** | https://github.com/uwdata/draco ；https://idl.uw.edu/draco/ | 用 Answer Set Programming 把可视化设计知识写成约束，可对 Vega-Lite spec 做「超 schema」的确定性校验/修正 | 维护中（multi-vis/ndro 分支仍在动） |
| **Vega-Lite（官方）** | https://vega.github.io/vega-lite/ | 声明式可视化语法：窄 spec → 编译器→ Vega runtime 确定性执行数据变换并渲染 | 活跃，v5 schema 官方发布 |
| **Highcharts 官方 MCP** | https://www.highcharts.com/mcp/ 与 https://www.highcharts.com/blog/mcp/ | 库厂商自己的「design, validate, render」三步 MCP（另有 Chartchooser MCP 负责图表选型） | 官方在推（2025-2026 博客） |
| 其他佐证型材料 | 见文末来源清单 | MCP 图表的社区校验实践、结构化输出修复实践等 | —— |

---

## 1. 核心机制

### 1.1 glyph —— 「受控动词 + 引擎内执行 + 字节稳定输出」
- **可确证的事实**（仓库标题/文档条目/tagline，检索可得）：52 个受控动词（verbs）；byte-stable SVG；DuckDB inside；MCP-native；"AI-built, AI-maintained"；仓库用 mvp.md → post-mvp.md → phase-3-agent-graph.md 组织演进。
- **机制解读（部分为推断，需对照 README 原文复核）**：
  - *为什么是「动词表」而不是让 LLM 自由生成图表配置*：动词表 = 一个**闭集枚举**，每个动词有固定语义与固定参数类型，MCP 工具 schema 可以把它表达成枚举参数 + 强类型参数。LLM 只需从 52 个动词里挑 + 填少数参数，自由度被压到「选错也错得有限」的级别；而开放配置（如 Vega-Lite/Highcharts options 那种几十上百键、宽 union）的非法空间几乎是无限的。
  - *byte-stable SVG*：同样的（数据, 动词, 参数）永远产出逐字节相同的 SVG（即内部没有随机 id/时间戳、排序与数值格式确定性、输出规范化）。这带来三个能力：agent 可以 diff 自己的前后两次输出做自校验（"改动生效了吗"）；测试可以做 golden-file 字节级断言；产物可缓存/幂等重放。
  - *DuckDB 的定位*：数据与变换都发生在服务端引擎内 —— DuckDB 在进程内执行过滤/聚合/join/排序等（推断：以 SQL 形式封装成动词背后的确定性变换），**LLM 不写 SQL、不写 pipeline**，只声明「要对哪列做什么动词」。这也顺带解决「大表塞不进 prompt」的问题。
  - 引申：glyph 是「把 spec 窄化到几乎退化成『命令 + 参数』」的极值点，换来的是可验证、可 diff、可回归。

### 1.2 vega-mcp-server —— 用 MCP 让 LLM 产出并渲染 Vega-Lite
- 机制：MCP 工具把「图表」变成对话内可交互对象（MCP Apps / HTML），LLM 生成 Vega-Lite spec，服务端/运行时负责编译与渲染；文档含 FAQ 与设计取舍（readme rewrite PR #10）。
- 关键点：它**不是让 LLM 直接画 SVG/写布局代码**，而是让 LLM 输出声明式 spec，把「spec→像素」交给 Vega（确定性编译器+runtime，变换/聚合按声明执行）。这正是"中间 spec + 确定性执行"在 agent 侧的一个实例。
- 关于 schema 校验：其 README/FAQ 全文本次无法抓取；但**同类 Vega-Lite MCP 的通行做法**提供了强证据 —— 多个第三方 MCP 把「校验」做成显式工具/步骤，例如 glama 收录的 vegaLite_mcp_server 提供独立 `validate_spec` 工具（https://glama.ai/mcp/servers/inteligencianegociosmmx/vegaLite_mcp_server/tools/validate_spec），mcp.so 的 "Data Visualization MCP Server"（https://beta.mcp.so/servers/mcp-server-vegalite）是 LLM 出 JSON spec → 服务端校验 → 渲染的形态。即社区默认流程 = **LLM 生成 spec → 校验 → 渲染**，而不是 LLM 一步到位。

### 1.3 NL4DV —— 中间「分析 spec」的原始样本
- 机制：把 NL 查询经 NLP 流水线（utterance 解析、attribute 匹配、**数据类型推断**、**任务/图表意图抽取**）转成结构化 **analytic specification**（JSON：涉及字段、字段类型、任务类型、聚合方式…），再由工具渲染到 Vega-Lite。
- 对「直接生成」问题的态度（论文明确的设计取舍，检索片段可见）：支持**显式 vs 隐式属性引用**、提供**歧义提示**（设计准则 DG3 "Highlight inference type and ambiguity"）—— 查询只提属性时，NL4DV 会**先列出候选可视化**让用户确认，而不是静默猜一个（来源片段："Alternatively, if the query only mentions attributes, NL4DV first lists possible visualizations based on those attributes"）。
- 即：**传统确定性 NLP 管线用「窄 spec + 显式歧义处理」规避了自由猜测** —— 这正是后来 LLM 路线最常翻车的地方（见 §3 避坑）。

### 1.4 Chat2Vis 及「LLM 生成 analytic spec」(2408.13391)
- Chat2Vis：直接让 LLM（ChatGPT/Codex/GPT-3）产 Vega-Lite JSON 或 Python 代码，再做人工/自动评估；后续篇(2303.14292)被迫转向**微调开源模型**以稳定输出多语言图表配置 —— 间接说明基座模型直接生成配置的稳定性不足；其对比表中早期序列化生成基线 Seq2Vis 得分极低（ar5iv 片段可见约 2% 量级）。
- 2408.13391：把「analytic specification」作为 LLM 的**输出中间物**（对齐 NL4DV 结构）来研究 —— 说明「中间 spec 而非最终库配置」正在成为 LLM 可视化研究的共识产物。

### 1.5 评测类（ChartLlama / ChartBench / NL2Chart / Chart2Code）
- ChartBench（2312.15915）与 CycleChart（2512.19173）等把「NL/图 → 图表」做成多模态基准：评估指标出现 ROUGE-L（文本/代码相似）+ **PSNR/CLIP（渲染成图后的图像相似度）** → 隐含「模型出代码 → 执行渲染 → 图像级比较」的评测流水线。
- Chart2Code / "From Charts to Code"（2510.17932）把 chart→code 按难度分层 —— 图表越复杂，多模态模型直接产出可渲染代码的准确率下降越明显（基准的存在本身就是失败模式的证据）。
- 含义：**端到端「模型直接写渲染代码」在复杂图表上不可靠**；评测界因此普遍采用「生成→执行/渲染→多重指标」的做法，与「确定性执行 + 冒烟断言」的工程思路同构。

### 1.6 校验/修复生态（我们最该抄作业的部分）
- 官方层：Vega-Lite 文档有 "Validate the schema" 调试指引（https://vega.github.io/vega-lite/usage/debugging.html#validate-the-schema），官方发布 JSON schema（https://vega.github.io/schema/vega-lite/v5.json）；编译器自身也做语义校验并抛错。
- schema 之宽是已知痛点：vega-lite schema 依赖复杂 $ref，第三方工具解析它都有 bug（https://github.com/whitlockjc/json-refs/issues/207）；因此有人用**强类型语言把 spec 变成编译期类型**（Rust crate vega_lite_5：https://docs.rs/vega_lite_5/），有人写 "skill" 让 agent 先校验再渲染（https://github.com/markdown-viewer/skills/blob/main/vega/SKILL.md；tessl 收录的 vega-spec-validator：https://tessl.io/registry/testland/vega-spec-validator/1.1.9/files/SKILL.md）。
- 修复模式：社区通用做法是 **「schema 校验 + 一轮自修复」**：Spring AI 官方文档专门讲 Schema Validation & Self-Correction（https://docs.spring.io/spring-ai/reference/2.0-SNAPSHOT/api/structured-output/validation.html）；有项目把「校验 + 恰好一次 repair round-trip」固化为架构决策（TYPO3 ADR-082：https://docs.typo3.org/p/netresearch/nr-llm/main/en-us/Adr/Adr082StructuredOutputs.html）。
- 约束层（超出 JSON schema）：Draco 用 ASP 把「哪些编码/组合在视觉上合理」写成约束，可对 Vega-Lite spec 做一致性校验与修复（https://github.com/uwdata/draco）—— 提示「schema 校验通过 ≠ 语义正确」。
- 厂商侧：Highcharts 官方 MCP 的口号就是 **"Design, validate, render"**（https://www.highcharts.com/mcp/），并单独提供 Chartchooser MCP 做**图表类型选型**（https://www.highcharts.com/blog/tutorials/highcharts-chartchooser-mcp/）—— 商业图表库自己也在做「先选型设计、再校验、再渲染」，与 ChartBrain 的三段式完全同构。

---

## 2. 与 ChartBrain 路线的异同评估

| 维度 | ChartBrain（我们） | 最接近的参照物 | 差异/启示 |
|---|---|---|---|
| LLM 产出物 | 轻量**中性 spec** + 声明式变换计划 | NL4DV analytic spec；Vega-Lite spec；glyph 动词+参数 | 中性 spec 的「窄度」介于 glyph 动词（最窄）与 Vega-Lite（很宽）之间；NL4DV 证明「分析语义层」可以先于渲染层存在 |
| 数据/变换执行 | 服务端（LLM 侧）声明计划，消费端 TS SDK 确定性执行 | glyph 用 DuckDB 在引擎内执行；Vega-Lite 由 Vega runtime 执行 | 共同点：**LLM 不碰数据流水线**。坑：执行端必须与声明端约定字段名/类型，否则 SDK 端无从校验 |
| 库适配 | 中性 spec → 每库确定性转换器（Highcharts/ECharts…） | Vega-Lite 是唯一自洽的「声明→多渲染后端」先例；ECharts/Highcharts 本身无通用 spec | 我们相当于自建 mini-Vega；要警惕「转换器 = 新 schema」导致第二份宽 schema |
| 校验 | （待设计） | vega-lite JSON schema + 编译器语义校验；Draco 约束；MCP validate_spec 工具 | 检索材料一致指向 **schema(语法) → 语义(字段/类型/组合) → 渲染冒烟** 三层，而不是只做一层 |

我们独有的差异点：消费端声明「我用的库 + 真实数据列 schema」→ 这比 Vega-Lite 生态「先有 spec 再喂数据」更利于**字段存在性校验**（材料显示字段名幻觉是最高频失败，见 §3.1）；glyph 则反着来（数据留在引擎里、agent 不拿真实 schema）。两边都可借鉴。

---

## 3. 可借鉴点（spec 要多窄、校验/修复怎么做）

1. **spec 越窄越好，但别窄成动词表**：
   - glyph 用 52 动词证明「窄 → 可枚举 → 可 schema 化 → LLM 犯错空间小」。ChartBrain 的 spec 应把「分析语义」做成**枚举/闭集**：图表意图（comparison/trend/distribution…或直接是受控 chart-type 白名单）、聚合方式、轴绑定；凡是能枚举的字段一律 enum，杜绝 anyOf 宽 union。
   - 反例证据：Vega-Lite schema 宽且 $ref 复杂，连工具解析都出 bug（json-refs #207），纯 JSON schema 挡不住语义错误 → 不要复制一个"宽 schema"。
2. **两层 spec：语义层（窄、与库无关）+ 表现层映射（我们转换器内部）** —— 语义层用 enum + 最小必要字段；表现层参数（颜色、图例、坐标轴标签）给默认值，LLM 只在确有必要时覆盖（减少自由键）。
3. **三层校验 + 自修复闭环**：
   - L1 语法/结构：JSON schema 或 TS 类型（用 vega_lite_5 那种 typed-schema 思路在 SDK 端做类型即校验）。
   - L2 语义：字段名必须命中消费端上报的真实列 schema；类型（nominal/quantitative/temporal）必须匹配列推断；变换计划里的字段引用同源校验。
   - L3 冒烟：SDK 执行后断言「渲染无异常 + 数据点数与计划一致」；byte-stable golden 测试防变换不确定性（glyph 思路）。
   - 修复：**只允许一轮** validate→repair→re-validate（TYPO3 ADR-082 的做法），避免 agent 死循环；把「校验失败原因」以结构化错误回喂 LLM 重出 spec（不是让 LLM 修代码）。
4. **把「图表类型/任务选型」当成独立环节**：Highcharts 专门做了 Chartchooser MCP、NL4DV 在歧义时列出候选 —— 我们应让 spec 带 intent/置信度，转换器端对「该类型能否表达该数据（维度数、字段类型）」做确定性检查，不合则回退/上报候选而非硬渲染。
5. **评测回归集对齐 ChartBench 思路**：为「NL → 渲染正确性」建自己的小基准，指标用「非法 spec 率 + 渲染成功率 + 图类型误判率」而不是只看 LLM 文本。

---

## 4. 避坑点（含材料中的证据）

1. **字段/列名幻觉是最高频失败**：Chat2Vis 系工作中 LLM 输出经常不可用（无效 JSON/错编码，需迭代与人工评分）；NL4DV 特意处理「隐式属性引用 + 歧义」。→ 对策：把真实列 schema 注入 prompt 并要求 spec 只引用 schema 内字段；校验层做存在性断言（我们已具备此条件，因为消费端上报真实数据）。
2. **数值输出在 LLM 侧天然脆弱**：即使有 grammar/JSON-schema 约束解码，模型仍可能在数值字面量里陷入重复/死循环（vLLM 的 Gemma structured-output 无限重复 issue #40080、Gemini structured output 在 JSON number 内重复到 MAX_TOKENS 的帖子）→ 对策：数值/坐标/尺寸全部交给确定性层计算或做 clamp/类型强转/NaN 守卫，**spec 里尽量减少裸数值**（宽度、坐标由库适配默认值决定）。
3. **schema 太宽 → 校验形同虚设**：Vega-Lite 官方 schema 校验通过 ≠ 可编译可渲染；社区为此另起 typed crate（vega_lite_5）、skill 校验器、ASP 约束层（Draco）。→ 对策：schema 用 `additionalProperties: false` + enum 收敛；宁可拒绝也不让非法键静默通过。
4. **图表类型/任务误判**：评测基准（ChartBench NL2Chart、Chart2Code、From Charts to Code）表明复杂图表下「模型直接出可渲染物」的准确率明显不足。→ 对策：承认单次推理会错，设计「意图 + 校验 + 回退/确认」的协议而不是尽力渲染；歧义时学 NL4DV 列候选。
5. **别把整表数据塞进 prompt**（Chat2Vis 讨论及引用文献都提到大表序列化进 prompt 是瓶颈）→ 对策：prompt 只给列 schema + 概要/抽样；聚合与细节数据留在变换计划里由 SDK/服务端执行（glyph 的 DuckDB-inside 思路）。
6. **确定性不是免费的**：要做到 byte-stable/可重放，必须锁死排序键、聚合顺序、浮点舍入、时区、引擎版本 —— glyph 把 byte-stable 当卖点正因为默认渲染常含随机性/平台差异；我们的 TS SDK 与转换器要自带 golden 测试。
7. **「AI-maintained」项目的供应链风险**：glyph 自述 AI-built/AI-maintained（agent 在合代码），这类仓库演进快、接口可能不稳定 → 引用他人项目时要 pin 版本；对自己项目则用字节级 golden 测试兜底。
8. **别让「确定性转换器」变成第二个宽 schema**：每适配一个库（Highcharts/ECharts）都等于定义新映射表，映射键若不被校验约束，又会把 LLM 自由度从语义层漏到表现层 —— 转换器输出应在 SDK 内用库的 TS 类型/运行时断言兜住。

---

## 5. 全部来源 URL

**glyph**
- https://github.com/seanhanca/glyph
- https://github.com/seanhanca/glyph/blob/main/README.md
- https://github.com/seanhanca/glyph/blob/main/mvp.md
- https://github.com/seanhanca/glyph/blob/main/post-mvp.md
- https://github.com/seanhanca/glyph/blob/main/CONTRIBUTING.md
- https://github.com/seanhanca/glyph/blob/main/SECURITY.md
- https://github.com/seanhanca/glyph/blob/main/phase-3-agent-graph.md
- https://seanhanca.github.io/glyph/index.html
- https://seanhanca.github.io/glyph/showcase/
- https://seanhanca.github.io/glyph/math/agentic-0.3.0.html
- https://lobehub.com/mcp/seanhanca-glyph

**vega-mcp-server 及同类 MCP**
- https://github.com/hydrosquall/vega-mcp-server
- https://github.com/hydrosquall/vega-mcp-server/blob/main/README.md
- https://github.com/hydrosquall/vega-mcp-server/blob/main/docs/frequently-asked-questions.md
- https://protodex.io/servers/hydrosquall-vega-mcp-server.html
- https://glama.ai/mcp/servers/inteligencianegociosmmx/vegaLite_mcp_server/tools/validate_spec
- https://beta.mcp.so/servers/mcp-server-vegalite

**NL4DV 及 LLM-analytic-spec 研究**
- https://arxiv.org/abs/2008.10723
- https://github.com/nl4dv/nl4dv
- https://nl4dv.github.io/nl4dv/
- https://pypi.org/project/nl4dv/4.1.0/
- https://arxiv.org/abs/2408.13391
- https://subhamsah.com/nl4dv_llm.html

**Chat2Vis**
- https://arxiv.org/abs/2302.02094（IEEE Access: https://ieeexplore.ieee.org/document/10121440 ）
- https://arxiv.org/abs/2303.14292（ar5iv 全文: https://ar5iv.labs.arxiv.org/html/2303.14292 ）

**生成评测：ChartLlama / ChartBench / NL2Chart / Chart2Code**
- https://arxiv.org/abs/2311.16483（ChartLlama）
- https://arxiv.org/abs/2312.15915（ChartBench；仓库 https://github.com/DataArcTech/ChartBench ；数据 https://huggingface.co/datasets/SincereX/ChartBench-Demo ）
- https://arxiv.org/abs/2512.19173（CycleChart，含 NL2Chart 指标表）
- https://github.com/CSU-JPG/Chart2Code
- https://arxiv.org/abs/2510.17932（From Charts to Code）

**schema 校验 / 约束 / 修复实践**
- https://vega.github.io/vega-lite/usage/debugging.html#validate-the-schema
- https://vega.github.io/schema/vega-lite/v5.json
- https://github.com/whitlockjc/json-refs/issues/207
- https://docs.rs/vega_lite_5/latest/vega_lite_5/
- https://github.com/markdown-viewer/skills/blob/main/vega/SKILL.md
- https://tessl.io/registry/testland/vega-spec-validator/1.1.9/files/SKILL.md
- https://github.com/uwdata/draco ；https://idl.uw.edu/draco/
- https://docs.spring.io/spring-ai/reference/2.0-SNAPSHOT/api/structured-output/validation.html
- https://docs.typo3.org/p/netresearch/nr-llm/main/en-us/Adr/Adr082StructuredOutputs.html

**LLM 结构化/数值输出失败证据**
- https://github.com/vllm-project/vllm/issues/40080
- https://github.com/vllm-project/vllm/pull/40099
- https://discuss.ai.google.dev/t/structured-output-repetition-loop-inside-a-json-number-literal-runs-to-max-tokens-flash-vertex/175138

**厂商/平台侧对照**
- https://www.highcharts.com/mcp/ ；https://www.highcharts.com/blog/mcp/
- https://www.highcharts.com/blog/tutorials/highcharts-chartchooser-mcp/
- https://github.com/austenstone/mcp-highcharts
- https://help.aliyun.com/en/polardb/polardb-for-mysql/nl2chart（阿里云 PolarDB NL2Chart 产品文档，行业路线对照）
- https://arxiv.org/abs/2412.02205（DataLab：腾讯 LLM BI 平台，整平台路线对照）

**LLM 可视化能力评估（补充证据）**
- https://arxiv.org/abs/2506.10996（Evaluating LLMs for Visualization Tasks）
- https://arxiv.org/abs/2507.22890（Evaluating LLMs for Visualization Generation and Understanding）
