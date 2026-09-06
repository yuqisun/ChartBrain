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
        if op == "filter":
            f = step.get("field")
            if isinstance(f, str):
                check_field(f, where)
        elif op == "aggregate":
            group_by = step.get("group_by") or []
            for g in group_by:
                if isinstance(g, str):
                    check_field(g, where)
            new_typed: dict[str, str] = {g: typed[g] for g in group_by if g in typed}
            for m in step.get("measures") or []:
                field = m.get("field")
                agg = m.get("agg")
                as_name = m.get("as")
                if allowed_aggs is not None and agg not in allowed_aggs:
                    errors.append(
                        f"L2: {where}/measures: 聚合 '{agg}' 不在 allowed_aggs 白名单内"
                    )
                if field:
                    if check_field(field, where + "/measures"):
                        if agg in _NUMERIC_AGGS and typed.get(field) != "number":
                            errors.append(
                                f"L2: {where}/measures: 数值聚合 {agg} 用于非 number 列 "
                                f"'{field}'（类型: {typed.get(field)}）"
                            )
                elif agg != "count":
                    errors.append(
                        f"L2: {where}/measures: 缺少 field（仅 agg=count 可省略）"
                    )
                if as_name:
                    # 聚合产出一律为数值列（当前算子闭集内）
                    new_typed[as_name] = "number"
            typed = new_typed
        elif op == "sort":
            by = step.get("by")
            if isinstance(by, str):
                check_field(by, where)
        elif op == "limit":
            pass

    # encodings 引用最终表
    for ch, encv in (spec.get("encodings") or {}).items():
        entries = encv if isinstance(encv, list) else [encv]
        for e in entries:
            if isinstance(e, dict):
                f = e.get("field")
                if isinstance(f, str):
                    check_field(f, f"encodings.{ch}")
    return errors
