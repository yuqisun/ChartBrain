"""HTTP 路由：/health 与 POST /v1/charts（M1 占位）。

M1 目标：骨架可起、curl 通、请求模型校验生效。spec 生成管线在 M2 接入。
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import __version__
from ..models import ChartRequest

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "chartbrain-server", "version": __version__}


@router.post("/v1/charts")
async def create_chart(req: ChartRequest) -> JSONResponse:
    # M1：请求模型校验已由 FastAPI 完成（非法请求自动 422）。
    # spec 生成管线（LLM -> 中性 spec + transform_plan -> L1/L2 校验）在 M2 实现。
    return JSONResponse(
        status_code=501,
        content={
            "detail": "spec 生成管线尚未实现（M2）；请求模型校验已通过",
            "received": {
                "query": req.query,
                "library": req.library,
                "columns": [c.name for c in req.columns],
                "data_sample_rows": len(req.data_sample),
            },
        },
    )
