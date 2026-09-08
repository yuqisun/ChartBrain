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
            "ChartBrain stateless intent layer: natural language -> neutral chart spec + "
            "declarative transform plan. No library config is produced here (D13); all "
            "deterministic steps run in the consumer @chartbrain/sdk."
        ),
    )
    app.include_router(api_router)
    return app


app = create_app()
