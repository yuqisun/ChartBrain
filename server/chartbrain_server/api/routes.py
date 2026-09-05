"""HTTP 路由：/health 与 POST /v1/charts（M2：LLM → 中性 spec → L1/L2 → 返回）。

Provider 由配置决定：默认 mock（测试/无 key）；.env 设 CHARTBRAIN_LLM_PROVIDER=openai-compatible
后走真实 LLM（如 DeepSeek）。
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import __version__
from ..llm import get_provider
from ..models import ChartRequest, ChartResponse
from ..spec.generator import generate_spec

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "chartbrain-server", "version": __version__}


@router.post("/v1/charts", response_model=ChartResponse)
async def create_chart(req: ChartRequest) -> ChartResponse | JSONResponse:
    provider = get_provider()
    result = await generate_spec(req, provider)
    if result.errors:
        # L1/L2 校验失败（已耗尽单轮修复）或模型主动要求澄清
        return JSONResponse(
            status_code=422,
            content={
                "detail": "spec 生成未通过校验（L1/L2）或需澄清",
                "errors": result.errors,
                "repair_rounds": result.repair_rounds,
            },
        )
    request_id = "cb_" + uuid.uuid4().hex[:16]
    return ChartResponse(
        request_id=request_id,
        library=req.library,
        chart_spec=result.spec or {},
        warnings=result.warnings,
    )
