"""Prompt orchestration: assemble ChartRequest into a controlled context for the LLM.

Design constraints (docs/design.md §7 red lines):
- LLM emits only a constrained neutral spec + transform plan; no code/SQL/library config;
- fields may only reference original columns or columns produced/kept by prior transforms
  (column lifecycle);
- requests beyond MVP capability (percent/ratio etc.) => output {"error": ...}; never invent columns.

图型目录：SYSTEM_PROMPT 规则 1 的白名单与「什么时候选哪个图型」的选型段都由
specs/chart-types.json（单一事实源）在 import 时渲染，改目录即改 prompt，
避免白名单/选型说明与代码漂移。
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ..config import settings
from ..models import ChartRequest


def _default_catalog_path() -> Path:
    return Path(settings.effective_specs_dir) / "chart-types.json"


@lru_cache(maxsize=1)
def load_chart_types(path: str | Path | None = None) -> dict:
    """加载图型目录 specs/chart-types.json（路径解析同 validator.load_schema）。"""
    catalog_path = Path(path) if path else _default_catalog_path()
    with catalog_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _chart_type_names() -> list[str]:
    return [t["type"] for t in load_chart_types()["types"]]


def _selection_guidance() -> str:
    """渲染选型段：每图型一行（何时选它）+ 选型策略 + 逐图型必需通道。"""
    catalog = load_chart_types()
    lines = [f"{t['type']} — {t['selection']}" for t in catalog["types"]]
    lines += ["", "Selection policy:"]
    lines += [f"- {p}" for p in catalog["selection_policy"]]
    lines += [
        "",
        "Required channels (a type whose required channels cannot be filled must NOT be "
        'chosen — output {"error":"explain"} and ask the user to clarify instead):',
    ]
    groups: dict[tuple[str, ...], list[str]] = {}
    for t in catalog["types"]:
        groups.setdefault(tuple(t["required_channels"]), []).append(t["type"])
    lines += [f"{' + '.join(chs)}: {', '.join(types)}." for chs, types in groups.items()]
    return "\n".join(lines)


def _render_system_prompt(template: str, parts: dict[str, str]) -> str:
    """替换模板占位符；占位符缺失即报错，防止生成的段落静默消失。"""
    for token, value in parts.items():
        if token not in template:
            raise RuntimeError(f"SYSTEM_PROMPT 模板缺少占位符 {token}")
        template = template.replace(token, value)
    return template


_SYSTEM_PROMPT_TEMPLATE = """You are ChartBrain's chart-intent parser. Convert the user's natural-language request into one "neutral chart spec" JSON object.
Output ONLY a single JSON object. Do not include any explanation, comment, or Markdown code block.

Output JSON shape (field details follow the schema description in the user message):
{
  "schema_version": 1,
  "chart": { "type": "...", "title": "..." },
  "transform_plan": { "steps": [ ... ] },
  "encodings": { "x": {...}, "y": {...}, "series": {...} }
}

Hard rules:
1. chart.type must be one of: __CHART_TYPES__.
2. Any data processing must be expressed declaratively in transform_plan.steps, using ONLY these
   operators: filter | aggregate | sort | limit | derive | binTime. Use at most 6 steps.
   - filter:    { "op":"filter", "field":"col", "operator":"eq|neq|gt|gte|lt|lte|between|in|contains", "value":..., "values":[...] }
   - aggregate: { "op":"aggregate", "group_by":["col",...], "measures":[{"field":"col","agg":"sum|avg|count|countDistinct|min|max","as":"newcol"}] }
   - sort:      { "op":"sort", "by":"col", "order":"asc|desc" }
   - limit:     { "op":"limit", "n":integer }
   - derive:    { "op":"derive", "as":"newcol", "left":{...operand...}, "operator":"add|subtract|multiply|divide", "right":{...operand...} }
                operand = { "field":"col" } or { "value": number }. Binary only: one operator per step.
                For formulas like (revenue-cost)/revenue chain TWO derive steps (first compute the
                difference, then divide it).
   - binTime:   { "op":"binTime", "field":"datecol", "granularity":"month|quarter|year", "as":"newcol" }
                Buckets date/string date columns into labels like "2026-01" / "2026-Q1" / "2026".
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
5. Capability boundary: only the operators and aggregate functions above are supported, including
   simple arithmetic (derive, binary op with fields/constants) and date bucketing (binTime).
   Still NOT supported: percentage/share of a total, month-over-month or year-over-year growth,
   window/rank functions, and any expression needing more than one binary operator per step
   (chain multiple derive steps instead). If the request needs something inexpressible with these
   rules, output {"error":"explain why"} — NEVER invent column names or force a wrong spec.
6. If the request refers to a missing field or you cannot decide the chart type / axes with
   confidence, also output {"error":"explain"} instead of guessing.
7. NEVER output any chart-library config (Highcharts/ECharts), code, or SQL.
8. If context constraints.allowed_fields is non-empty, every referenced column must belong to it;
   if constraints.allowed_aggs is non-empty, every agg must belong to it.

Chart type selection (rule 1 lists the allowed types; pick the one that most directly answers
the question — hints below come from the chart-type catalog):
__SELECTION_GUIDANCE__
"""

SYSTEM_PROMPT = _render_system_prompt(
    _SYSTEM_PROMPT_TEMPLATE,
    {
        "__CHART_TYPES__": " | ".join(_chart_type_names()),
        "__SELECTION_GUIDANCE__": _selection_guidance(),
    },
)


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
            {
                "query": "Show quarterly revenue trend",
                "columns": [
                    {"name": "date", "type": "date"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "line", "title": "Quarterly revenue trend"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "binTime",
                                "field": "date",
                                "granularity": "quarter",
                                "as": "quarter",
                            },
                            {
                                "op": "aggregate",
                                "group_by": ["quarter"],
                                "measures": [
                                    {
                                        "field": "revenue",
                                        "agg": "sum",
                                        "as": "quarterly_revenue",
                                    }
                                ],
                            },
                            {"op": "sort", "by": "quarter", "order": "asc"},
                        ]
                    },
                    "encodings": {
                        "x": {"field": "quarter", "value_type": "categorical"},
                        "y": {"field": "quarterly_revenue", "value_type": "numeric"},
                    },
                },
            },
            {
                "query": "Compare revenue by month, side by side per region",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "groupedBar", "title": "Revenue by month and region"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["month", "region"],
                                "measures": [
                                    {
                                        "field": "revenue",
                                        "agg": "sum",
                                        "as": "monthly_revenue",
                                    }
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "month", "value_type": "categorical"},
                        "y": {"field": "monthly_revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
            {
                "query": "Show how revenue is composed by region each month",
                "columns": [
                    {"name": "month", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "stackedBar", "title": "Revenue composition by region"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["month", "region"],
                                "measures": [
                                    {
                                        "field": "revenue",
                                        "agg": "sum",
                                        "as": "monthly_revenue",
                                    }
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "month", "value_type": "categorical"},
                        "y": {"field": "monthly_revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
            {
                "query": "Break down total revenue by region in a pie chart",
                "columns": [
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "pie", "title": "Regional revenue breakdown"},
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
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "region", "value_type": "categorical"},
                        "y": {"field": "region_revenue", "value_type": "numeric"},
                    },
                },
            },
            {
                "query": "Show each region's share of total revenue",
                "columns": [
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "donut", "title": "Revenue share by region"},
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
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "region", "value_type": "categorical"},
                        "y": {"field": "region_revenue", "value_type": "numeric"},
                    },
                },
            },
            {
                "query": "Compare each region's revenue between the two periods",
                "columns": [
                    {"name": "period", "type": "string"},
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "slope", "title": "Revenue shift by region"},
                    "transform_plan": {
                        "steps": [
                            {
                                "op": "aggregate",
                                "group_by": ["period", "region"],
                                "measures": [
                                    {
                                        "field": "revenue",
                                        "agg": "sum",
                                        "as": "period_revenue",
                                    }
                                ],
                            }
                        ]
                    },
                    "encodings": {
                        "x": {"field": "period", "value_type": "categorical"},
                        "y": {"field": "period_revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
            {
                "query": "Trace how orders and revenue move together over time",
                "columns": [
                    {"name": "orders", "type": "number"},
                    {"name": "revenue", "type": "number"},
                    {"name": "region", "type": "string"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "connectedScatter", "title": "Orders vs revenue path"},
                    "encodings": {
                        "x": {"field": "orders", "value_type": "numeric"},
                        "y": {"field": "revenue", "value_type": "numeric"},
                        "series": {"field": "region"},
                    },
                },
            },
            {
                "query": "Show the spread of revenue across regions",
                "columns": [
                    {"name": "region", "type": "string"},
                    {"name": "revenue", "type": "number"},
                ],
                "chart_spec": {
                    "schema_version": 1,
                    "chart": {"type": "strip", "title": "Revenue spread by region"},
                    "encodings": {
                        "x": {"field": "region", "value_type": "categorical"},
                        "y": {"field": "revenue", "value_type": "numeric"},
                    },
                },
            },
        ],
    }
    return json.dumps(context, ensure_ascii=False)
