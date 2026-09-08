"""生成管线：LLM 结构化输出 → 解析 → L1/L2 校验 →（单轮修复）→ 结果。

流程（docs/design.md §3.3 / §5）：
1. 组装上下文 → provider.complete(json_mode=True)；
2. 解析 JSON（容忍代码块包裹）；
3. L1（JSON Schema）+ L2（字段命中真实列）校验；
4. 失败且未超过一轮 → 把结构化错误回喂 LLM 重出 spec；
5. 仍失败 → 返回 errors（由路由转 422）；歧义（{"error": ...}）→ 直接返回澄清要求。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from ..llm.base import BaseLLMProvider
from ..models import ChartRequest
from .l2 import validate_l2
from .prompt import SYSTEM_PROMPT, build_user_prompt
from .validator import validate_spec

MAX_REPAIR_ROUNDS = 1


@dataclass
class GenerationResult:
    spec: dict | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    repair_rounds: int = 0
    # 错误类型：validation | clarification | provider（路由据此映射 422 / 422 / 503）
    error_kind: str = "validation"


def extract_json(text: str) -> dict:
    """解析模型输出为 dict；容忍 ```json 代码块包裹或首尾杂散文本。"""
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[A-Za-z]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        start, end = t.find("{"), t.rfind("}")
        if start != -1 and end > start:
            return json.loads(t[start : end + 1])
        raise


async def generate_spec(req: ChartRequest, provider: BaseLLMProvider) -> GenerationResult:
    user_prompt = build_user_prompt(req)
    rounds = 0

    while True:
        try:
            raw = await provider.complete(SYSTEM_PROMPT, user_prompt, json_mode=True)
        except Exception as exc:  # noqa: BLE001 —— Provider 层故障（网络/认证/超时/5xx）
            return GenerationResult(
                errors=[f"LLM call failed ({type(exc).__name__}): {exc}"],
                error_kind="provider",
                repair_rounds=rounds,
            )
        try:
            obj = extract_json(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            feedback = (
                f"Model did not return valid JSON ({exc}). First 200 chars: {raw[:200]}"
            )
            if rounds >= MAX_REPAIR_ROUNDS:
                return GenerationResult(errors=[feedback], repair_rounds=rounds)
            rounds += 1
            user_prompt = _append_feedback(user_prompt, [feedback])
            continue

        if isinstance(obj, dict) and obj.get("error"):
            # 模型主动澄清：歧义/缺字段，不硬答（red line）
            return GenerationResult(
                errors=[f"Clarification required: {obj['error']}"],
                error_kind="clarification",
                repair_rounds=rounds,
            )
        if not isinstance(obj, dict):
            feedback = "Model output is not a JSON object"
            if rounds >= MAX_REPAIR_ROUNDS:
                return GenerationResult(errors=[feedback], repair_rounds=rounds)
            rounds += 1
            user_prompt = _append_feedback(user_prompt, [feedback])
            continue

        l1 = validate_spec(obj)
        l2 = validate_l2(obj, req)
        errors = l1 + l2
        if not errors:
            return GenerationResult(spec=obj, repair_rounds=rounds)

        if rounds >= MAX_REPAIR_ROUNDS:
            return GenerationResult(errors=errors, repair_rounds=rounds)
        rounds += 1
        user_prompt = _append_feedback(user_prompt, errors)


def _append_feedback(user_prompt: str, errors: list[str]) -> str:
    block = "\n".join(f"- {e}" for e in errors)
    return (
        f"{user_prompt}\n\n"
        "REPAIR REQUEST (first and only round): the previous spec failed validation:\n"
        f"{block}\n"
        "Fix it strictly according to the rules and output ONLY a single JSON object again."
    )
