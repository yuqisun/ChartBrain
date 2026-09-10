"""API 请求/响应模型（对应 docs/design.md §6 草案）。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class Column(BaseModel):
    """消费端上报的真实列 schema（L2 校验的权威来源）。"""

    name: str = Field(min_length=1, max_length=128)
    type: Literal["string", "number", "boolean", "date"]


class Constraints(BaseModel):
    """可选：消费端声明的执行期约束（白名单，执行期强制）。"""

    allowed_fields: list[str] = Field(default_factory=list)
    allowed_aggs: list[str] = Field(default_factory=list)
    max_transform_rows: int | None = Field(default=None, ge=1)


class ChartRequest(BaseModel):
    """POST /v1/charts 请求体。"""

    query: str = Field(min_length=1, max_length=2000)
    library: Literal["highcharts", "echarts"]
    columns: list[Column] = Field(min_length=1, max_length=200)
    data_sample: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Up to N sample rows (may be masked); helps the LLM understand value "
        "distribution. Omitted by default.",
    )
    constraints: Constraints | None = None

    @field_validator("query")
    @classmethod
    def _query_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("query must not be empty or whitespace")
        return v


class ValidateRequest(BaseModel):
    """POST /v1/validate 请求体：中性 spec + 可选列元数据（不给则只校验 L1）。"""

    spec: dict[str, Any]
    columns: list[Column] = Field(default_factory=list, max_length=200)
    constraints: Constraints | None = None


class ValidateResponse(BaseModel):
    """POST /v1/validate 响应：结构化校验结果（校验结果是 payload，不是 HTTP 错误）。"""

    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ChartResponse(BaseModel):
    """POST /v1/charts 响应（库配置由 SDK 生成，D13）。

    注：M1 仅定义形态；字段按 M2 实际产出收敛。
    """

    request_id: str
    library: Literal["highcharts", "echarts"]
    chart_spec: dict[str, Any]  # 中性 spec（含 transform_plan）
    warnings: list[str] = Field(default_factory=list)
