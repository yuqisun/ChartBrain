"""请求模型边界校验。"""

import pytest
from pydantic import ValidationError

from chartbrain_server.models import ChartRequest


def _base() -> dict:
    return {
        "query": "每月营收",
        "library": "highcharts",
        "columns": [
            {"name": "month", "type": "string"},
            {"name": "revenue", "type": "number"},
        ],
    }


def test_valid_request() -> None:
    req = ChartRequest.model_validate(_base())
    assert req.query == "每月营收"
    assert req.library == "highcharts"
    assert len(req.columns) == 2
    assert req.data_sample == []


def test_invalid_column_type() -> None:
    with pytest.raises(ValidationError):
        ChartRequest.model_validate(
            {**_base(), "columns": [{"name": "x", "type": "float"}]}
        )


def test_empty_query_rejected() -> None:
    with pytest.raises(ValidationError):
        ChartRequest.model_validate({**_base(), "query": "  "})
