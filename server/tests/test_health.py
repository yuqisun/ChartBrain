"""/health 与 /v1/charts 端到端冒烟（M2：mock provider 下返回中性 spec）。"""

from fastapi.testclient import TestClient

from chartbrain_server.main import app
from chartbrain_server.models import ChartRequest
from chartbrain_server.spec.l2 import validate_l2
from chartbrain_server.spec.validator import validate_spec

client = TestClient(app)


def _valid_payload() -> dict:
    return {
        "query": "按月份看营收趋势",
        "library": "highcharts",
        "columns": [
            {"name": "month", "type": "string"},
            {"name": "revenue", "type": "number"},
        ],
    }


def test_health() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "chartbrain-server"


def test_v1_charts_returns_spec_200() -> None:
    payload = _valid_payload()
    resp = client.post("/v1/charts", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["request_id"].startswith("cb_")
    spec = body["chart_spec"]
    assert spec["chart"]["type"] in ("bar", "line", "pie", "scatter", "area")
    # 返回的 spec 必须通过 L1 + L2
    req = ChartRequest.model_validate(payload)
    assert validate_spec(spec) == []
    assert validate_l2(spec, req) == []


def test_v1_charts_l2_reject_422() -> None:
    # mock 固定产出引用 month 的 spec；请求没有 month 列 → L2 失败 → 422
    resp = client.post(
        "/v1/charts",
        json={
            "query": "每月营收",
            "library": "highcharts",
            "columns": [{"name": "revenue", "type": "number"}],
        },
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["errors"]
    assert any("month" in e for e in body["errors"])


def test_v1_charts_invalid_library_422() -> None:
    resp = client.post(
        "/v1/charts",
        json={
            "query": "看趋势",
            "library": "matplotlib",  # 不在白名单
            "columns": [{"name": "revenue", "type": "number"}],
        },
    )
    assert resp.status_code == 422


def test_v1_charts_missing_query_422() -> None:
    resp = client.post(
        "/v1/charts",
        json={
            "library": "highcharts",
            "columns": [{"name": "revenue", "type": "number"}],
        },
    )
    assert resp.status_code == 422
