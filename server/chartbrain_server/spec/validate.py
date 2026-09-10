"""可复用的结构化校验结果：L1（JSON Schema）+ L2（字段命中真实列）。

形态借用 flint-mcp `validate_chart` 的 valid + errors + warnings 三件套，
让调用方无需经过 POST /v1/charts 的 422 就能自己校验一份 spec。

复用既有实现，不重写、不放松：
- L1 = spec/validator.py::validate_spec（specs/chart-spec.schema.json）
- L2 = spec/l2.py::validate_l2_columns（列元数据 + 可选白名单约束）

关于 warnings：它是真实通道而非占位。目前 L1/L2 都不产出警告，唯一的来源是
"没有传 columns 导致 L2 被跳过"——调用方据此知道本次结果只覆盖了 L1。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..models import Column, Constraints
from .l2 import validate_l2_columns
from .validator import validate_spec

L2_SKIPPED_WARNING = (
    "L2 skipped: no column metadata supplied, only L1 (JSON Schema) was checked. "
    "Pass 'columns' to also verify field references against real columns."
)


@dataclass
class ValidationResult:
    """一次校验的完整结果：valid = errors 为空。"""

    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def validate_chart_spec(
    spec: dict,
    columns: list[Column] | None = None,
    constraints: Constraints | None = None,
) -> ValidationResult:
    """校验中性 spec，返回结构化结果（L1 必跑，L2 仅在给了 columns 时跑）。

    columns 省略或为空 → 只跑 L1，并在 warnings 里说明 L2 被跳过。
    constraints 只在跑 L2 时有意义（allowed_fields / allowed_aggs 白名单）。
    """
    errors: list[str] = list(validate_spec(spec))
    warnings: list[str] = []
    if not columns:
        warnings.append(L2_SKIPPED_WARNING)
    else:
        errors.extend(validate_l2_columns(spec, columns, constraints))
    return ValidationResult(valid=not errors, errors=errors, warnings=warnings)
