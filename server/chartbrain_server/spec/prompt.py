"""Prompt 编排：把 ChartRequest 组装成受控上下文，交给 LLM 产出中性 spec。

设计要点（docs/design.md §7 红线）：
- LLM 只出「受约束的中性 spec + 变换计划」，不写代码/SQL、不产库配置；
- 字段只能引用 columns 原始列或变换 as 产出的列；
- 歧义/字段不存在时要求输出 {"error": "..."}，禁止瞎猜。
"""

from __future__ import annotations

import json

from ..models import ChartRequest

SYSTEM_PROMPT = """你是 ChartBrain 的图表意图解析器。把用户的自然语言请求转换成一份「中性 chart spec」JSON。
只输出一个 JSON 对象，不要输出任何解释、注释或 Markdown 代码块。

输出 JSON 结构（详细字段按用户消息中给出的 schema 说明）：
{
  "schema_version": 1,
  "chart": { "type": "...", "title": "..." },
  "transform_plan": { "steps": [ ... ] },
  "encodings": { "x": {...}, "y": {...}, "series": {...} }
}

硬性规则：
1. chart.type 只能是：bar | line | pie | scatter | area 之一。
2. 数据加工（分组、聚合、过滤、排序、截断）必须用 transform_plan.steps 声明式表达，
   算子只允许：filter | aggregate | sort | limit。
   - filter:   { "op":"filter", "field":"列", "operator":"eq|neq|gt|gte|lt|lte|between|in|contains", "value":..., "values":[...] }
   - aggregate:{ "op":"aggregate", "group_by":["列",...], "measures":[{"field":"列","agg":"sum|avg|count|countDistinct|min|max","as":"新列名"}] }
   - sort:     { "op":"sort", "by":"列", "order":"asc|desc" }
   - limit:    { "op":"limit", "n":整数 }
   aggregate 中 agg=count 时可省略 field（统计行数）。
3. 字段引用规则：
   - transform 的输入字段必须是 columns 里的原始列名；
   - aggregate 用 "as" 产出新列；encodings 引用「变换后仍存在的列名」（无变换则直接引用原始列名）。
4. sum/avg/min/max 只能用于 number 类型列。
5. 绝不输出任何图表库配置（Highcharts/ECharts）、不写代码、不写 SQL。
6. 如果请求里没有对应字段、或信息不足无法确定图型/轴，就输出 {"error":"说明原因"}，禁止猜测。
7. 若上下文 constraints.allowed_fields 非空，所有引用字段必须属于它；
   若 constraints.allowed_aggs 非空，agg 必须属于它。
"""


def build_user_prompt(req: ChartRequest) -> str:
    """把请求组装成给 LLM 的上下文 JSON。"""
    sample = req.data_sample[:10]
    context: dict = {
        "query": req.query,
        "library": req.library,
        "columns": [{"name": c.name, "type": c.type} for c in req.columns],
        "data_sample": sample
        if sample
        else {"note": "未提供样例，按列名与类型理解即可"},
        "constraints": (
            req.constraints.model_dump(exclude_none=True) if req.constraints else {}
        ),
        "few_shot_examples": [
            {
                "query": "各区域营收对比，哪个最高",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "bar", "title": "各区域营收对比"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["region"],
                                "measures": [
                                    {"field": "revenue", "agg": "sum", "as": "region_revenue"}
                                ],
                            },
                            {"op": "sort", "by": "region_revenue", "order": "desc"},
                        ]
                    },
                    "encodings": {
                        "x": {"field": "region", "value_type": "categorical"},
                        "y": {"field": "region_revenue", "value_type": "numeric"},
                    },
                },
            },
            {
                "query": "按月份看营收趋势",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "line", "title": "月度营收趋势"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["month"],
                                "measures": [
                                    {"field": "revenue", "agg": "sum", "as": "monthly_revenue"}
                                ],
                            },
                            {"op": "sort", "by": "month", "order": "asc"},
                        ]
                    },
                    "encodings": {
                        "x": {"field": "month", "value_type": "categorical"},
                        "y": {"field": "monthly_revenue", "value_type": "numeric"},
                    },
                },
            },
        ],
    }
    return json.dumps(context, ensure_ascii=False)
