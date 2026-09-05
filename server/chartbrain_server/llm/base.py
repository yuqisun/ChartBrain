"""LLM Provider 基类。"""

from __future__ import annotations

from abc import ABC, abstractmethod


class BaseLLMProvider(ABC):
    """所有 Provider 的统一接口（M2 起用于产出中性 spec）。"""

    name: str = "base"

    @abstractmethod
    async def complete(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
    ) -> str:
        """返回模型文本；json_mode=True 时要求模型输出 JSON。"""
        raise NotImplementedError
