"""M2 验收：spec 质量基线评测（docs/design.md §9 M2）。

对一组固定 NL 用例跑真实 LLM（默认 DeepSeek，按 .env），统计：
- 可表达用例的 L1/L2 通过率；
- 边界用例（占比/环比等）的「诚实拒绝」率（输出澄清或 L2 明确报错）。

用法（在 server/ 目录，先装好依赖并配置 .env）：
    .\.venv\Scripts\python.exe scripts\eval_spec_baseline.py
结果同时写入 server/scripts/eval_report.json。
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

# 允许从 scripts/ 直接运行
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from chartbrain_server.llm import get_provider  # noqa: E402
from chartbrain_server.models import ChartRequest  # noqa: E402
from chartbrain_server.spec.generator import generate_spec  # noqa: E402

COLUMNS = {
    "finance": [
        {"name": "month", "type": "string"},
        {"name": "date", "type": "date"},
        {"name": "region", "type": "string"},
        {"name": "revenue", "type": "number"},
        {"name": "orders", "type": "number"},
    ]
}

CASES: list[dict] = [
    # ---- 可表达：预期 200 + L1/L2 通过 ----
    {
        "name": "monthly_line",
        "expect": "ok",
        "query": "按月份看营收走势",
        "columns": COLUMNS["finance"],
        "data_sample": [
            {"month": "2026-01", "region": "华东", "revenue": 1200, "orders": 40},
            {"month": "2026-02", "region": "华东", "revenue": 1500, "orders": 45},
        ],
    },
    {
        "name": "region_bar",
        "expect": "ok",
        "query": "各区域营收对比柱状图，从高到低",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "region_pie",
        "expect": "ok",
        "query": "各区域营收占比饼图",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "top3_months",
        "expect": "ok",
        "query": "营收最高的前三个月",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "filter_two_regions",
        "expect": "ok",
        "query": "只看华东和华南两个区域的营收对比",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "avg_revenue_month",
        "expect": "ok",
        "query": "每月平均单笔营收是多少，画柱状图",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "scatter_revenue_orders",
        "expect": "ok",
        "query": "营收和订单量的关系散点图",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "area_monthly",
        "expect": "ok",
        "query": "每月营收面积图",
        "columns": COLUMNS["finance"],
    },
    # ---- 边界：超出 MVP 表达式能力，预期「诚实拒绝」 ----
    {
        "name": "share_by_region_per_month",
        "expect": "refuse",
        "query": "按月份看各区域营收占比趋势",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "mom_growth",
        "expect": "refuse",
        "query": "营收环比增长多少",
        "columns": COLUMNS["finance"],
    },
]


async def run_one(case: dict, provider) -> dict:
    req = ChartRequest.model_validate(
        {
            "query": case["query"],
            "library": "highcharts",
            "columns": case["columns"],
            "data_sample": case.get("data_sample", []),
        }
    )
    result = await generate_spec(req, provider)
    ok = result.errors == [] and result.spec is not None
    # 边界用例：无 spec、但有「澄清/明确 L2 错误」也算正确行为
    graceful = (not ok) and bool(result.errors)
    return {
        "name": case["name"],
        "expect": case["expect"],
        "query": case["query"],
        "ok": ok,
        "graceful_refuse": graceful,
        "errors": result.errors[:3],
        "chart_type": (result.spec or {}).get("chart", {}).get("type"),
    }


async def main() -> None:
    provider = get_provider()
    print(f"provider = {provider.name}\n")
    results = await asyncio.gather(*(run_one(c, provider) for c in CASES))

    ok_cases = [r for r in results if r["expect"] == "ok"]
    refuse_cases = [r for r in results if r["expect"] == "refuse"]
    ok_pass = sum(1 for r in ok_cases if r["ok"])
    refuse_pass = sum(1 for r in refuse_cases if r["graceful_refuse"])

    for r in results:
        mark = "PASS" if r["ok"] or (r["expect"] == "refuse" and r["graceful_refuse"]) else "FAIL"
        detail = (
            f"type={r['chart_type']}"
            if r["ok"]
            else ("(拒绝合理)" if r["graceful_refuse"] else f"errors={r['errors']}")
        )
        print(f"[{mark}] {r['name']:<24} expect={r['expect']:<7} {detail}")

    print("\n===== 汇总 =====")
    print(f"可表达用例 通过率: {ok_pass}/{len(ok_cases)}")
    print(f"边界用例   诚实拒绝率: {refuse_pass}/{len(refuse_cases)}")
    if ok_cases:
        print(f"综合 spec 质量基线(可表达): {ok_pass / len(ok_cases):.0%}")

    report = {
        "summary": {
            "expressible_pass": ok_pass,
            "expressible_total": len(ok_cases),
            "refuse_graceful": refuse_pass,
            "refuse_total": len(refuse_cases),
        },
        "cases": results,
    }
    out = Path(__file__).resolve().parent / "eval_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n报告已写入 {out}")


if __name__ == "__main__":
    asyncio.run(main())
