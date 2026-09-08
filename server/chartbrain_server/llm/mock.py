"""Mock Provider：确定性返回一份合法的示例中性 spec。

用途：M1 验证链路形状；M2 的 prompt 生成接入前，测试不依赖外部 LLM。
"""

from __future__ import annotations

import json

from .base import BaseLLMProvider

_CANNED_SPEC = {
    "schema_version": 1,
    "chart": {"type": "bar", "title": "Monthly revenue trend"},
    "transform_plan": {
        "steps": [
            {
                "op": "aggregate",
                "group_by": ["month"],
                "measures": [
                    {"field": "revenue", "agg": "sum", "as": "monthly_revenue"}
                ],
            },
            {"op": "sort", "by": "month", "order": "asc"},
        ]
    },
    "encodings": {
        "x": {"field": "month", "value_type": "categorical"},
        "y": {"field": "monthly_revenue", "value_type": "numeric"},
    },
}


class MockProvider(BaseLLMProvider):
    name = "mock"

    async def complete(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
    ) -> str:
        # 忽略输入，返回固定示例（真实生成逻辑在 M2 实现）
        return json.dumps(_CANNED_SPEC, ensure_ascii=False)
