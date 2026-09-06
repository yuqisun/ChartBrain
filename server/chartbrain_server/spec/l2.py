"""L2 校验：中性 spec 的字段引用命中真实列 schema + 类型兼容 + constraints 白名单。

规则（docs/design.md §5）：
- 按变换链追踪「当前表」的列与类型（列生命周期）：
  - 第 1 步输入 = 原始列；
  - aggregate 之后只剩 group_by 列 + measures 的 as 列（其余丢弃，后续不能再引用）；
  - measures 的 as 列类型按聚合语义记录（sum/avg/count/countDistinct/min/max → number），
    从而允许「对已聚合数值列再次聚合」且不做类型误报；
- encodings 引用「最终表」的列；
- numeric 聚合（sum/avg/min/max）只用于 number 列；
- constraints.allowed_fields / allowed_aggs 非空时执行白名单。
"""

from __future__ import annotations

from ..models import ChartRequest

_NUMERIC_AGGS = {"sum", "avg", "min", "max"}
_NUMERIC_OUTPUT_AGGS = _NUMERIC_AGGS | {"count", "countDistinct"}
_ALLOWED_AGGS = _NUMERIC_OUTPUT_AGGS
_ALLOWED_FILTER_OPS = {
    "eq", "neq", "gt", "gte", "lt", "lte", "between", "in", "contains",
}
_KNOWN_OPS = {"filter", "aggregate", "sort", "limit"}


def validate_l2(spec: dict, req: ChartRequest) -> list[str]:
    errors: list[str] = []
    base_types = {c.name: c.type for c in req.columns}
    if not base_types:
        return ["L2: columns 为空，无法校验"]

    allowed_fields: set[str] | None = None
    allowed_aggs: set[str] | None = None
    if req.constraints:
        if req.constraints.allowed_fields:
            allowed_fields = set(req.constraints.allowed_fields)
        if req.constraints.allowed_aggs:
            allowed_aggs = set(req.constraints.allowed_aggs)

    # 当前表的列 -> 类型（随变换链演进）
    typed: dict[str, str] = dict(base_types)

    def check_field(field: str, where: str) -> bool:
        if field not in typed:
            errors.append(
                f"L2: {where}: 引用的列 '{field}' 不存在"
                f"（当前表可用列: {sorted(typed)}）"
            )
            return False
        if allowed_fields is not None and field not in allowed_fields:
            errors.append(f"L2: {where}: 列 '{field}' 不在 allowed_fields 白名单内")
        return True

    steps: list[dict] = (spec.get("transform_plan") or {}).get("steps") or []
    for i, step in enumerate(steps):
        op = step.get("op")
        where = f"transform_plan.steps[{i}]({op})"
        if op not in _KNOWN_OPS:
            errors.append(f"L2: {where}: 未知算子 '{op}'（允许: {sorted(_KNOWN_OPS)}）")
            continue
        if op == "filter":
            f = step.get("field")
            operator = step.get("operator")
            if not isinstance(f, str) or not f:
                errors.append(f"L2: {where}: 缺少 field")
            if operator not in _ALLOWED_FILTER_OPS:
                errors.append(
                    f"L2: {where}: operator '{operator}' 非法（允许: {sorted(_ALLOWED_FILTER_OPS)}）"
                )
            if isinstance(f, str):
                check_field(f, where)
        elif op == "aggregate":
            group_by = step.get("group_by") or []
            measures = step.get("measures")
            if not isinstance(measures, list) or not measures:
                errors.append(f"L2: {where}: 缺少 measures（至少 1 项）")
                measures = []
            for g in group_by:
                if isinstance(g, str):
                    check_field(g, where)
                else:
                    errors.append(f"L2: {where}: group_by 元素必须是列名字符串")
            new_typed: dict[str, str] = {g: typed[g] for g in group_by if g in typed}
            for m in measures:
                field = m.get("field") if isinstance(m, dict) else None
                agg = m.get("agg") if isinstance(m, dict) else None
                as_name = m.get("as") if isinstance(m, dict) else None
                if agg not in _ALLOWED_AGGS:
                    errors.append(
                        f"L2: {where}/measures: 聚合 '{agg}' 非法"
                        f"（允许: {sorted(_ALLOWED_AGGS)}）"
                    )
                if not isinstance(as_name, str) or not as_name:
                    errors.append(f"L2: {where}/measures: 缺少 as（输出列名）")
                if allowed_aggs is not None and agg not in allowed_aggs:
                    errors.append(
                        f"L2: {where}/measures: 聚合 '{agg}' 不在 allowed_aggs 白名单内"
                    )
                if field:
                    check_field(field, where + "/measures")
                    if (
                        agg in _NUMERIC_AGGS
                        and field in typed
                        and typed.get(field) != "number"
                    ):
                        errors.append(
                            f"L2: {where}/measures: 数值聚合 {agg} 用于非 number 列 "
                            f"'{field}'（类型: {typed.get(field)}）"
                        )
                elif agg != "count":
                    errors.append(
                        f"L2: {where}/measures: 缺少 field（仅 agg=count 可省略）"
                    )
                if isinstance(as_name, str) and as_name:
                    # 聚合产出一律为数值列（当前算子闭集内）
                    new_typed[as_name] = "number"
            typed = new_typed
        elif op == "sort":
            by = step.get("by")
            if not isinstance(by, str) or not by:
                errors.append(f"L2: {where}: 缺少 by（排序字段）")
            else:
                check_field(by, where)
            order = step.get("order", "asc")
            if order not in ("asc", "desc"):
                errors.append(f"L2: {where}: order '{order}' 非法（允许: asc|desc）")
        elif op == "limit":
            n = step.get("n")
            if not isinstance(n, int) or isinstance(n, bool) or n < 1:
                errors.append(f"L2: {where}: n 必须是正整数")

    # encodings 引用最终表
    for ch, encv in (spec.get("encodings") or {}).items():
        entries = encv if isinstance(encv, list) else [encv]
        for e in entries:
            if isinstance(e, dict):
                f = e.get("field")
                if isinstance(f, str):
                    check_field(f, f"encodings.{ch}")
    return errors
