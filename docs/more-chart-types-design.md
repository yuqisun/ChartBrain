# 图型扩展设计（G1 · 16 个图型）

> 状态：设计稿（待评审）· 分支 `feat/more-chart-types` · 2026-09-09
> 关联：D15（Highcharts 后端 = vendored flint-js）；本文档是 G1 的设计依据，实施计划见后续 plan 文档。
> 位置说明：本仓库文档为扁平结构（`docs/design.md`、`docs/FLOW.md` …），故不另建 `docs/superpowers/specs/`。

## 1. 背景

ChartBrain 的中性 spec 目前只放行 5 种图型（bar / line / pie / scatter / area），因此
**无论后端有多少模板，用户能画的只有 5 种**。而模板层现状是：

| 后端 | 模板数 |
|---|---|
| Highcharts（本 fork 新增） | 5 |
| ECharts（上游） | 37 |
| Vega-Lite / Plotly / Chart.js / Excel | 36 / 38 / 22 / 18 |

G1 的目标是**在不动 spec 编码通道的前提下**，把放行图型从 5 扩到 21，并保证每个图型在
Highcharts 与 ECharts 两端都有模板、且行为一致。

## 2. 范围：16 个新图型

### 2.1 与初版清单的差异（重要）

初版清单是 14 个，经**实测 EC 模板的 `channels`**（附录 B）后修正：

| 变动 | 图型 | 原因 |
|---|---|---|
| **移出** | Bullet Chart | EC 通道 `["y","x","goal"]` —— 需要 `goal`（目标值）通道，现有 spec 无法表达 |
| **移入** | Radar Chart | EC 通道 `["x","y","color"]` —— 完全可表达（x=指标、y=值、color=实体） |
| **移入** | Boxplot | EC 通道 `["x","y","color"]` —— 可表达（x=类目、y=多行原始值、color=分组） |
| **移入** | Rose Chart | EC 通道 `["x","y","color"]` —— 可表达 |

Bullet 转入 G3（需扩通道），见 §10。Gantt 原本就在 G2，本轮不动。

### 2.2 G1 清单（16 个）

| # | 设计名 | EC 模板 | Highcharts 实现 | 需加载模块 |
|---|---|---|---|---|
| 1 | Grouped Bar Chart | ✓ | `column` + 默认分组（不堆叠） | — |
| 2 | Stacked Bar Chart | ✓ | `column` + `plotOptions.series.stacking` | — |
| 3 | **Donut Chart** | **✗ 需新增** | `pie` + `innerSize` | — |
| 4 | Slope Chart | ✓ | `line` + 2 点/系列 | — |
| 5 | Connected Scatter Plot | ✓ | `line` + 有序点（**不排序**） | — |
| 6 | Strip Plot | ✓ | `scatter` + 确定性 jitter | — |
| 7 | Lollipop Chart | ✓ | `lollipop` series | `modules/lollipop.js` |
| 8 | Waterfall Chart | ✓ | `waterfall` series | `highcharts-more.js` |
| 9 | Funnel Chart | ✓ | `funnel` series | `modules/funnel.js` |
| 10 | Pyramid Chart | ✓ | `pyramid` series | `modules/funnel.js` |
| 11 | Gauge Chart | ✓ | `gauge` series | `highcharts-more.js` |
| 12 | Streamgraph | ✓ | `streamgraph` series | `modules/streamgraph.js` |
| 13 | Histogram | ✓ | `column` + 后端分箱（或 `histogram-bellcurve`） | 视实现 |
| 14 | Radar Chart | ✓ | `polar` + `line`/`areaspline` | `highcharts-more.js` |
| 15 | Boxplot | ✓ | `boxplot` series（Highcharts 可直接吃原始值） | `highcharts-more.js` |
| 16 | Rose Chart | ✓ | `variablepie` 或 polar `column` | `modules/variable-pie.js` |

## 3. 分层改动

每个图型都沿同一套机械动作，四层各司其职：

| 层 | 文件 | 说明 |
|---|---|---|
| ① 后端模板 | `vendor/.../src/highcharts/templates/<x>.ts`（+ EC 端仅 Donut 需新增 `ecDonutChartDef`） | 复用 core 管线（语义/布局），**不重写**布局决策 |
| ② 注册 | 两端 `templates/index.ts` | 分类归位 |
| ③ 契约白名单 | 见 §4（4 处） | 让 LLM 能选到、SDK 能编译 |
| ④ 测试 | vendor 测试、sdk 测试、离线差分脚本 | 见 §6 |

### 3.1 每个模板必须遵守的约定

1. 只做「语义 → 该库 option」的翻译，布局/零基线/溢出裁剪继续走 core（`computeLayout` / `filterOverflow`）；
2. 不得在模板里重新判定字段类型（那是 Phase 0 的职责）；
3. 早退（缺必要通道）时**必须**保证 `spec` 不处于半成品状态；
4. 数据聚合语义与 EC 端对齐：重复 x 求和、双离散计数（D15 已确立的约定）。

## 4. 契约变更（4 处，均需同步）

| 位置 | 改动 |
|---|---|
| `specs/chart-spec.schema.json` | `chart.type` 的 `enum` 增加 16 个值 |
| `server/chartbrain_server/spec/prompt.py:28` | 白名单同步 + 为新图型补 few-shot（说明各自需要的编码组合） |
| `sdk/src/types.ts` | `ChartType` union 扩展 |
| `sdk/src/converter/{highcharts,echarts}.ts` | 类型 → Flint `chartType` 名映射；**按图型映射通道**（饼/环 `x→color, y→size`；漏斗 `x→y, y→size`；仪表 `y→size`；直方图 `x→x`；分组柱 `series→group`） |

## 5. 数据形状映射（按图型）

中性 spec 仍只有 `x / y / series` 三个编码位，各图型按下表解释（这是 G1 不扩通道的代价与边界）：

| 图型 | x | y | series |
|---|---|---|---|
| Grouped / Stacked Bar | 类目轴 | 度量 | 分组（→ Flint `group`/`color`） |
| Donut | 扇区标签 | 扇区值 | — |
| Slope | 两个时期 | 度量 | 实体（每实体一条线） |
| Connected Scatter | 度量 | 度量 | 分组；**路径顺序 = 数据顺序** |
| Strip Plot | 类目轴 | 度量 | 分组 |
| Lollipop / Waterfall / Pyramid / Streamgraph | 类目轴/时间轴 | 度量 | 分组（可选） |
| Funnel | 层级标签 | 层级值 | — |
| Gauge | （忽略） | 指针值 | — |
| Histogram | 度量（分箱源） | （忽略） | 分组（可选） |
| Radar | 指标名 | 指标值 | 实体 |
| Boxplot | 类目轴 | 原始度量（每类目多行） | 分组（可选） |
| Rose | 类目轴 | 度量 | 分组（可选） |

## 6. 测试与验收

每个图型逐项验收，缺一不可：

1. **vendor 全量测试**：`cd vendor/flint-chart/packages/flint-js && npm test`（当前 54 files / 1102 tests，新增用例后应继续全绿）；
2. **sdk 测试**：`cd sdk && npm run typecheck && npm test`（当前 27）；
3. **双端差分测试**：同一份 spec 分别喂 `assembleHighcharts` / `assembleECharts`，断言图型、series 数、点数、逐点 y 值一致（沿用本次已建立的 `.verify` 差分脚本思路，并把它固化为仓库内脚本）；
4. **离线对比页**：`examples/dual-demo/offline.mjs` 扩展为覆盖新图型，人工目测左右两侧；
5. **模块加载说明**：`docs/INTEGRATION.md` 增加「图型 → 需加载的 Highcharts 模块」对照表（消费端必须自己引入模块）。

## 7. 分批与提交

| 批次 | 图型 | 说明 |
|---|---|---|
| **B1 · 变体**（零模块） | Grouped Bar、Stacked Bar、Donut、Slope、Connected Scatter、Strip | 全部复用现有模板结构，先打通「契约 4 处 + 双端模板」的完整链路 |
| **B2 · 模块** | Lollipop、Waterfall、Funnel、Pyramid、Gauge、Streamgraph、Boxplot、Rose、Radar | 依赖 Highcharts 模块/polar 配置 |
| **B3 · 计算** | Histogram | 需要后端分箱 |

每批一个提交，跑完 §6 的 1–4 再进下一批；B1 完成即验证整条链路，风险前移。

> **实施计划按批拆分**：writing-plans 产出的计划以 **B1 为第一份**（6 个图型 + 契约 4 处 + 验收链路），
> B2/B3 在 B1 验收通过后各自单独出计划，避免一份计划横跨 16 个图型、无法在中途停下来复核。

## 8. 风险与缓解

| 风险 | 级别 | 缓解 |
|---|---|---|
| EC 端 Donut 漏改 `instantiate-spec.ts:1188` 的 `chartType` 字符串分支 → 扇区失去逐项配色 | 中 | 已定位到唯一一处；加「逐扇区颜色互不相同」断言 |
| 新图型改变既有 5 种图型的输出 | 中 | 既有模板不动；Grouped/Stacked 以**新增**设计名实现，`Bar Chart`（带 series 时堆叠）行为保持与 EC 一致 |
| Highcharts 模块未加载导致消费端白屏 | 中 | 模板不引入模块依赖；在 INTEGRATION 写明对照表；离线对比页内置模块 |
| 数据形状「语义借用」（如 Gauge 用 y 当指针值）对 LLM 不直观 | 中 | prompt 的 few-shot 对每个图型给出明确示例；L2 校验缺通道时拒绝并澄清 |
| 白名单扩到 21 后 LLM 选型准确率下降 | 中 | 扩样 `server/scripts/eval_spec_baseline.py` 基线，记录通过率变化 |
| 新增图型在 EC 端无模板（如 Donut）造成单库专属 | 低 | 本轮已把 Donut 的 EC 模板纳入范围 |

## 9. 回滚

- 每个批次独立提交；若某图型出问题，`git revert` 该批次提交即可；
- 契约白名单与模板必须同批回滚（否则 spec 放行了但后端无模板 → 抛 `Unknown … chart type`）。

## 10. 后续（G2 / G3 边界）

**G2（零通道变更，但需计算）**：Bump、ECDF、Density、Regression、Calendar Heatmap、Gantt（借用 x/y 表 start/end）。

**G3（需要扩中性 spec 通道，属版本级变更）**：

| 图型 | 需要的新通道/形状 |
|---|---|
| Bullet Chart | `goal` |
| Gantt Chart | `x2`（本轮以借用方式留在 G2，正式方案进 G3） |
| Range Area Chart | `y2` |
| Heatmap | `color` 作为度量（与 `series` 的分组语义冲突） |
| Candlestick | `open/high/low/close` |
| Sankey / Network Graph | 节点/边 |
| Treemap / Sunburst / Tree | 层级 |
| Parallel Coordinates | 多度量 |
| Bubble | `size` |
| Violin | 分布 + 密度（且 Highcharts 无原生） |

**G4（不建议）**：Map / Choropleth（需 GeoJSON）、Density Contour、Bar Table、KPI Card、Combo、Sparkline。

---

## 附录 A · Highcharts 12.6.0 能力地图（实测）

核心包仅 8 种 series：`area, areaspline, bar, column, line, pie, scatter, spline`。

模块 → 新增 series 类型（实测加载后对比）：

| 模块 | 新增 |
|---|---|
| `highcharts-more.js` | arearange、areasplinerange、boxplot、bubble、columnpyramid、columnrange、errorbar、gauge、packedbubble、polygon、waterfall |
| `modules/funnel.js` | funnel、pyramid |
| `modules/lollipop.js` / `dumbbell.js` / `bullet.js` / `streamgraph.js` | lollipop / dumbbell / bullet / streamgraph |
| `modules/heatmap.js` / `treemap.js` / `sunburst.js` / `treegraph.js` | heatmap / treemap / sunburst / treegraph |
| `modules/sankey.js` / `networkgraph.js` / `dependency-wheel.js` / `arc-diagram.js` | sankey / networkgraph / dependencywheel / arcdiagram |
| `modules/xrange.js` | xrange |
| `modules/variable-pie.js` | variablepie |
| `modules/stock.js` | candlestick / ohlc |
| `modules/parallel-coordinates.js` | 平行坐标轴（非新 series） |

polar/雷达由 `highcharts-more.js` 提供：核心包内只有 14 处 `chart.polar` 的**读取分支**（tooltip/轴/标签），
没有径向轴实现；`highcharts-more.js` 内含 `radialAxis` 等 polar 实现代码。保守按「需加载该模块」处理，
实施时以浏览器实测复核（多加载一个模块无害，缺模块才会白屏）。

## 附录 B · 通道可行性核对（实测 EC 模板 `channels`）

| 设计名 | EC channels | 结论 |
|---|---|---|
| Bar / Stacked Bar | `x,y,color` | ✅ 可表达 |
| Grouped Bar | `x,y,group,color` | ✅ `series→group` |
| Pie / Donut | `size,color` | ✅ `x→color, y→size` |
| Slope | `x,y,color,detail` | ✅ detail 可选 |
| Connected Scatter | `x,y,order,color,detail` | ✅ order 用数据顺序 |
| Strip Plot | `x,y,color,size` | ✅ size 可选 |
| Lollipop / Waterfall / Pyramid / Streamgraph | `x,y,color` | ✅ |
| Funnel | `y,size` | ✅ `x→y, y→size` |
| Gauge | `size` | ✅ `y→size` |
| Histogram | `x` | ✅ `x→x` |
| Radar / Rose / Boxplot | `x,y,color` | ✅ |
| **Bullet** | `y,x,goal` | ❌ 缺 goal → G3 |
| **Gantt** | `y,x,x2,…` | ❌ 缺 x2 → G3 |
| Range Area | `x,y,y2` | ❌ → G3 |
| Candlestick | `x,open,high,low,close` | ❌ → G3 |
| Sankey / Network | `x,y,size` | ⚠️ 语义不符 → G3 |
| Treemap / Sunburst / Tree | `color,size,detail(,group)` | ❌ 层级 → G3 |
| Parallel Coordinates | `color,detail` | ❌ 多度量 → G3 |
