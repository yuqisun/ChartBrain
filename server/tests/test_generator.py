"""生成管线与 L2 校验单元测试。"""

from __future__ import annotations

import asyncio

from chartbrain_server.llm.base import BaseLLMProvider
from chartbrain_server.llm.mock import MockProvider
from chartbrain_server.models import ChartRequest
from chartbrain_server.spec.generator import extract_json, generate_spec
from chartbrain_server.spec.l2 import validate_l2


class _FakeProvider(BaseLLMProvider):
    name = "fake"

    def __init__(self, text: str) -> None:
        self._text = text

    async def complete(self, system, user, *, json_mode=False) -> str:
        return self._text


def _req(columns: list[dict], query: str = "每月营收", **extra) -> ChartRequest:
    payload = {"query": query, "library": "highcharts", "columns": columns}
    payload.update(extra)
    return ChartRequest.model_validate(payload)


# ---------- extract_json ----------


def test_extract_json_strips_code_fence() -> None:
    obj = extract_json('```json\n{"schema_version": 1}\n```')
    assert obj == {"schema_version": 1}


def test_extract_json_tolerates_surrounding_text() -> None:
    obj = extract_json('前文说明 {"a": 1} 后文')
    assert obj == {"a": 1}


# ---------- generate_spec (mock) ----------


def test_mock_generation_ok() -> None:
    req = _req(
        [
            {"name": "month", "type": "string"},
            {"name": "revenue", "type": "number"},
        ]
    )
    result = asyncio.run(generate_spec(req, MockProvider()))
    assert result.errors == []
    assert result.spec is not None
    assert result.spec["chart"]["type"] == "bar"


def test_mock_generation_l2_fails_when_column_missing() -> None:
    req = _req([{"name": "revenue", "type": "number"}])  # 缺 month
    result = asyncio.run(generate_spec(req, MockProvider()))
    assert result.errors  # 修复一轮后仍失败
    assert any("month" in e for e in result.errors)


def test_clarification_error_short_circuits() -> None:
    req = _req([{"name": "revenue", "type": "number"}])
    provider = _FakeProvider('{"error": "没有可用于分组的维度列"}')
    result = asyncio.run(generate_spec(req, provider))
    assert result.errors
    assert "澄清请求" in result.errors[0]


def test_invalid_json_repairs_then_fails() -> None:
    req = _req([{"name": "revenue", "type": "number"}])
    provider = _FakeProvider("不是 JSON")
    result = asyncio.run(generate_spec(req, provider))
    assert result.errors
    assert result.repair_rounds == 1


# ---------- L2 ----------


def _l2_spec(enc_y_field: str, agg: str | None = None) -> dict:
    spec = {
        "schema_version": 1,
        "chart": {"type": "bar"},
        "encodings": {
            "x": {"field": "region", "value_type": "categorical"},
            "y": {"field": enc_y_field, "value_type": "numeric"},
        },
    }
    if agg:
        spec["transform_plan"] = {
            "steps": [
                {
                    "op": "aggregate",
                    "group_by": ["region"],
                    "measures": [
                        {"field": "revenue", "agg": agg, "as": "region_revenue"}
                    ],
                }
            ]
        }
    return spec


def test_l2_unknown_encoding_field() -> None:
    req = _req(
        [
            {"name": "region", "type": "string"},
            {"name": "revenue", "type": "number"},
        ]
    )
    spec = _l2_spec("nope_column")
    errors = validate_l2(spec, req)
    assert any("nope_column" in e for e in errors)


def test_l2_encoding_uses_transform_output() -> None:
    req = _req(
        [
            {"name": "region", "type": "string"},
            {"name": "revenue", "type": "number"},
        ]
    )
    # y 引用 aggregate 的 as 产出列，应通过
    spec = _l2_spec("region_revenue", agg="sum")
    assert validate_l2(spec, req) == []


def test_l2_numeric_agg_on_string_column() -> None:
    req = _req(
        [
            {"name": "region", "type": "string"},
            {"name": "revenue", "type": "string"},  # 错误类型
        ]
    )
    spec = _l2_spec("region_revenue", agg="sum")
    errors = validate_l2(spec, req)
    assert any("revenue" in e and "number" in e for e in errors)


def test_l2_allowed_fields_whitelist() -> None:
    req = _req(
        [
            {"name": "region", "type": "string"},
            {"name": "revenue", "type": "number"},
        ],
        constraints={"allowed_fields": ["region"]},  # revenue 不在白名单
    )
    spec = _l2_spec("region_revenue", agg="sum")
    errors = validate_l2(spec, req)
    assert any("allowed_fields" in e for e in errors)


def test_l2_allowed_aggs_whitelist() -> None:
    req = _req(
        [
            {"name": "region", "type": "string"},
            {"name": "revenue", "type": "number"},
        ],
        constraints={"allowed_aggs": ["count"]},  # sum 不在白名单
    )
    spec = _l2_spec("region_revenue", agg="sum")
    errors = validate_l2(spec, req)
    assert any("allowed_aggs" in e for e in errors)


def test_l2_reaggregate_previous_output_no_false_positive() -> None:
    # 步骤 2 对步骤 1 产出的数值列 region_revenue 再聚合 sum：类型应追踪为 number，不误报
    req = _req(
        [
            {"name": "month", "type": "string"},
            {"name": "region", "type": "string"},
            {"name": "revenue", "type": "number"},
        ]
    )
    spec = {
        "schema_version": 1,
        "chart": {"type": "line"},
        "transform_plan": {
            "steps": [
                {
                    "op": "aggregate",
                    "group_by": ["month", "region"],
                    "measures": [
                        {"field": "revenue", "agg": "sum", "as": "region_revenue"}
                    ],
                },
                {
                    "op": "aggregate",
                    "group_by": ["month"],
                    "measures": [
                        {"field": "region_revenue", "agg": "sum", "as": "total_revenue"}
                    ],
                },
            ]
        },
        "encodings": {
            "x": {"field": "month", "value_type": "categorical"},
            "y": {"field": "total_revenue", "value_type": "numeric"},
        },
    }
    assert validate_l2(spec, req) == []
