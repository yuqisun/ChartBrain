"""pytest 全局夹具：强制 mock provider，避免测试依赖 .env / 外部网络。"""

from __future__ import annotations

import pytest

from chartbrain_server.config import settings


@pytest.fixture(autouse=True)
def _force_mock_provider(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "mock")
