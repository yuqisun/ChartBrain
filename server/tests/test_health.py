"""/health 与 /v1/charts 冒烟（M1 验收：起得来、curl 通、校验生效）。"""

from fastapi.testclient import TestClient

from chartbrain_server.main import app

client = TestClient(app)


def test_health() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "chartbrain-server"


def test_v1_charts_placeholder_501() -> None:
    resp = client.post(
        "/v1/charts",
        json={
            "query": "按月份看营收趋势",
            "library": "highcharts",
            "columns": [
                {"name": "month", "type": "string"},
                {"name": "revenue", "type": "number"},
            ],
        },
    )
    # M1 占位：spec 生成管线 M2 实现
    assert resp.status_code == 501
    assert "M2" in resp.json()["detail"]


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
