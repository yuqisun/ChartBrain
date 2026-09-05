"""Provider 工厂与注册表。"""

from __future__ import annotations

from ..config import Settings, settings
from .base import BaseLLMProvider


def list_providers() -> list[str]:
    return ["mock", "openai-compatible"]


def get_provider(name: str | None = None, s: Settings | None = None) -> BaseLLMProvider:
    """按名称实例化 Provider；缺省用配置的 CHARTBRAIN_LLM_PROVIDER（默认 mock）。"""
    s = s or settings
    provider_name = (name or s.llm_provider).lower()
    if provider_name == "mock":
        from .mock import MockProvider

        return MockProvider()
    if provider_name in ("openai", "openai-compatible"):
        from .openai_compat import OpenAIChatProvider

        return OpenAIChatProvider(s)
    raise ValueError(f"未知 LLM provider: {provider_name!r}（可用: {list_providers()}）")
