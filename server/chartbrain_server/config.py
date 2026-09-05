"""应用配置：全部来自环境变量，避免额外依赖（无 pydantic-settings）。"""

from __future__ import annotations

import os


class Settings:
    """ChartBrain server 运行时配置。"""

    def __init__(self) -> None:
        # LLM Provider（M1 默认 mock；M2 接入真实 Provider）
        self.llm_provider: str = os.getenv("CHARTBRAIN_LLM_PROVIDER", "mock")
        # OpenAI 兼容端点（openai_compat provider 使用）
        self.openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
        self.openai_base_url: str = os.getenv(
            "OPENAI_BASE_URL", "https://api.openai.com/v1"
        )
        self.openai_model: str = os.getenv("CHARTBRAIN_OPENAI_MODEL", "gpt-4o-mini")
        # specs 目录覆盖（默认取仓库根 specs/）
        self.specs_dir: str = os.getenv("CHARTBRAIN_SPECS_DIR", "")

    @property
    def effective_specs_dir(self) -> str:
        if self.specs_dir:
            return self.specs_dir
        # server/chartbrain_server/config.py -> parents[2] = 仓库根（viz-ai/，含 specs/）
        from pathlib import Path

        return str(Path(__file__).resolve().parents[2] / "specs")


settings = Settings()
