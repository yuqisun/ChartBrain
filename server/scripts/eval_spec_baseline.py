"""M2 acceptance: spec-quality baseline eval (docs/design.md §9 M2).

Runs a fixed set of NL cases against the real LLM (DeepSeek by default, per .env) and reports:
- L1/L2 pass rate for expressible cases;
- "honest refusal" rate for boundary cases (percent/MoM etc. must ask for clarification).

Usage (in server/, deps installed and .env configured):
    .\.venv\Scripts\python.exe scripts\eval_spec_baseline.py
Also writes results to server/scripts/eval_report.json.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

# allow running directly from scripts/
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
    # ---- expressible: expect 200 + L1/L2 pass ----
    {
        "name": "monthly_line",
        "expect": "ok",
        "query": "Show monthly revenue trend",
        "columns": COLUMNS["finance"],
        "data_sample": [
            {"month": "2026-01", "region": "East", "revenue": 1200, "orders": 40},
            {"month": "2026-02", "region": "East", "revenue": 1500, "orders": 45},
        ],
    },
    {
        "name": "region_bar",
        "expect": "ok",
        "query": "Compare revenue by region as a bar chart, highest first",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "region_pie",
        "expect": "ok",
        "query": "Pie chart of revenue share by region",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "top3_months",
        "expect": "ok",
        "query": "Show the top three months by revenue",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "filter_two_regions",
        "expect": "ok",
        "query": "Compare revenue for East and South regions only",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "avg_revenue_month",
        "expect": "ok",
        "query": "Average revenue per order by month, as a bar chart",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "scatter_revenue_orders",
        "expect": "ok",
        "query": "Scatter plot of revenue vs orders",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "area_monthly",
        "expect": "ok",
        "query": "Monthly revenue area chart",
        "columns": COLUMNS["finance"],
    },
    # ---- boundary: beyond MVP expression capability; expect an honest refusal ----
    {
        "name": "share_by_region_per_month",
        "expect": "refuse",
        "query": "Monthly percentage share trend of each region in total revenue",
        "columns": COLUMNS["finance"],
    },
    {
        "name": "mom_growth",
        "expect": "refuse",
        "query": "What is the month-over-month revenue growth?",
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
    # boundary cases: no spec but a clear clarification/validation error = correct behavior
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
            else ("(reasonable refusal)" if r["graceful_refuse"] else f"errors={r['errors']}")
        )
        print(f"[{mark}] {r['name']:<24} expect={r['expect']:<7} {detail}")

    print("\n===== summary =====")
    print(f"Expressible pass rate: {ok_pass}/{len(ok_cases)}")
    print(f"Boundary honest-refusal rate: {refuse_pass}/{len(refuse_cases)}")
    if ok_cases:
        print(f"Spec quality baseline (expressible): {ok_pass / len(ok_cases):.0%}")

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
    print(f"\nReport written to {out}")


if __name__ == "__main__":
    asyncio.run(main())
