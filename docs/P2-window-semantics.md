# P2 窗口语义锁定（percent / growth）— D14

> 状态：草案待确认（2026-09-05）。本文用**具体数据用例**锁定语义，确认后才开始实现。
> 关联：docs/design.md D14 与 §4.4。

## 0. 示例数据集（全文沿用）

```
region=East  product=A  revenue=50
region=East  product=B  revenue=40
region=West  product=A  revenue=70
region=West  product=C  revenue=10
```

若先 `aggregate group_by=[region, product] measures=[{count, as: n}]`，得：

| region | product | n |
|---|---|---|
| East | A | 1 |
| East | B | 1 |
| West | A | 1 |
| West | C | 1 |

（计数例子计数恒 1，为演示口径改用另一组数据更直观——见 §1 的 n 值例子。以下 n 值直接给定用于说明分母，不依赖上表。）

---

## 1. `percent`：分母四口径（SQL 窗口语义）

以「region × product 的计数表」为例（每行=一个分组），`n` 为各行计数值：

| region | product | n |
|---|---|---|
| East | A | 30 |
| East | B | 20 |
| West | A | 40 |
| West | C | 10 |

对 `East/A (n=30)`：

| denominator | 含义（在 **percent 执行那一刻的当前表**上求 SUM(field) 分区） | East/A 结果 |
|---|---|---|
| `global` | 一个分区覆盖当前表所有行：`SUM(n) = 100` | **0.30** |
| `filtered` | 与 global 同义（当前表已反映之前所有 filter/limit）——**在纯线性 pipeline 中数值恒等于 global**；仅在"percent 之前还有能改变行集的后续语义"（见注①）时才有差别 | 0.30 |
| `group` | 分区 = **最近一次 aggregate 的 group_by 列**：`East` 组内 `SUM(n) = 50` | **0.60** |
| `partition[cols]` | 分区 = 显式 `partition` 列：`partition[product]` → A 的合计 = 30+40 = 70 | **0.30/0.70 ≈ 0.4286** |

**规则**
1. `percent` 输入 = 当前表（它之前所有 filter/aggregate/derive/binTime 的结果）；输出=新增一列 `value/denominator`，**保留整表**；
2. `field` 必须为当前表数值列（L2 校验）；
3. `group` 仅在前面存在 aggregate 且本行能取到 group_by 键时可用，否则报校验错误；
4. 分母为 0 → 结果 **null**（不除零、不臆造）；
5. 结果一律 **0~1 数值**，`%` 显示格式化归消费端/SDK（D14）。

> 注① filtered 的真实差异场景：若 percent **作用于原始明细行**（尚未聚合），`filtered` 表示"这些行是经过全部 filter 之后的行"，`global` 表示"计划开始时的全量行"。当前 DSL 没有保留"计划起点全量"，**建议本版把 filtered 定义为 global 的别名**（语义 = 当前表全行），二者数值相等；未来加"预过滤全量"语义再拆。

---

## 2. `growth`：环比 / 同比

前置：`growth` 作用在**已按时间桶聚合成一行**的当前表上（通常先 `aggregate group_by=[month]` 或 `[month]+分区列`）。

### 2.1 环比（mom）

数据（East 月度 revenue，已聚合、按 month 升序）：

| month | East revenue |
|---|---|
| 2025-11 | 100 |
| 2025-12 | 120 |
| 2026-02 | 130 |

```
{ "op": "growth", "measure": "revenue", "time_field": "month",
  "period": "mom", "partition": ["region"], "as": "mom_growth" }
```

| month | 计算 | mom_growth |
|---|---|---|
| 2025-11 | 首期，无前值 | **null** |
| 2025-12 | 120/100 − 1 | **0.20** |
| 2026-02 | 130/120 − 1（**缺 2026-01 → 与上一"存在的"行比较**，见规则③） | **0.0833…** |

### 2.2 同比（yoy）

| month | East revenue |
|---|---|
| 2025-01 | 100 |
| 2025-02 | 110 |
| 2026-01 | 130 |

`period:"yoy"` → 与 **12 个时间桶之前**（同月去年）比较：

| month | 计算 | yoy |
|---|---|---|
| 2025-01 | 无去年行 | **null** |
| 2026-01 | 130/100 − 1 | **0.30** |

**规则**
1. 输入表须含 `time_field` 且其值可比较排序（统一格式标签如 `2026-01`，lexicographic 即时间序）；L2 校验：**同一 partition 内 time_field 不得重复**（重复桶 → 校验错误，防错误比较）；
2. 每行与**本 partition 内、时间上更早的邻近行**比较；`partition` 省略 = 全表一条序列；
3. **缺期**：时间上缺桶（如无 2026-01 行）时，mom 与"上一存在的行"比（如 2026-02 对 2025-12）；yoy 按 **标签偏移 12 个桶**（月度标签 `year-month` 解析后找同月去年行），找不到 → null；
4. 首期 / 无对应前值 → **null**（D14：不补 0、不跳行）；
5. 前值为 0 或非数值 → null（避免除零/±Inf）；
6. 结果 = `当前/前值 − 1`（可为负），数值精度按 IEEE double；格式化（如 +12.3%）归显示层。

---

## 3. 实现要点（确认后照此做）

- SDK `transform.ts`：新增 `applyPercent`（按 scope 预聚合分母 Map：global 一趟；group/partition 一趟分区 Map）、`applyGrowth`（partition → 有序数组 → 逐行找前值/去年值）；
- L2：percent 的 field 数值检查、group 前置 aggregate 存在性、growth 的 time 唯一性与 measure 数值检查；
- 性能：percent/growth 为 O(rows) 分区 Map + 一趟 sort，可压测 10⁵ 行；
- 提示词（英文）：新增两算子文档 + 2 个 few-shot（分区占比、区域环比）。

## 4. 待你确认的点

1. `filtered` 本版按 **global 别名**处理（数值相等），接受？
2. mom **缺期与上一存在的行比较**、yoy 按标签偏移 12 桶找去年（找不到→null），接受？
3. 首期/前值为 0 → null，接受（D14 已定 null 方向，这里只是确认 0 前值也算 null）？
4. percent 只支持在**当前表加一列**（不做"算完就丢弃原列"的模式），接受？

确认后我据此实现 P2 并补用例到 eval。
