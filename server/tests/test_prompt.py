"""守卫 prompt 里的白名单副本与 few-shot 示例（L1 schema 为唯一来源）。

白名单散落多处，prompt.py 的副本（SYSTEM_PROMPT 规则 1 的图型列表 + 内嵌在
few-shot 里的 chart_spec）此前没有任何测试覆盖——漂移只会在真实 LLM 请求里以
「模型照着坏例子输出」的形式暴露。这里把两份副本都钉到
specs/chart-spec.schema.json 上：
1. few-shot 的每个 chart_spec 必须通过现有 L1 校验（validate_spec）；
2. SYSTEM_PROMPT 规则 1 的图型集合必须与 schema enum 集合相等。
"""

from __future__ import annotations

import json
import re

from chartbrain_server.models import ChartRequest
from chartbrain_server.spec.prompt import SYSTEM_PROMPT, build_user_prompt
from chartbrain_server.spec.validator import load_schema, validate_spec


def _schema_enum() -> list[str]:
    """chart.type 白名单的唯一来源：specs/chart-spec.schema.json。"""
    return load_schema()["properties"]["chart"]["properties"]["type"]["enum"]


def _prompt_whitelist() -> set[str]:
    """从 SYSTEM_PROMPT 规则 1 抽出图型列表（one of: … 到规则 2 之间）。"""
    m = re.search(r"chart\.type must be one of:(.*?)2\.", SYSTEM_PROMPT, re.DOTALL)
    assert m, "SYSTEM_PROMPT 规则 1 的白名单段缺失或改版"
    return {tok.rstrip(".") for tok in re.split(r"\s*\|\s*", m.group(1).strip()) if tok}


def _few_shot_chart_specs() -> list[dict]:
    """走 build_user_prompt 的真实路径，取出 few-shot 里的 chart_spec 列表。"""
    req = ChartRequest(
        query="dummy",
        library="highcharts",
        columns=[{"name": "month", "type": "string"}],
    )
    context = json.loads(build_user_prompt(req))
    return [ex["chart_spec"] for ex in context["few_shot_examples"]]


def test_prompt_whitelist_matches_schema_enum() -> None:
    assert _prompt_whitelist() == set(_schema_enum())


def test_every_few_shot_chart_spec_passes_l1() -> None:
    specs = _few_shot_chart_specs()
    assert len(specs) >= 1, "few-shot 列表为空"
    for spec in specs:
        errors = validate_spec(spec)
        assert errors == [], f"few-shot chart_spec 未过 L1: {spec.get('chart')} → {errors}"
