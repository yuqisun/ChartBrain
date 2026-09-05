"""API 请求/响应模型（对应 docs/design.md §6 草案）。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


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
        description="≤N 行真实样例（可脱敏），帮助 LLM 理解取值分布；默认不含样例",
    )
    constraints: Constraints | None = None


class ChartResponse(BaseModel):
    """POST /v1/charts 响应（库配置由 SDK 生成，D13）。

    注：M1 仅定义形态；字段按 M2 实际产出收敛。
    """

    request_id: str
    library: Literal["highcharts", "echarts"]
    chart_spec: dict[str, Any]  # 中性 spec（含 transform_plan）
    warnings: list[str] = Field(default_factory=list)
