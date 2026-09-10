"""GET /v1/chart-types：把 specs/chart-types.json（单一事实源）暴露成只读视图。

测试直接读同一份目录文件做对比，确保端点是"视图"而不是"副本"。
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from chartbrain_server.config import settings
from chartbrain_server.main import app

client = TestClient(app)

_CATALOG = json.loads(
    (Path(settings.effective_specs_dir) / "chart-types.json").read_text(encoding="utf-8")
)


def test_chart_types_returns_200() -> None:
    resp = client.get("/v1/chart-types")
    assert resp.status_code == 200


def test_chart_types_type_set_equals_catalog() -> None:
    body = client.get("/v1/chart-types").json()
    assert [t["type"] for t in body["types"]] == [t["type"] for t in _CATALOG["types"]]


def test_chart_types_every_entry_has_channels_and_selection() -> None:
    body = client.get("/v1/chart-types").json()
    assert body["types"], "catalog must not be empty"
    for entry in body["types"]:
        assert entry["required_channels"], f"{entry['type']}: required_channels is empty"
        assert entry["selection"], f"{entry['type']}: selection is empty"
        assert entry["flint"], f"{entry['type']}: flint is empty"
        assert isinstance(entry["hc_modules"], list)


def test_chart_types_includes_selection_policy() -> None:
    body = client.get("/v1/chart-types").json()
    assert body["selection_policy"] == _CATALOG["selection_policy"]
    assert body["selection_policy"], "selection_policy must not be empty"


def test_chart_types_schema_version_matches_catalog() -> None:
    body = client.get("/v1/chart-types").json()
    assert body["schema_version"] == _CATALOG["schema_version"]


def test_chart_types_response_shape_is_stable() -> None:
    # 文档化的稳定形状：只有这三个顶层键，目录的维护性注释不外泄
    body = client.get("/v1/chart-types").json()
    assert set(body) == {"schema_version", "types", "selection_policy"}
    assert set(body["types"][0]) == {
        "type",
        "flint",
        "required_channels",
        "hc_modules",
        "selection",
    }
