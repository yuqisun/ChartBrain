"""L2 validation: spec field references must hit the real column schema + type checks + whitelist.

Rules (docs/design.md §5):
- Track "current table" columns and types along the transform chain (column lifecycle):
  - Step 1 input = original columns;
  - After an aggregate step only group_by columns + measures' "as" columns remain (others are
    dropped and cannot be referenced later);
  - measures' "as" columns are typed by aggregation semantics (sum/avg/count/countDistinct/min/max
    => number), so re-aggregating an already-aggregated numeric column is allowed without false
    type errors;
- encodings reference columns of the final table;
- numeric aggs (sum/avg/min/max) only on "number" columns;
- constraints.allowed_fields / allowed_aggs are enforced when non-empty.
"""

from __future__ import annotations

from ..models import ChartRequest

_NUMERIC_AGGS = {"sum", "avg", "min", "max"}
_NUMERIC_OUTPUT_AGGS = _NUMERIC_AGGS | {"count", "countDistinct"}
_ALLOWED_AGGS = _NUMERIC_OUTPUT_AGGS
_ALLOWED_FILTER_OPS = {
    "eq", "neq", "gt", "gte", "lt", "lte", "between", "in", "contains",
}
_KNOWN_OPS = {"filter", "aggregate", "sort", "limit", "derive", "binTime"}
_ARITH_OPS = {"add", "subtract", "multiply", "divide"}


def validate_l2(spec: dict, req: ChartRequest) -> list[str]:
    errors: list[str] = []
    base_types = {c.name: c.type for c in req.columns}
    if not base_types:
        return ["L2: columns is empty; cannot validate"]

    allowed_fields: set[str] | None = None
    allowed_aggs: set[str] | None = None
    if req.constraints:
        if req.constraints.allowed_fields:
            allowed_fields = set(req.constraints.allowed_fields)
        if req.constraints.allowed_aggs:
            allowed_aggs = set(req.constraints.allowed_aggs)

    # current table: column -> type (evolves along the transform chain)
    typed: dict[str, str] = dict(base_types)

    def check_field(field: str, where: str) -> bool:
        if field not in typed:
            errors.append(
                f"L2: {where}: referenced column '{field}' does not exist"
                f" (available in current table: {sorted(typed)})"
            )
            return False
        if allowed_fields is not None and field not in allowed_fields:
            errors.append(
                f"L2: {where}: column '{field}' is not in the allowed_fields whitelist"
            )
        return True

    steps: list[dict] = (spec.get("transform_plan") or {}).get("steps") or []
    for i, step in enumerate(steps):
        op = step.get("op")
        where = f"transform_plan.steps[{i}]({op})"
        if op not in _KNOWN_OPS:
            errors.append(
                f"L2: {where}: unknown operator '{op}' (allowed: {sorted(_KNOWN_OPS)})"
            )
            continue
        if op == "filter":
            f = step.get("field")
            operator = step.get("operator")
            if not isinstance(f, str) or not f:
                errors.append(f"L2: {where}: missing 'field'")
            if operator not in _ALLOWED_FILTER_OPS:
                errors.append(
                    f"L2: {where}: invalid operator '{operator}'"
                    f" (allowed: {sorted(_ALLOWED_FILTER_OPS)})"
                )
            if isinstance(f, str):
                check_field(f, where)
        elif op == "aggregate":
            group_by = step.get("group_by") or []
            measures = step.get("measures")
            if not isinstance(measures, list) or not measures:
                errors.append(f"L2: {where}: missing 'measures' (at least 1)")
                measures = []
            for g in group_by:
                if isinstance(g, str):
                    check_field(g, where)
                else:
                    errors.append(f"L2: {where}: group_by entries must be column name strings")
            new_typed: dict[str, str] = {g: typed[g] for g in group_by if g in typed}
            for m in measures:
                field = m.get("field") if isinstance(m, dict) else None
                agg = m.get("agg") if isinstance(m, dict) else None
                as_name = m.get("as") if isinstance(m, dict) else None
                if agg not in _ALLOWED_AGGS:
                    errors.append(
                        f"L2: {where}/measures: invalid aggregation '{agg}'"
                        f" (allowed: {sorted(_ALLOWED_AGGS)})"
                    )
                if not isinstance(as_name, str) or not as_name:
                    errors.append(f"L2: {where}/measures: missing 'as' (output column)")
                if allowed_aggs is not None and agg not in allowed_aggs:
                    errors.append(
                        f"L2: {where}/measures: aggregation '{agg}' is not in the"
                        " allowed_aggs whitelist"
                    )
                if field:
                    check_field(field, where + "/measures")
                    if (
                        agg in _NUMERIC_AGGS
                        and field in typed
                        and typed.get(field) != "number"
                    ):
                        errors.append(
                            f"L2: {where}/measures: numeric aggregation {agg} applied to"
                            f" non-number column '{field}' (type: {typed.get(field)})"
                        )
                elif agg != "count":
                    errors.append(
                        f"L2: {where}/measures: missing 'field' (only agg=count may omit it)"
                    )
                if isinstance(as_name, str) and as_name:
                    # aggregate outputs are always numeric in the current operator set
                    new_typed[as_name] = "number"
            typed = new_typed
        elif op == "sort":
            by = step.get("by")
            if not isinstance(by, str) or not by:
                errors.append(f"L2: {where}: missing 'by' (sort field)")
            else:
                check_field(by, where)
            order = step.get("order", "asc")
            if order not in ("asc", "desc"):
                errors.append(f"L2: {where}: invalid order '{order}' (allowed: asc|desc)")
        elif op == "limit":
            n = step.get("n")
            if not isinstance(n, int) or isinstance(n, bool) or n < 1:
                errors.append(f"L2: {where}: 'n' must be a positive integer")
        elif op == "derive":
            as_name = step.get("as")
            operator = step.get("operator")
            left = step.get("left")
            right = step.get("right")
            if operator not in _ARITH_OPS:
                errors.append(
                    f"L2: {where}: invalid operator '{operator}'"
                    f" (allowed: {sorted(_ARITH_OPS)})"
                )
            for tag, operand in (("left", left), ("right", right)):
                if not isinstance(operand, dict):
                    errors.append(f"L2: {where}/{tag}: operand must be an object")
                    continue
                fld = operand.get("field")
                if fld is not None:
                    if not isinstance(fld, str) or not fld:
                        errors.append(f"L2: {where}/{tag}: operand 'field' must be a string")
                        continue
                    if check_field(fld, where + "/" + tag) and fld in typed:
                        if typed.get(fld) != "number":
                            errors.append(
                                f"L2: {where}/{tag}: arithmetic operand must be numeric;"
                                f" column '{fld}' is {typed.get(fld)}"
                            )
                elif "value" in operand:
                    v = operand.get("value")
                    if isinstance(v, bool) or not isinstance(v, (int, float)):
                        errors.append(
                            f"L2: {where}/{tag}: constant 'value' must be a number"
                        )
                else:
                    errors.append(
                        f"L2: {where}/{tag}: operand must contain 'field' or 'value'"
                    )
            if not isinstance(as_name, str) or not as_name:
                errors.append(f"L2: {where}: missing 'as' (output column)")
            else:
                typed[as_name] = "number"  # derive keeps the full table and adds a column
        elif op == "binTime":
            f = step.get("field")
            gran = step.get("granularity")
            as_name = step.get("as")
            if isinstance(f, str) and f:
                if check_field(f, where) and f in typed:
                    if typed.get(f) not in ("date", "string"):
                        errors.append(
                            f"L2: {where}: binTime requires a date or string column;"
                            f" '{f}' is {typed.get(f)}"
                        )
            else:
                errors.append(f"L2: {where}: missing 'field'")
            if gran not in ("month", "quarter", "year"):
                errors.append(
                    f"L2: {where}: invalid granularity '{gran}'"
                    " (allowed: month|quarter|year)"
                )
            if not isinstance(as_name, str) or not as_name:
                errors.append(f"L2: {where}: missing 'as'")
            else:
                typed[as_name] = "string"  # bucket label like 2026-01 / 2026-Q1 / 2026

    # encodings reference the final table
    for ch, encv in (spec.get("encodings") or {}).items():
        entries = encv if isinstance(encv, list) else [encv]
        for e in entries:
            if isinstance(e, dict):
                f = e.get("field")
                if isinstance(f, str):
                    check_field(f, f"encodings.{ch}")
    return errors
