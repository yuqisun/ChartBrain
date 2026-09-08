"""OpenAI 兼容 Provider（BaseURL + API Key 均可配，兼容 DeepSeek/通义等）。

韧性：超时可配（CHARTBRAIN_LLM_TIMEOUT_SECONDS），对瞬时故障
（网络/超时/429/5xx）按退避重试（CHARTBRAIN_LLM_MAX_RETRIES）。
"""

from __future__ import annotations

import asyncio

import httpx

from ..config import Settings, settings
from .base import BaseLLMProvider


def _retryable(exc: Exception) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or code >= 500
    return False


class OpenAIChatProvider(BaseLLMProvider):
    name = "openai-compatible"

    def __init__(self, s: Settings | None = None) -> None:
        s = s or settings
        self.api_key = s.openai_api_key
        self.base_url = s.openai_base_url.rstrip("/")
        self.model = s.openai_model
        self.timeout = s.llm_timeout_seconds
        self.max_retries = s.llm_max_retries

    async def complete(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
    ) -> str:
        if not self.api_key:
            raise RuntimeError(
                "OpenAI-compatible provider needs OPENAI_API_KEY "
                "(or set CHARTBRAIN_LLM_PROVIDER=mock)"
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
        url = f"{self.base_url}/chat/completions"

        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                return data["choices"][0]["message"]["content"]
            except Exception as exc:  # noqa: BLE001 —— 统一按 _retryable 判定
                last_exc = exc
                if attempt >= self.max_retries or not _retryable(exc):
                    raise
                await asyncio.sleep(0.5 * (2**attempt))
        assert last_exc is not None
        raise last_exc
