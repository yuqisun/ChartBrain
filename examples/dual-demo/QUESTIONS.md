# 双库 demo 问题集

`examples/dual-demo` 的数据集（`data.mjs`）共 5 列：
`month`(string, 2025-07 ~ 2026-06)、`region`(华东/华南/华北/西南)、`revenue`、`orders`、`cost`。

运行任一问题：

```bash
cd examples/dual-demo
node demo.mjs "问题文本"
# 打开生成的 dual-chart.html（左 Highcharts / 右 ECharts）
```

## 可表达的问题（预期 200 + 双库一致出图）

| # | 问题 | 预期图型/处理 |
|---|---|---|
| 1 | 各区域营收对比，按营收从高到低 | bar + 按区域 sum + sort desc |
| 2 | 每月营收面积图 | area + 按月 sum |
| 3 | 每月营收走势 | line + 按月 sum |
| 4 | 各区域营收饼图 | pie + 按区域 sum |
| 5 | 营收和订单量的关系 | scatter（x=orders, y=revenue，无变换） |
| 6 | 只看华东和华南的营收对比 | bar + filter(region in) |
| 7 | 营收最高的前三个月 | bar + 按月 sum + sort desc + limit 3 |
| 8 | 每月平均单笔营收 | bar + 按月 avg |

## 边界问题（预期 422「诚实拒绝」，验证能力边界不硬凑）

| # | 问题 | 拒绝原因 |
|---|---|---|
| 9 | 按月份看各区域营收占比趋势 | 占比 = 表达式计算，MVP 算子不支持 |
| 10 | 营收环比增长多少 | 环比 = 差值/百分比，MVP 算子不支持 |

> 边界问题的意义：宁可澄清/拒绝，也不要让 LLM 自创列名硬凑错误 spec（红线 7）。
> 「占比/环比」属于未来 `derive` 派生列能力（路线图前瞻项）。
