"""结构化校验结果（B1/B2/B3）：POST /v1/validate + /v1/charts 的 repair_rounds。

约定：校验结果是 HTTP 200 的 payload（valid/errors/warnings），不是 HTTP 错误；
只有"请求体本身不合法"（如缺 spec）才由 FastAPI 返回 422。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from chartbrain_server.main import app
from chartbrain_server.models import Column
from chartbrain_server.spec.validate import validate_chart_spec

client = TestClient(app)

_MINI_SPEC = {
    "schema_version": 1,
    "chart": {"type": "bar"},
    "encodings": {
        "x": {"field": "m", "value_type": "categorical"},
        "y": {"field": "v", "value_type": "numeric"},
    },
}
_MINI_COLUMNS = [{"name": "m", "type": "string"}, {"name": "v", "type": "number"}]

_AGG_SPEC = {
    "schema_version": 1,
    "chart": {"type": "bar"},
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
_AGG_COLUMNS = [{"name": "month", "type": "string"}, {"name": "revenue", "type": "number"}]


def _post(spec: dict, columns: list[dict] | None = None, **extra):
    payload: dict = {"spec": spec}
    if columns is not None:
        payload["columns"] = columns
    payload.update(extra)
    return client.post("/v1/validate", json=payload)


# ---------- B1：可复用结构化校验器 ----------


def test_validate_chart_spec_unit_valid() -> None:
    result = validate_chart_spec(
        _MINI_SPEC, [Column(name="m", type="string"), Column(name="v", type="number")]
    )
    assert result.valid is True
    assert result.errors == []
    assert result.warnings == []


def test_validate_chart_spec_unit_warns_when_columns_omitted() -> None:
    result = validate_chart_spec(_MINI_SPEC)
    assert result.valid is True
    assert result.errors == []
    assert result.warnings and any("L2" in w for w in result.warnings)


# ---------- B2：POST /v1/validate ----------


def test_validate_endpoint_valid_spec_with_matching_columns() -> None:
    resp = _post(_MINI_SPEC, _MINI_COLUMNS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert body["errors"] == []
    assert body["warnings"] == []


def test_validate_endpoint_accepts_transform_plan_output_columns() -> None:
    resp = _post(_AGG_SPEC, _AGG_COLUMNS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True, body["errors"]
    assert body["errors"] == []


def test_validate_endpoint_l1_unknown_chart_type() -> None:
    spec = {**_MINI_SPEC, "chart": {"type": "bar3d"}}
    resp = _post(spec, _MINI_COLUMNS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert any("bar3d" in e for e in body["errors"])


def test_validate_endpoint_l1_transform_step_missing_required_key() -> None:
    # 缺 by 的 sort 步骤：L1 的 oneOf 只给"不匹配任何 schema"，具体字段由 L2 点出
    spec = {
        "schema_version": 1,
        "chart": {"type": "bar"},
        "transform_plan": {"steps": [{"op": "sort", "order": "desc"}]},
        "encodings": {"x": {"field": "m", "value_type": "categorical"}},
    }
    resp = _post(spec, _MINI_COLUMNS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert any("missing 'by'" in e for e in body["errors"])


def test_validate_endpoint_l2_unknown_column() -> None:
    spec = {
        **_MINI_SPEC,
        "encodings": {
            "x": {"field": "m", "value_type": "categorical"},
            "y": {"field": "ghost", "value_type": "numeric"},
        },
    }
    resp = _post(spec, _MINI_COLUMNS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert any("ghost" in e for e in body["errors"])


def test_validate_endpoint_without_columns_runs_l1_only_and_warns() -> None:
    # ghost 列不存在：没有列元数据时 L2 跳过，所以整体 valid 仍为 True
    spec = {
        **_MINI_SPEC,
        "encodings": {"x": {"field": "m"}, "y": {"field": "ghost"}},
    }
    resp = _post(spec)
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert body["errors"] == []
    assert body["warnings"] and any("L2" in w for w in body["warnings"])


def test_validate_endpoint_empty_columns_behaves_like_omitted() -> None:
    resp = _post(_MINI_SPEC, [])
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert body["warnings"] and any("L2" in w for w in body["warnings"])


def test_validate_endpoint_without_columns_still_reports_l1() -> None:
    resp = _post({**_MINI_SPEC, "chart": {"type": "bar3d"}})
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert any("bar3d" in e for e in body["errors"])
    assert body["warnings"]


def test_validate_endpoint_never_returns_422_for_invalid_spec() -> None:
    spec = {"schema_version": 99, "chart": {"type": "nope"}, "encodings": {}, "bogus": 1}
    resp = _post(spec, _MINI_COLUMNS)
    assert resp.status_code == 200  # 校验结果是 payload，不是 HTTP 错误
    assert resp.json()["valid"] is False


def test_validate_endpoint_applies_constraints_whitelist() -> None:
    resp = _post(_MINI_SPEC, _MINI_COLUMNS, constraints={"allowed_fields": ["m"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert any("allowed_fields" in e for e in body["errors"])


# ---------- B3：成功响应暴露 repair_rounds ----------


def test_charts_success_includes_zero_repair_rounds() -> None:
    resp = client.post(
        "/v1/charts",
        json={
            "query": "每月营收",
            "library": "highcharts",
            "columns": [
                {"name": "month", "type": "string"},
                {"name": "revenue", "type": "number"},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["repair_rounds"] == 0
    assert body["warnings"] == []


def test_charts_failure_path_keeps_repair_rounds() -> None:
    resp = client.post(
        "/v1/charts",
        json={
            "query": "每月营收",
            "library": "highcharts",
            "columns": [{"name": "revenue", "type": "number"}],  # 缺 month
        },
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["error_kind"] == "validation"
    assert body["repair_rounds"] == 1
