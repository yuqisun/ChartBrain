"""HTTP 路由：/health、POST /v1/charts（M2+：LLM → 中性 spec → L1/L2 → 返回）与
POST /v1/validate（纯校验，无 LLM）。

Provider 由配置决定：默认 mock（测试/无 key）；.env 设 CHARTBRAIN_LLM_PROVIDER=openai-compatible
后走真实 LLM（如 DeepSeek）。

错误状态映射（B-4）：
- provider 故障（网络/认证/超时）→ 503
- 需要澄清 / L1/L2 校验失败 → 422（携带 error_kind 与结构化 errors）

/v1/validate 例外：它不生成 spec，只校验调用方给的 spec，因此**始终 200**，
校验结果（valid/errors/warnings）就是响应体。
"""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import __version__
from ..llm import get_provider
from ..models import ChartRequest, ChartResponse, ValidateRequest, ValidateResponse
from ..spec.generator import generate_spec
from ..spec.validate import validate_chart_spec

logger = logging.getLogger("chartbrain.api")

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "chartbrain-server", "version": __version__}


@router.post("/v1/validate", response_model=ValidateResponse)
def validate(req: ValidateRequest) -> ValidateResponse:
    """校验调用方给的中性 spec（L1 + 可选 L2）：确定性、无 LLM、无网络，始终 200。"""
    result = validate_chart_spec(req.spec, req.columns, req.constraints)
    logger.info(
        "validate.done valid=%s errors=%d warnings=%d columns=%d",
        result.valid,
        len(result.errors),
        len(result.warnings),
        len(req.columns),
    )
    return ValidateResponse(
        valid=result.valid,
        errors=result.errors,
        warnings=result.warnings,
    )


@router.post("/v1/charts", response_model=ChartResponse)
async def create_chart(req: ChartRequest) -> ChartResponse | JSONResponse:
    request_id = "cb_" + uuid.uuid4().hex[:16]
    started = time.perf_counter()
    provider = get_provider()
    logger.info(
        "charts.start request_id=%s library=%s provider=%s columns=%d query_len=%d",
        request_id,
        req.library,
        provider.name,
        len(req.columns),
        len(req.query),
    )

    result = await generate_spec(req, provider)
    latency_ms = round((time.perf_counter() - started) * 1000, 1)

    if result.errors:
        status = 503 if result.error_kind == "provider" else 422
        detail = {
            "validation": "Spec generation failed L1/L2 validation",
            "clarification": "Spec generation needs clarification",
            "provider": "LLM provider call failed",
        }.get(result.error_kind, "Spec generation failed")
        logger.info(
            "charts.fail request_id=%s status=%d kind=%s errors=%d latency_ms=%s",
            request_id,
            status,
            result.error_kind,
            len(result.errors),
            latency_ms,
        )
        return JSONResponse(
            status_code=status,
            content={
                "detail": detail,
                "error_kind": result.error_kind,
                "errors": result.errors,
                "repair_rounds": result.repair_rounds,
                "request_id": request_id,
            },
        )

    logger.info(
        "charts.ok request_id=%s library=%s chart_type=%s latency_ms=%s",
        request_id,
        req.library,
        (result.spec or {}).get("chart", {}).get("type"),
        latency_ms,
    )
    return ChartResponse(
        request_id=request_id,
        library=req.library,
        chart_spec=result.spec or {},
        warnings=result.warnings,
        repair_rounds=result.repair_rounds,
    )
