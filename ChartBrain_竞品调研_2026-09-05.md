# ChartBrain 竞品与路线调研报告（检索日：2026-09-05）

> 委托方：正在构建「自然语言 → 中性图表 spec → 目标库(Highcharts/ECharts)确定性转换器 + 声明式数据变换」服务的团队。
> 调研手段：仅 `web_search`（联网抓取被禁用），每个主项目 ≥3 次交叉检索。文中所有日期均为检索证据中出现或推断的日期。

## 0. 方法与口径（先读）

- **数据来源限制**：无法直接打开 GitHub/HF 页面抓取实时 star、commit 时间。凡未取到数字快照的 star 数一律标注「（估计）」并给区间与依据；凡无法核实的细节标注「（未能核实）」。
- **检索环境事实**：本次检索可看到 2025–2026 年的资料（如 arXiv 26xx 编号论文、ICML/EMNLP 2025/2026 收录），说明该信息空间活跃，2023 年项目如无后续动作会明显「过气」。
- **总体印象**：ChartBrain 选择的「中性 spec + 确定性转换」路线在 2025–2026 正获得业界背书（微软 Flint、ThoughtSpot、PostHog 等），而「LLM 直接写目标库代码」路线的代表项目大多停在 2023–2024 原型阶段或转向更复杂的 agent/校验回路。

---

## 1. 主项目逐项分析

### 1.1 microsoft/lida

| 项 | 内容 |
|---|---|
| 仓库 | https://github.com/microsoft/lida ；项目页 https://microsoft.github.io/lida/ ；论文 arXiv:2303.02927 |
| 一句话定位 | 用 LLM 从数据自动生成可视化与信息图的多阶段 Python 工具库（数据总结 → 目标探索 → 图生成 → 自评估）。 |

- **维护状态**：低维护/社区使用状态。证据：检索不到 2025/2026 的 release 或活跃 commit 信号；热度证据集中在 2023（[Hacker News 讨论 2023-09](https://news.ycombinator.com/item?id=37305240)、作者 [Victor Dibia 2023-10 newsletter](https://newsletter.victordibia.com/p/lida-automatic-generation-of-grammar?trk=article-ssr-frontend-pulse_little-text-block)、2023 年大量中文教程）；[AIToolHub 于 2025-03-18 仍将其作为工具收录](https://aitoolhub.co/tools/lida)（说明"仍被使用"而非"仍在开发"）；存在多个活跃 fork（如 [chiarua/lida](https://github.com/chiarua/lida)、[ByteanAtomResearch/lida](https://github.com/ByteanAtomResearch/lida)），社区在自维护。Star：**约 4–8k（估计）**——[git-stars.org](https://git-stars.org/it/blog/summaries/microsoft/lida)、[sourcepulse](https://www.sourcepulse.org/projects/1236795)、[repositorystats](https://repositorystats.com/microsoft/lida)、[AISignal](https://www.aisignal.dev/repo/microsoft/lida) 等聚合页存在但未取到数字快照。
- **核心优点**：① 模块化管线 SUMMARIZER / GOAL EXPLORER / VISGEN / SELF-EVAL（见 [arXiv HTML](https://ar5iv.labs.arxiv.org/html/2303.02927) 与 [capabilities 文档](https://github.com/microsoft/lida/blob/main/docs/capabilities.md)）；② **summarize-first**：先用采样+统计摘要喂给 LLM，控制成本与 token；③ goal 探索 → 候选图 + LLM 自评排序的产品交互范式；④ 教程/demo 完整，论文影响力大，是"LLM 自动可视化"事实上的开山标杆。
- **不足/空白点（ChartBrain 视角）**：① 自称 grammar-agnostic，但实现上是**为各图语法生成代码**（matplotlib/ggplot/altair/seaborn/plotly 等代码后端），**没有一等公民的中性 spec，也没有确定性编译器**——"库无关"是口号而非架构事实；② **依赖自采样摘要而非全量精确数据**，数值级正确性无保障，且不含可组合的声明式数据变换（聚合/过滤语义无法在管线上游确定执行）；③ 是 notebook/交互库，不是服务或中间件，对 Highcharts/ECharts 这类 JS 库无桥；④ 强依赖 LLM API 与自评估回路，社区反馈过大量接入/导入问题（例：[中文故障分析](https://blog.gitcode.com/b97960c02979edcb581912c3a464c46d.html)）。
- **可借鉴点**：goal 探索+自评的交互范式；summarize-first 的成本控制思路（但要换成"精确数据 + 声明式变换"）。
- **避坑点**：别把 LIDA 式"grammar-agnostic"当架构蓝本——代码生成≠库无关；别沿用自采样方案，会丢精度；自评估回路是 LLM 判断，不可当作 SLA 保证。

### 1.2 GAIR-NLP/daVinci-LLM —— ⚠️ 名称/内容漂移，需人工复核

| 项 | 内容 |
|---|---|
| 仓库 | https://github.com/GAIR-NLP/daVinci-LLM |
| 一句话定位 | **与委托方 premise 严重不符**：截至检索日，该 URL 关联的内容是上交大 GAIR-NLP 的预训练基座论文「daVinci-LLM: Towards the Science of Pretraining」（arXiv:2603.27164，2026-03），而非"图表推理、输出 matplotlib/python 代码"的项目。 |

- **证据链**：① arXiv [2603.27164](https://arxiv.org/pdf/2603.27164)（ar5iv/Scirate/HF Papers 均同题）标题即 `daVinci-LLM`；② 同组织 2025–2026 年存在成体系的 "daVinci" 系列：[daVinci-Dev（ICML 2026 Oral，软件工程 agent 中训练）](https://github.com/GAIR-NLP/daVinci-Dev)（含 [HF 权重 GAIR/daVinci-Dev-72B-MT](https://huggingface.co/GAIR/daVinci-Dev-72B-MT)）、[daVinci-MagiHuman](https://github.com/GAIR-NLP/daVinci-MagiHuman)；③ 国内报道：上海 AI 研究院 2026-03-29「[达芬奇·文本基模发布](https://www.sii.edu.cn/2026/0329/c27a880/page.htm)」（主打"最透明 LLM、3B 赢 7B"）。
- **结论**：委托方前提中"LLM 推理图表 + matplotlib/python 代码 + 演进式推理"的 daVinci-LLM **在本次检索中无法找到对应源码/论文佐证**。可能性：原 2023 时代图表仓库已改名/归档、被同名新项目占用，或前提来自非 GAIR 的第三方项目混淆。Star/维护状态无法可靠估计（若按当前预训练项目算则 2026 年仍活跃）。
- **避坑点（对 ChartBrain 是重要教训）**：① **同名/更名陷阱**——引用任何仓库前先核对"当前 README 主题 + 最近 commit 时间"，不要凭论文名/品牌名引用；② 学术品牌寿命短（daVinci 从图表漂移到基座模型），做竞品监控要以 repo URL + 时间戳为准。
- **可借鉴点**（如团队仍想调研"图表推理 LLM"能力）：可改查可核验的 ChartGPT（arXiv:2311.01920，IEEE TVCG 2024）与 ChartLlama（arXiv:2311.16483）等（见 §2）。

### 1.3 ChartMimic/ChartMimic（注意：主要是评测基准，不是生成服务）

| 项 | 内容 |
|---|---|
| 仓库 | https://github.com/ChartMimic/ChartMimic ；数据集 HF: `ChartMimic/ChartMimic` ；论文 arXiv:2406.09961（ICLR 2025） |
| 一句话定位 | Chart-to-Code 评测基准与评测框架：给 LMM 图表图像+源数据，要求其生成可复现该图的图表代码，以"代码执行+渲染比对"度量跨模态图表推理能力（作者/组织：含北大 Junjie Wang 等，见其 [publication 页](https://wangjunjie-ai.github.io/publication/2025-04-24-chartmimic)）。 |

- **维护状态**：生态活跃但作为"基准"而非"产品"存在。证据：ICLR 2025 接收（[Proceedings](https://proceedings.iclr.cc/paper_files/paper/2025/hash/42806406dd99e30c3796bc98b2670fa2-Abstract-Conference.html)）；被 [open-compass/VLMEvalKit 以 PR#1056 集成](https://github.com/open-compass/VLMEvalKit/pull/1056/files)；2026 年的论文仍将其与 Plot2Code、ChartX 并列为主要图表代码基准（[arXiv:2604.22192 Table 1 对比](https://arxiv.org/pdf/2604.22192v1)）；[HF 数据集 README 仍见"Update README"类近期提交](https://huggingface.co/datasets/ChartMimic/ChartMimic/blame/3a9d88e2a6f14d377a95cf8294fe115c19a20095/README.md)。Star：**约 1.5–3k（估计）**，无数字快照。规模约千级样本、多图表类型/领域（具体语言与样本口径以仓库 README 为准，未能逐字核对）。
- **核心优点**：① 把"图→代码"做成可自动评分的基准，用**代码可执行性 + 渲染结果比对**替代主观评测；② 强调"跨模态推理"（视觉感知 + 数据到码的映射）；③ 被 VLMEvalKit 与后续研究吸收，2026 年仍是事实标准之一；④ 衍生生态多（见 §2.4）。
- **不足/空白点（ChartBrain 视角）**：它是**评测而非生成/转换工具**，不解决产出质量；任务是"复现给定图"，离"自然语言 → 业务图表"（需自主选图、聚合、变换）有距离；更重要的是，代码执行类评测存在"**能跑 ≠ 正确**"的结构性批评（见 §3 与 [EMNLP 2025 Findings "Does It Run and Is That Enough?"](https://aclanthology.org/2025.findings-emnlp.1371/)）。
- **可借鉴点**：① 把"生成 → 渲染 → 图像/结构比对"做成 **ChartBrain 转换器的回归测试管线**；② 其数据（图 + 源数据 + 参考实现）可重构为"中性 spec 对"来训练/评测 spec 生成与转换器正确性。
- **避坑点**：不要以"代码能跑"作为交付标准；基准图多数基于已聚合数据，勿把"重现图"与"从原始数据算对"两件事混为一谈。

### 1.4 pavlin-policar/llm-chart-generation

| 项 | 内容 |
|---|---|
| 仓库 | https://github.com/pavlin-policar/llm-chart-generation |
| 一句话定位 | （推断）Pavlin G. Policar（卢布尔雅那大学，Orange 数据挖掘/Zupan 组相关）关于"用 LLM 生成统计图表 + 校验驱动工作流"的代码仓库，与 arXiv:2605.00800（2026-05）「[Generating Statistical Charts with Validation-Driven LLM Workflows](https://arxiv.org/pdf/2605.00800v1)」（Policar & Pevcin）高度相关。 |

- **检索情况（如实说明）**：对仓库做了 5+ 次针对性检索，**只浮出 GitHub 页面本身**，取不到 README 摘要、commit/release 时间、star 数——强烈提示这是**小而冷门**的仓库（star 估计 <200）。它与 2026 年论文的关联来自搜索引擎将其与 [Semantic Scholar 条目](https://www.semanticscholar.org/paper/Generating-Statistical-Charts-with-LLM-Workflows-Policar-Pevcin/7b51186257abbf3de5d23975f1fe4de557f92bf3)、[EngineersOfAI 解读](https://engineersofai.com/docs/research/paper-breakdowns/2026-05-01-generating-statistical-charts-with-validationdriven-llm-workflows)、[ADS 摘要页](https://ui.adsabs.harvard.edu/abs/2026arXiv260500800P/abstract) 并列返回，属合理推断而非确证。
- **论文方向上的优点**：**validation-driven**（生成 → 程序化校验 → 修复循环）是提升图表正确性的直接手段，聚焦统计图表（箱线图、散点图等）与**统计语义正确性**。
- **不足/空白点（ChartBrain 视角）**：仍是"LLM 写目标代码 + 事后校验"范式；校验器针对特定统计图类型定制，不库无关、无中性 spec、非服务化；校验只能兜底可枚举约束，无法覆盖任意 Highcharts/ECharts 特性。
- **可借鉴点**：把"可程序化检查的约束做成 checker 回路"作为 ChartBrain **确定性转换器之外的质量护栏**；其"统计正确性优先"的取向值得映射进 spec 语义校验层。
- **避坑点**：该仓库证据不足以支撑任何集成/合作决策；**引用前必须人工打开核实内容与活跃度**。

### 1.5 "chartgpt" 同名项目群 —— 同名鱼龙混杂的典型案例

检索确证至少 **3 个开源实现 + 2 篇论文** 共用 "ChartGPT" 之名：

**① Youplala/chartgpt（CSV 问答式出图）**
- 仓库：https://github.com/Youplala/chartgpt （"Visualize your CSV in seconds by asking questions"），另有 [HF Space youplala/chartGPT](https://huggingface.co/spaces/youplala/chartGPT)。
- 定位：上传 CSV、自然语言提问、自动出图（前端 ECharts 渲染风格；2023 年大量博客介绍，如 [dev.to](https://practicaldev-herokuapp-com.global.ssl.fastly.net/opendataanalytics/chartgpt-creating-stunning-visualizations-with-text-based-input-1b71)（[存档](https://web.archive.org/web/20250422165332/https://dev.to/opendataanalytics/chartgpt-creating-stunning-visualizations-with-text-based-input-1b71)）、[note.com](https://note.com/hiroshikinoshita/n/n43a83cff825c)）。commit 如 [d9895ff "docs: improve readme"](https://github.com/Youplala/chartgpt/commit/d9895ffc75381432892dd84148c0778dc50789d5)。
- 维护：热度集中在 2023，未检索到 2025/2026 活动（估计已停更）。Star 约 **1–2k（估计）**。

**② VighneshNilajakar/ChartGPT（Google AI → Google Charts）**
- 仓库：https://github.com/VighneshNilajakar/ChartGPT —— 用 Google Generative AI + Google Charts，自然语言生成交互式图表。Demo 型小项目，star 估计 **<300**。

**③ ZJUIDG/chartgpt（浙江大学 Interactive Data Group，模型类）**
- HF 组织：https://huggingface.co/ZJUIDG ；模型 [chartgpt](https://huggingface.co/ZJUIDG/chartgpt)（其模型卡提示 "A newer version of this model is available: [chartgpt-llama3](https://huggingface.co/ZJUIDG/chartgpt-llama3)"）+ 数据集 [chartgpt-dataset](https://huggingface.co/datasets/ZJUIDG/chartgpt-dataset)，另有 [featherless 部署入口](https://featherless.ai/models/ZJUIDG/chartgpt-llama3)。属 chart2code 式「文本 → 图表代码」指令微调模型（Llama 系）。**与哪篇论文精确对应未能核实。**

**④ 论文同名者（至少两篇）**
- [ChartGPT: Leveraging LLMs to Generate Charts from Abstract Natural Language](https://ar5iv.labs.arxiv.org/html/2311.01920)（arXiv:2311.01920，发表于 [IEEE TVCG 2024](https://ieeexplore.ieee.org/document/10443572)，DOI 10.1109/TVCG.2024.3368621，作者 Tian & Cui）；
- 另有多种同名预印本/报道。

- **对 ChartBrain 的启示**：① 检索/竞品监控必须"仓库 URL + 作者 + 首次发布时间"去重，仅凭名字会张冠李戴；② 起名避开热词、尽早注册商标/命名空间，避免被同名稀释；③ "图表+GPT"类名字已被 2023 年 demo 透支，反而说明**有产品力的后来者要靠工程确定性取胜**而非名字。

---

## 2. 学术综述清单与补充项目

**清单入口**：[zengxingchen/LLM-Visualization-Paper-List](https://github.com/zengxingchen/LLM-Visualization-Paper-List)（"Visualization meets LLM" awesome 列表；[raw README](https://raw.githubusercontent.com/zengxingchen/LLM-Visualization-Paper-List/main/README.md) 直接收录论文条目与摘要，如 LIDA 条目；列表仍在合并 PR，如 [Merge PR #4](https://github.com/zengxingchen/LLM-Visualization-Paper-List/commit/acba6d2d223ce4762eb9096ea79350cfe72a5a16)，维护者 Xingchen Zeng）。该方向 2024–2026 论文密度很高（ChartQA/理解、text-to-vis、chart-to-code、agent 化生成等）。

以下 3 个项目为**交叉验证后补充、建议 ChartBrain 重点跟踪**（"业界使用较多/被引用较多"）：

### 2.1 ObservedObserver/viz-gpt（VizGPT）—— 对话式 NL→Vega-Lite 原型
- 仓库：https://github.com/ObservedObserver/viz-gpt（"Make contextual data visualization with Chat Interface from tabular datasets"，微软研究院相关研究原型，存在大量 fork：[richardo2016-forks](https://github.com/richardo2016-forks/viz-gpt)、[jojocys](https://github.com/jojocys/viz-gpt)、[hrvojesimic](https://github.com/hrvojesimic/viz-gpt) 等）。
- 亮点/借鉴：① 以**对话上下文增量修改图表**（在已有图上"加一条趋势线"）——比一次性 text-to-chart 更贴近真实 BI 需求，ChartBrain 的产品交互可参考；② 以 **Vega-Lite（声明式 JSON spec）为输出目标**，证明"LLM 面向声明式 spec 而非命令式代码"在 2023 年就已可行；但其 spec 仍由 LLM 自由生成，无受控转换层。
- 状态：研究原型，无 2025/2026 活跃信号（估计）；star 约 **1–2k（估计）**。

### 2.2 tingxueronghua/ChartLlama-code（ChartLlama）—— 图表多模态指令微调
- 论文：[arXiv:2311.16483](https://ar5iv.labs.arxiv.org/html/2311.16483)（腾讯、南洋理工等，见 [澎湃报道](https://m.thepaper.cn/newsDetail_forward_25511472)）；代码：[ChartLlama-code](https://relatedrepos.com/gh/tingxueronghua/ChartLlama-code)（另见 [sourcepulse](https://www.sourcepulse.org/projects/1878339)）。
- 亮点/借鉴：以真实图表库数据合成大规模图表指令数据（理解/问答/生成），其**"用图表库真实实例构造训练/评测数据"的配方**可直接用于构造 ChartBrain 的 spec 级训练与评测数据。
- 避坑：多模态/端到端路线仍需从图像与数据中"推理出"数值，**数字幻觉风险未消除**；仓库为研究代码，star 约 **0.3–1k（估计）**。

### 2.3 microsoft/flint-chart（Flint）—— ★ 与 ChartBrain 理念最接近、最具战略意义的项目
- 仓库：https://github.com/microsoft/flint-chart ；项目页 https://microsoft.github.io/flint-chart/ ；论文「[Flint: A Semantics-Driven Data Visualization Intermediate Language](https://ar5iv.labs.arxiv.org/html/2607.20775)」（arXiv:2607.20775，2026-07）；中文报道：[ITHome](https://m.ithome.com/html/975816.htm)、[凤凰科技](https://tech.ifeng.com/c/8uhuXE1O3cW)、[知乎](https://zhuanlan.zhihu.com/p/2068340969397867822)。
- 定位：微软研究院开源的**面向 AI agent 的"可视化中间语言"+ 编译器**——即"LLM 只产出高层语义意图，编译器确定性生成目标图表"，并有 [agent-workflows 教程](https://github.com/microsoft/flint-chart/blob/main/docs/tutorials/agent-workflows.md) 与社区解读（[Better Stack](https://betterstack.com/community/guides/ai/flint-microsoft/)、[stork.ai](https://www.stork.ai/blog/microsofts-new-fix-for-broken-ai)、[byteiota "AI agents are surprisingly bad at drawing charts… with a compiler"](https://byteiota.com/microsoft-flint-ai-agent-chart-generation/)）。
- 工业信号：**PostHog 已有 PR 用 flint-chart 作后端生成 quill-charts spec**（[PostHog/posthog#69482](https://github.com/PostHog/posthog/pull/69482)）——初步采纳证据。
- 对 ChartBrain 的含义：① 这是**正面验证**：大厂用"中间表示 + 确定性编译"修补 LLM 画图不可靠；② 也是**潜在竞品/参照系**：若 Flint 的 IR 成为事实标准，ChartBrain 的中性 spec 需考虑与其互操作或差异化（如更强的声明式数据变换、Highcharts/ECharts 一等转换器）；③ 时机窗口：Flint 2026 年才发论文，生态未固化。

### 2.4 （补充）chart-to-code 评测生态仍在高速演化
- [CSU-JPG/Chart2Code](https://github.com/CSU-JPG/Chart2Code)（用户驱动、分层难度的 chart-to-code 基准）；RealChart2Code（[arXiv:2603.25804](https://www.emergentmind.com/papers/2603.25804)，2026-03）；ChartCoder（中文界报道的图表到代码指令微调，[CSDN](https://blog.csdn.net/u013524655/article/details/145838603)）；以及 2026 论文中与 ChartMimic 并列的 [Plot2Code/ChartX](https://arxiv.org/pdf/2604.22192v1)。
- 含义：方向正在从"代码能不能跑"转向"语义/视觉是否正确"，**这与 ChartBrain 以 spec+确定性转换保证语义正确的立场同向**。

---

## 3. 「LLM 直接写目标库代码」vs「中性 spec + 确定性转换」：3 个关键弱点（综合检索到的论文批评与行业吐槽）

**弱点 1：正确性不可控——"能跑 ≠ 对"，且错误是静默的。**
LLM 直接产出的图表代码即使能执行，数据映射、聚合、坐标与标注也常错。Posit（RStudio）的实验直白地总结为「[When plotting, LLMs see what they expect to see](https://posit.co/blog/introducing-bluffbench)」——模型会画出它"预期"看到的而非真实数据；EMNLP 2025 Findings 论文《[Does It Run and Is That Enough? Revisiting Text-to-Chart Generation with a Multi-Agent Approach](https://aclanthology.org/2025.findings-emnlp.1371/)》（arXiv:2506.06175）系统性批评了"代码可执行"作为 text-to-chart 成功标准的做法。ChartBrain 把"数据→变换→映射"放进受控 spec 与确定性转换器后，数值正确性从模型能力中被剥离，这是结构性优势。

**弱点 2：非确定性 × 库 API 漂移 = 脆弱且难维护。**
直接生成 Highcharts/ECharts/matplotlib 代码意味着输出与**具体库版本/API 语法耦合**：库升级即可能大面积失效，且 LLM 输出不可复现，回归测试成本高。行业吐槽集中于此——微软 Flint 的发布文章直言"AI agents 画图出奇地差，需要一个**编译器**"（[byteiota](https://byteiota.com/microsoft-flint-ai-agent-chart-generation/)、[Better Stack](https://betterstack.com/community/guides/ai/flint-microsoft/)），ThoughtSpot 也发文讨论「[The Missing Language Between LLMs and Charts](https://www.thoughtspot.com/blog/the-missing-language-between-llms-and-charts)」。中性 spec 层保持稳定，目标库升级只影响受版本控制的转换器后端。

**弱点 3：为了修补随机性，业界被迫走向"随机回路套娃"，成本与延迟失控。**
2025–2026 年的解法普遍是**更复杂的 agent/校验回路**：LIDA 的 LLM 自评估、[Validation-Driven LLM Workflows](https://arxiv.org/pdf/2605.00800v1)、EMNLP'25 的多 agent 方案、[METAL（多 agent + test-time scaling）](https://violetpeng.github.io/bibliography/li2025metal/)、[VisCoder2（多语言可视化 coding agent，arXiv:2510.23642）](https://ar5iv.labs.arxiv.org/html/2510.23642)。即：LLM 写码 → LLM/程序校验 → LLM 改码，多轮迭代。这带来延迟、成本、不可复现与难以承诺 SLA 的问题；而"确定性转换器"路线把校验前移为**编译期语义检查**，一次通过率高、可缓存可测试。ChartMimic 基准在 2026 年仍被广泛使用（[arXiv:2604.22192](https://arxiv.org/pdf/2604.22192v1)）也侧面说明：直接代码生成路线至今**没有收敛出可靠方案**，评测仍在追赶。

---

## 4. 给 ChartBrain 的浓缩结论

1. **直接对位项目不是 LIDA/ChartGPT 这类 2023 原型，而是 2025–2026 的中间语言运动**（Flint + PostHog 采纳、Vega-Lite 生态、ThoughtSpot 等行业观点）——ChartBrain 的差异化抓手是：**声明式数据变换作为 spec 一等公民 + Highcharts/ECharts 的高质量确定性转换器**，这是被调研开源项目集体缺失的空白（LIDA 自采样丢精度、ChartMimic 给现成聚合数据、ChartGPT 类直接出图、Flint 偏图表意图语言）。
2. **把"渲染后比对/结构比对"（ChartMimic 思路）做成转换器回归测试**，把 chart-to-code 类基准数据重构成"spec 对"用于训练与评测 spec 生成器。
3. **引文纪律**：daVinci-LLM、ChartGPT 等名称已被复用/漂移，内部知识库与竞品监控必须用 repo URL+commit 时间戳去重；引用 pavlin-policar/llm-chart-generation 前需人工核实（本次无法确证其内容）。
4. **叙事武器**：直接代码生成路线的 3 个弱点（静默错误、库耦合脆弱、回路套娃）均有 2025–2026 论文/行业文章背书，可作为 ChartBrain 对外技术主张的证据包。

---

## 5. 来源 URL 汇总（按项目）

**microsoft/lida**
- https://github.com/microsoft/lida
- https://microsoft.github.io/lida/
- https://github.com/microsoft/lida/blob/main/docs/capabilities.md
- https://ar5iv.labs.arxiv.org/html/2303.02927
- http://arxiv.org/pdf/2303.02927v3
- https://www.semanticscholar.org/paper/LIDA%3A-A-Tool-for-Automatic-Generation-of-and-using-Dibia/1f8efdaa56df0ede1c2b7c6cb55f0640f1ed43df
- https://scirate.com/arxiv/2303.02927
- https://newsletter.victordibia.com/p/lida-automatic-generation-of-grammar?trk=article-ssr-frontend-pulse_little-text-block
- https://news.ycombinator.com/item?id=37305240
- https://aitoolhub.co/tools/lida
- https://olud.ai/project/microsoft-lida.html
- https://github.com/chiarua/lida
- https://github.com/ByteanAtomResearch/lida
- https://git-stars.org/it/blog/summaries/microsoft/lida ；https://git-stars.org/ru/blog/summaries/microsoft/lida
- https://www.sourcepulse.org/projects/1236795 ；https://repositorystats.com/microsoft/lida ；https://www.aisignal.dev/repo/microsoft/lida
- https://awesome.ecosyste.ms/projects/github.com%2Fmicrosoft%2Flida
- https://blog.gitcode.com/b97960c02979edcb581912c3a464c46d.html （接入问题）
- https://deepwiki.com/microsoft/lida/7-tutorials-and-examples

**GAIR-NLP/daVinci-LLM（名称漂移证据）**
- https://github.com/GAIR-NLP/daVinci-LLM
- https://arxiv.org/pdf/2603.27164 ；https://ar5iv.labs.arxiv.org/html/2603.27164
- https://huggingface.co/papers/2603.27164 ；https://scirate.com/arxiv/2603.27164
- https://huggingface.co/datasets/tbukuai/hf-papers-wiki/blob/main/sources/davinci-llm.md
- https://github.com/GAIR-NLP/daVinci-Dev ；https://github.com/GAIR-NLP/daVinci-MagiHuman
- https://huggingface.co/GAIR/daVinci-Dev-72B-MT
- https://theresanaiforthat.com/company/gair-nlp/repository/daVinci-LLM/
- https://www.sii.edu.cn/2026/0329/c27a880/page.htm

**ChartMimic**
- https://github.com/ChartMimic/ChartMimic
- https://arxiv.org/abs/2406.09961 ；https://arxiv.org/html/2406.09961v1 ；https://ar5iv.labs.arxiv.org/html/2406.09961
- https://proceedings.iclr.cc/paper_files/paper/2025/hash/42806406dd99e30c3796bc98b2670fa2-Abstract-Conference.html
- https://wangjunjie-ai.github.io/publication/2025-04-24-chartmimic
- https://huggingface.co/datasets/ChartMimic/ChartMimic
- https://github.com/open-compass/VLMEvalKit/pull/1056/files
- https://arxiv.org/pdf/2604.22192v1 （Table 1：ChartMimic/Plot2Code/ChartX 并列）
- https://www.mendeley.com/catalogue/8b4d6cf1-4dc9-386d-845c-47a29160cc6d/

**pavlin-policar/llm-chart-generation**
- https://github.com/pavlin-policar/llm-chart-generation
- https://arxiv.org/pdf/2605.00800v1
- https://www.semanticscholar.org/paper/Generating-Statistical-Charts-with-LLM-Workflows-Policar-Pevcin/7b51186257abbf3de5d23975f1fe4de557f92bf3
- https://engineersofai.com/docs/research/paper-breakdowns/2026-05-01-generating-statistical-charts-with-validationdriven-llm-workflows
- https://ui.adsabs.harvard.edu/abs/2026arXiv260500800P/abstract
- https://blog.captcha.la/research/2026-05-01-generating-statistical-charts-with-validation-driven-llm-workflows
- https://arxivlens.com/paperview/details/generating-statistical-charts-with-validation-driven-llm-workflows-6625-0ac4c42f
- https://scirate.com/search?q=au:Pevcin_A+in:cs ；https://dblp.org/pid/z/BlazZupan.html

**chartgpt 同名群**
- https://github.com/Youplala/chartgpt ；https://github.com/Youplala/chartgpt/commit/d9895ffc75381432892dd84148c0778dc50789d5
- https://huggingface.co/spaces/youplala/chartGPT
- https://practicaldev-herokuapp-com.global.ssl.fastly.net/opendataanalytics/chartgpt-creating-stunning-visualizations-with-text-based-input-1b71 ；https://web.archive.org/web/20250422165332/https://dev.to/opendataanalytics/chartgpt-creating-stunning-visualizations-with-text-based-input-1b71
- https://note.com/hiroshikinoshita/n/n43a83cff825c
- https://github.com/VighneshNilajakar/ChartGPT
- https://huggingface.co/ZJUIDG ；https://huggingface.co/ZJUIDG/chartgpt ；https://huggingface.co/ZJUIDG/chartgpt-llama3 ；https://huggingface.co/datasets/ZJUIDG/chartgpt-dataset
- https://featherless.ai/models/ZJUIDG/chartgpt-llama3
- https://ar5iv.labs.arxiv.org/html/2311.01920 ；https://ieeexplore.ieee.org/document/10443572 ；https://dl.acm.org/doi/10.1109/tvcg.2024.3368621

**综述清单与补充项目**
- https://github.com/zengxingchen/LLM-Visualization-Paper-List ；https://raw.githubusercontent.com/zengxingchen/LLM-Visualization-Paper-List/main/README.md ；https://github.com/zengxingchen/LLM-Visualization-Paper-List/commit/acba6d2d223ce4762eb9096ea79350cfe72a5a16
- https://github.com/ObservedObserver/viz-gpt ；https://github.com/richardo2016-forks/viz-gpt ；https://github.com/jojocys/viz-gpt ；https://github.com/hrvojesimic/viz-gpt ；https://github.com/aristo-ai/viz-gpt
- https://ar5iv.labs.arxiv.org/html/2311.16483 （ChartLlama）
- https://m.thepaper.cn/newsDetail_forward_25511472 ；https://relatedrepos.com/gh/tingxueronghua/ChartLlama-code ；https://www.sourcepulse.org/projects/1878339
- https://github.com/microsoft/flint-chart ；https://microsoft.github.io/flint-chart/ ；https://github.com/microsoft/flint-chart/blob/main/docs/tutorials/agent-workflows.md
- https://ar5iv.labs.arxiv.org/html/2607.20775 ；https://m.ithome.com/html/975816.htm ；https://tech.ifeng.com/c/8uhuXE1O3cW ；https://zhuanlan.zhihu.com/p/2068340969397867822
- https://github.com/PostHog/posthog/pull/69482
- https://github.com/CSU-JPG/Chart2Code ；https://www.emergentmind.com/papers/2603.25804 ；https://blog.csdn.net/u013524655/article/details/145838603

**路线批评/弱点论据**
- https://posit.co/blog/introducing-bluffbench
- https://aclanthology.org/2025.findings-emnlp.1371/ ；https://nufind.nu.edu.sa/EdsRecord/edsarx,edsarx.2506.06175
- https://www.thoughtspot.com/blog/the-missing-language-between-llms-and-charts
- https://betterstack.com/community/guides/ai/flint-microsoft/ ；https://www.stork.ai/blog/microsofts-new-fix-for-broken-ai ；https://byteiota.com/microsoft-flint-ai-agent-chart-generation/
- https://violetpeng.github.io/bibliography/li2025metal/ （METAL 多 agent）
- https://ar5iv.labs.arxiv.org/html/2510.23642 （VisCoder2）
- https://dl.acm.org/doi/10.1007/978-981-95-3462-3_2 （ChartGen-Agent，ADMA）
