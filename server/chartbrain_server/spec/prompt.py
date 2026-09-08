"""Prompt orchestration: assemble ChartRequest into a controlled context for the LLM.

Design constraints (docs/design.md §7 red lines):
- LLM emits only a constrained neutral spec + transform plan; no code/SQL/library config;
- fields may only reference original columns or columns produced/kept by prior transforms
  (column lifecycle);
- requests beyond MVP capability (percent/ratio etc.) => output {"error": ...}; never invent columns.
"""

from __future__ import annotations

import json

from ..models import ChartRequest

SYSTEM_PROMPT = """You are ChartBrain's chart-intent parser. Convert the user's natural-language request into one "neutral chart spec" JSON object.
Output ONLY a single JSON object. Do not include any explanation, comment, or Markdown code block.

Output JSON shape (field details follow the schema description in the user message):
{
  "schema_version": 1,
  "chart": { "type": "...", "title": "..." },
  "transform_plan": { "steps": [ ... ] },
  "encodings": { "x": {...}, "y": {...}, "series": {...} }
}

Hard rules:
1. chart.type must be one of: bar | line | pie | scatter | area.
2. Any data processing must be expressed declaratively in transform_plan.steps, using ONLY these
   operators: filter | aggregate | sort | limit. Use at most 3 steps.
   - filter:    { "op":"filter", "field":"col", "operator":"eq|neq|gt|gte|lt|lte|between|in|contains", "value":..., "values":[...] }
   - aggregate: { "op":"aggregate", "group_by":["col",...], "measures":[{"field":"col","agg":"sum|avg|count|countDistinct|min|max","as":"newcol"}] }
   - sort:      { "op":"sort", "by":"col", "order":"asc|desc" }
   - limit:     { "op":"limit", "n":integer }
   For agg=count you may omit "field" (counts rows).
3. Column lifecycle (most important; violations fail):
   - Step 1 input is the original columns from the request;
   - After an aggregate step the table keeps ONLY its group_by columns plus each measure's "as"
     column; dropped columns can no longer be referenced by later steps or encodings;
   - measures[].field must reference a column that still exists at the start of this step; never
     reference an "as" column produced later in the same step;
   - To aggregate an already-aggregated numeric column again, it must still exist (kept by
     group_by or produced by an earlier step).
4. sum/avg/min/max only on "number" columns; count/countDistinct work on any column.
5. Capability boundary: only the operators and aggregate functions above are supported. If the
   request needs derived expressions (percent/share, MoM/YoY, ratio, variance, differences etc.)
   or anything inexpressible with these rules, output {"error":"explain why"} — NEVER invent
   column names or force a wrong spec.
6. If the request refers to a missing field or you cannot decide the chart type / axes with
   confidence, also output {"error":"explain"} instead of guessing.
7. NEVER output any chart-library config (Highcharts/ECharts), code, or SQL.
8. If context constraints.allowed_fields is non-empty, every referenced column must belong to it;
   if constraints.allowed_aggs is non-empty, every agg must belong to it.
"""


def build_user_prompt(req: ChartRequest) -> str:
    """Assemble the request into the LLM context JSON."""
    sample = req.data_sample[:10]
    context: dict = {
        "query": req.query,
        "library": req.library,
        "columns": [{"name": c.name, "type": c.type} for c in req.columns],
        "data_sample": sample
        if sample
        else {"note": "No sample provided; rely on column names and types"},
        "constraints": (
            req.constraints.model_dump(exclude_none=True) if req.constraints else {}
        ),
        "few_shot_examples": [
            {
                "query": "Compare revenue by region, highest first",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "bar", "title": "Revenue by region"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["region"],
                                "measures": [
                                    {
                                        "field": "revenue",
                                        "agg": "sum",
                                        "as": "region_revenue",
                                    }
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
                "query": "Show monthly revenue trend",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "line", "title": "Monthly revenue trend"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["month"],
                                "measures": [
                                    {
                                        "field": "revenue",
                                        "agg": "sum",
                                        "as": "monthly_revenue",
                                    }
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
