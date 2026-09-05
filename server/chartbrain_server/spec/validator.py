"""L1 校验：加载 specs/chart-spec.schema.json 并对中性 spec 做 JSON Schema 校验。

契约单一来源：仓库根 specs/chart-spec.schema.json（服务端与 SDK 共用）。
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError

from ..config import settings


def _default_schema_path() -> Path:
    return Path(settings.effective_specs_dir) / "chart-spec.schema.json"


@lru_cache(maxsize=1)
def load_schema(path: str | Path | None = None) -> dict:
    schema_path = Path(path) if path else _default_schema_path()
    with schema_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def _validator() -> Draft202012Validator:
    return Draft202012Validator(load_schema())


def validate_spec(spec: dict) -> list[str]:
    """返回错误列表；空列表 = 通过 L1。"""
    errors = sorted(_validator().iter_errors(spec), key=lambda e: list(e.path))
    return [_format_error(e) for e in errors]


def _format_error(e: ValidationError) -> str:
    where = "/" + "/".join(str(p) for p in e.absolute_path) if e.absolute_path else "/"
    return f"{where}: {e.message}"
