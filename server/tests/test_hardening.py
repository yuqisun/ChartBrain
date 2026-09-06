"""加固测试：LLM Provider 故障 → error_kind=provider → HTTP 503。"""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from chartbrain_server.llm.base import BaseLLMProvider
from chartbrain_server.models import ChartRequest
from chartbrain_server.spec.generator import generate_spec

client = TestClient(__import__("chartbrain_server.main", fromlist=["app"]).app)


class _BoomProvider(BaseLLMProvider):
    name = "boom"

    async def complete(self, system, user, *, json_mode=False) -> str:
        raise RuntimeError("connection reset by deepseek")


def _req() -> ChartRequest:
    return ChartRequest.model_validate(
        {
            "query": "每月营收",
            "library": "highcharts",
            "columns": [
                {"name": "month", "type": "string"},
                {"name": "revenue", "type": "number"},
            ],
        }
    )


def test_provider_failure_marked_as_provider_kind() -> None:
    result = asyncio.run(generate_spec(_req(), _BoomProvider()))
    assert result.error_kind == "provider"
    assert result.spec is None
    assert result.errors and "LLM 调用失败" in result.errors[0]


def test_provider_failure_returns_503(monkeypatch) -> None:
    from chartbrain_server.api import routes as routes_mod

    monkeypatch.setattr(routes_mod, "get_provider", lambda: _BoomProvider())
    resp = client.post(
        "/v1/charts",
        json={
            "query": "每月营收",
            "library": "highcharts",
            "columns": [{"name": "revenue", "type": "number"}],
        },
    )
    assert resp.status_code == 503
    body = resp.json()
    assert body["error_kind"] == "provider"
    assert body["request_id"].startswith("cb_")
