"""FastAPI 应用工厂与入口。"""

from __future__ import annotations

from fastapi import FastAPI

from . import __version__
from .api.routes import router as api_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="chartbrain-server",
        version=__version__,
        description=(
            "ChartBrain 无状态意图层：自然语言 → 轻量中性 chart spec + 声明式变换计划。"
            "不产库配置（D13），确定性步骤在消费端 @chartbrain/sdk。"
        ),
    )
    app.include_router(api_router)
    return app


app = create_app()
