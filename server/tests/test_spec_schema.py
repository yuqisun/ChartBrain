"""L1：中性 spec 与 specs/chart-spec.schema.json 的一致性。"""

from chartbrain_server.llm.mock import MockProvider
from chartbrain_server.spec.validator import validate_spec


def _valid_spec() -> dict:
    return {
        "schema_version": 1,
        "chart": {"type": "line", "title": "月度营收趋势"},
        "transform_plan": {
            "steps": [
                {
                    "op": "aggregate",
                    "group_by": ["month"],
                    "measures": [
                        {"field": "revenue", "agg": "sum", "as": "monthly_revenue"}
                    ],
                },
                {"op": "sort", "by": "month", "order": "asc"},
            ]
        },
        "encodings": {
            "x": {"field": "month", "value_type": "categorical"},
            "y": {"field": "monthly_revenue", "value_type": "numeric"},
        },
    }


def test_valid_spec_passes_l1() -> None:
    assert validate_spec(_valid_spec()) == []


def test_mock_provider_output_passes_l1() -> None:
    import asyncio
    import json

    provider = MockProvider()
    text = asyncio.run(provider.complete(system="", user=""))
    assert validate_spec(json.loads(text)) == []


def test_bad_chart_type_fails() -> None:
    spec = _valid_spec()
    spec["chart"]["type"] = "3d-pie"  # 不在白名单
    errors = validate_spec(spec)
    assert len(errors) >= 1
    assert "chart" in errors[0]


def test_extra_property_fails() -> None:
    spec = _valid_spec()
    spec["chart"]["plotOptions"] = {}  # 库方言不许进中性 spec
    errors = validate_spec(spec)
    assert len(errors) >= 1


def test_bad_agg_fails() -> None:
    spec = _valid_spec()
    spec["transform_plan"]["steps"][0]["measures"][0]["agg"] = "median"  # MVP 未开放
    errors = validate_spec(spec)
    assert len(errors) >= 1
