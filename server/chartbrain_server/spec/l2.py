"""L2 校验：中性 spec 的字段引用是否命中真实列 schema + 类型兼容 + constraints 白名单。

规则（docs/design.md §5）：
- transform 输入字段必须存在于「当前表」（原始列 / 前序变换产出）；
- encodings 引用「最终表」的列；
- numeric 聚合（sum/avg/min/max）只用于 number 列；
- constraints.allowed_fields / allowed_aggs 非空时执行白名单。
"""

from __future__ import annotations

from ..models import ChartRequest

_NUMERIC_AGGS = {"sum", "avg", "min", "max"}


def validate_l2(spec: dict, req: ChartRequest) -> list[str]:
    errors: list[str] = []
    col_types = {c.name: c.type for c in req.columns}
    if not col_types:
        return ["L2: columns 为空，无法校验"]

    allowed_fields: set[str] | None = None
    allowed_aggs: set[str] | None = None
    if req.constraints:
        if req.constraints.allowed_fields:
            allowed_fields = set(req.constraints.allowed_fields)
        if req.constraints.allowed_aggs:
            allowed_aggs = set(req.constraints.allowed_aggs)

    def check_field(field: str, where: str, current: set[str]) -> None:
        if field not in current:
            errors.append(
                f"L2: {where}: 引用的列 '{field}' 不存在（可用列: {sorted(current)}）"
            )
            return
        if allowed_fields is not None and field not in allowed_fields:
            errors.append(
                f"L2: {where}: 列 '{field}' 不在 allowed_fields 白名单内"
            )

    steps: list[dict] = (spec.get("transform_plan") or {}).get("steps") or []
    current = set(col_types)

    for i, step in enumerate(steps):
        op = step.get("op")
        where = f"transform_plan.steps[{i}]({op})"
        if op == "filter":
            f = step.get("field")
            if isinstance(f, str):
                check_field(f, where, current)
        elif op == "aggregate":
            group_by = step.get("group_by") or []
            for g in group_by:
                if isinstance(g, str):
                    check_field(g, where, current)
            outputs = set(group_by)
            for m in step.get("measures") or []:
                field = m.get("field")
                agg = m.get("agg")
                as_name = m.get("as")
                if allowed_aggs is not None and agg not in allowed_aggs:
                    errors.append(
                        f"L2: {where}/measures: 聚合 '{agg}' 不在 allowed_aggs 白名单内"
                    )
                if field:
                    check_field(field, where + "/measures", current)
                    if (
                        agg in _NUMERIC_AGGS
                        and col_types.get(field) != "number"
                    ):
                        errors.append(
                            f"L2: {where}/measures: 数值聚合 {agg} 用于非 number 列 "
                            f"'{field}'（类型: {col_types.get(field)}）"
                        )
                elif agg != "count":
                    errors.append(f"L2: {where}/measures: 缺少 field（仅 count 可省略）")
                if as_name:
                    outputs.add(as_name)
            current = outputs
        elif op == "sort":
            by = step.get("by")
            if isinstance(by, str):
                check_field(by, where, current)
        elif op == "limit":
            pass

    final_cols = current  # 无 steps 时 = 原始列
    for ch, encv in (spec.get("encodings") or {}).items():
        entries = encv if isinstance(encv, list) else [encv]
        for e in entries:
            if isinstance(e, dict):
                f = e.get("field")
                if isinstance(f, str):
                    check_field(f, f"encodings.{ch}", final_cols)
    return errors
