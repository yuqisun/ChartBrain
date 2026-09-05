"""应用配置：优先读取 server/.env（不入库），其余来自环境变量。"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# server/.env：加载一次，供 Settings 读取
_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_ENV_FILE)


class Settings:
    """ChartBrain server 运行时配置。"""

    def __init__(self) -> None:
        # LLM Provider：mock（默认，测试/无 key）| openai-compatible
        self.llm_provider: str = os.getenv("CHARTBRAIN_LLM_PROVIDER", "mock")
        # OpenAI 兼容端点（.env 中按 DeepSeek 默认）
        self.openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
        self.openai_base_url: str = os.getenv(
            "OPENAI_BASE_URL", "https://api.deepseek.com/v1"
        )
        self.openai_model: str = os.getenv("CHARTBRAIN_OPENAI_MODEL", "deepseek-chat")
        # specs 目录覆盖（默认取仓库根 specs/）
        self.specs_dir: str = os.getenv("CHARTBRAIN_SPECS_DIR", "")

    @property
    def effective_specs_dir(self) -> str:
        if self.specs_dir:
            return self.specs_dir
        # config.py 位于 server/chartbrain_server/ -> parents[2] = 仓库根（含 specs/）
        return str(Path(__file__).resolve().parents[2] / "specs")


settings = Settings()
