"""OpenAI 兼容 Provider（BaseURL + API Key 均可配，兼容 DeepSeek/通义等）。

M1 提供实现骨架；未配置 key 时抛出明确错误。
"""

from __future__ import annotations

import httpx

from ..config import Settings, settings
from .base import BaseLLMProvider


class OpenAIChatProvider(BaseLLMProvider):
    name = "openai-compatible"

    def __init__(self, s: Settings | None = None) -> None:
        s = s or settings
        self.api_key = s.openai_api_key
        self.base_url = s.openai_base_url.rstrip("/")
        self.model = s.openai_model

    async def complete(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
    ) -> str:
        if not self.api_key:
            raise RuntimeError(
                "OpenAI 兼容 Provider 需要 OPENAI_API_KEY（或改设 CHARTBRAIN_LLM_PROVIDER=mock）"
            )
        payload: dict = {
            "model": self.model,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
        return data["choices"][0]["message"]["content"]
