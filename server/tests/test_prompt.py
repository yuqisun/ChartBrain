"""守卫 prompt 里的白名单副本、选型说明与 few-shot 示例（L1 schema 为唯一来源）。

白名单散落多处，prompt.py 的副本（SYSTEM_PROMPT 规则 1 的图型列表 + 内嵌在
few-shot 里的 chart_spec）此前没有任何测试覆盖——漂移只会在真实 LLM 请求里以
「模型照着坏例子输出」的形式暴露。这里把两份副本都钉到
specs/chart-spec.schema.json 上：
1. few-shot 的每个 chart_spec 必须通过现有 L1 校验（validate_spec）；
2. SYSTEM_PROMPT 规则 1 的图型集合必须与 schema enum 集合相等。

图型选型说明由 specs/chart-types.json（图型目录单一事实源）在 import 时渲染进
SYSTEM_PROMPT，因此同样需要守卫：目录里每个图型必须有选型行、每个 selection_policy
条目必须出现在 prompt 里、每个图型的必需通道必须出现——否则新增图型后模型会拿到
一份「白名单里有、但没说什么时候用」的 prompt。

除了「有没有」，这里还钉住两件容易被漏掉的事：
- **顺序**：规则 1 的 token 顺序与选型段的行序都逐位等于目录 types[] 顺序（此前只比集合，
  重排目录会静默重排 prompt）；
- **series / pie 语义**：series 是 groupedBar/stackedBar/slope/connectedScatter 的意图载体
  （缺了会静默退化成单系列），pie/donut 的 x/y 是「分类→扇区 / 度量→大小」而不是柱状图的轴。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from chartbrain_server.models import ChartRequest
from chartbrain_server.spec import prompt as prompt_module
from chartbrain_server.spec.prompt import (
    SYSTEM_PROMPT,
    _PLACEHOLDERS,
    _assert_placeholders_replaced,
    build_user_prompt,
)
from chartbrain_server.spec.validator import load_schema, validate_spec

# 目录路径独立于 prompt.py 的加载器：测试必须钉住仓库里的真文件，而不是被测代码的解析结果
_CATALOG_PATH = Path(__file__).resolve().parents[2] / "specs" / "chart-types.json"


def _catalog() -> dict:
    """specs/chart-types.json（图型目录，单一事实源）。"""
    return json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))


def _catalog_types() -> list[dict]:
    return _catalog()["types"]


def _schema_enum() -> list[str]:
    """chart.type 白名单的唯一来源：specs/chart-spec.schema.json。"""
    return load_schema()["properties"]["chart"]["properties"]["type"]["enum"]


def _selection_section() -> str:
    """SYSTEM_PROMPT 的图型选型段（段首标题之后到 prompt 结尾）。"""
    m = re.search(r"^Chart type selection.*$", SYSTEM_PROMPT, re.MULTILINE)
    assert m, "SYSTEM_PROMPT 缺少图型选型段（标题 'Chart type selection'）"
    return SYSTEM_PROMPT[m.end() :]


def _prompt_selection_lines() -> dict[str, str]:
    """解析选型段里的「图型 — 选型说明」行，返回 {图型: 说明}。"""
    lines: dict[str, str] = {}
    for line in _selection_section().splitlines():
        m = re.match(r"^([A-Za-z][A-Za-z0-9]*) — (.+?)\s*$", line)
        if m:
            lines[m.group(1)] = m.group(2)
    return lines


def _channel_groups() -> dict[tuple[str, ...], list[str]]:
    """按必需通道分组（与 prompt 渲染顺序一致：目录顺序）。"""
    groups: dict[tuple[str, ...], list[str]] = {}
    for t in _catalog_types():
        groups.setdefault(tuple(t["required_channels"]), []).append(t["type"])
    return groups


def _prompt_whitelist_order() -> list[str]:
    """从 SYSTEM_PROMPT 规则 1 抽出图型 token，**按渲染顺序**（one of: … 到规则 2 之间）。"""
    m = re.search(r"chart\.type must be one of:(.*?)2\.", SYSTEM_PROMPT, re.DOTALL)
    assert m, "SYSTEM_PROMPT 规则 1 的白名单段缺失或改版"
    return [tok.rstrip(".") for tok in re.split(r"\s*\|\s*", m.group(1).strip()) if tok]


def _prompt_whitelist() -> set[str]:
    """规则 1 的图型集合（顺序由 _prompt_whitelist_order 另行钉住）。"""
    return set(_prompt_whitelist_order())


def _policy_bullets_with(*needles: str) -> list[str]:
    """selection_policy 里同时含全部 needles 的条目（用于按内容定位某条策略，而非按下标）。"""
    return [b for b in _catalog()["selection_policy"] if all(n in b for n in needles)]


def _policy_bullet_with(*needles: str) -> str:
    hits = _policy_bullets_with(*needles)
    assert len(hits) == 1, f"预期恰好一条策略条目同时包含 {needles}，实际 {len(hits)} 条：{hits}"
    return hits[0]


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
    whitelist = _prompt_whitelist()
    assert whitelist == set(_schema_enum())
    # 目录是单一事实源：规则 1 的列表也必须等于目录类型集合（prompt.py 由此渲染）
    assert whitelist == {t["type"] for t in _catalog_types()}, "规则 1 与 chart-types.json 漂移"


def test_prompt_rule1_token_order_follows_catalog_order() -> None:
    """规则 1 的 token 顺序必须逐位等于目录 types[].type 顺序。

    上一个测试只比较集合，因此「渲染顺序」这个属性此前无人看守：把 _chart_type_names() 改成
    sorted()、或在模板里手写一份顺序不同的列表，集合断言照样全绿，而模型看到的枚举顺序已经变了。
    这里钉住的是「渲染顺序 == 文件顺序」；注意它**不**冻结目录的历史顺序（重排目录本身会同时
    改变两侧、断言依旧通过）——真要冻结得手抄一份顺序副本，与目录单一事实源的设计相悖，故不取。
    """
    catalog_order = [t["type"] for t in _catalog_types()]
    rendered = _prompt_whitelist_order()
    assert rendered == catalog_order, (
        f"规则 1 的 token 顺序 {rendered} 与目录 types[].type 顺序 {catalog_order} 不一致"
    )


def test_prompt_selection_lines_order_follows_catalog_order() -> None:
    """选型段的「图型 — 说明」行也必须按目录顺序出现（逐图型提示的行序同样由目录决定）。"""
    catalog_order = [t["type"] for t in _catalog_types()]
    rendered = list(_prompt_selection_lines())
    assert rendered == catalog_order, (
        f"选型段行序 {rendered} 与目录 types[].type 顺序 {catalog_order} 不一致"
    )


def test_prompt_selection_lines_cover_every_catalog_type() -> None:
    """目录里每个图型都必须在选型段里有一行，否则模型只看到白名单、看不到何时用。"""
    assert set(_prompt_selection_lines()) == {t["type"] for t in _catalog_types()}


def test_prompt_selection_lines_match_catalog_hints() -> None:
    """选型行的说明必须逐字来自目录（prompt.py 渲染，不得手改）。"""
    lines = _prompt_selection_lines()
    for t in _catalog_types():
        assert lines.get(t["type"]) == t["selection"], f"{t['type']} 的选型说明与目录不一致"


def test_prompt_includes_every_selection_policy_bullet() -> None:
    for bullet in _catalog()["selection_policy"]:
        assert f"- {bullet}" in SYSTEM_PROMPT, f"SYSTEM_PROMPT 缺选型策略条目：{bullet}"


def _channel_error_policy() -> str:
    """目录里「必需通道填不出来就不要选它」那条策略。

    按内容取而不是取 selection_policy[-1]：以前按下标取，等于把「error 策略必须排在最后」
    这个无关约束焊进断言——新增一条策略就会把它挪走，测试却以「缺 error 策略」的假象失败。
    """
    return _policy_bullet_with("必需通道", "error")


_SERIES_BEARING = ("groupedBar", "stackedBar", "slope", "connectedScatter")


def test_prompt_documents_series_semantics() -> None:
    """series 才是 groupedBar/stackedBar/slope/connectedScatter 的意图载体，prompt 必须说清。

    没有这条说明时，`{"chart":{"type":"groupedBar"},"encodings":{x,y}}`（无 series）会一路
    通过 L1 + 通道校验编成单系列柱状图——「并排比较各分组」静默丢失，且不抛错、无 warning。
    """
    bullet = _policy_bullet_with("series")
    for name in _SERIES_BEARING:
        assert name in bullet, f"series 语义条目没点名 {name}"
    # 诚实兜底：没有分组列时降级为 bar/line，且不该为此输出 error
    for fallback in ("bar", "line"):
        assert fallback in bullet, f"series 语义条目缺兜底图型 {fallback}"
    assert "降级" in bullet, "series 语义条目必须说明这是降级选择"
    assert "error" in bullet, "series 语义条目必须交代「缺 series 不输出 error」"
    # 兜底不得压过硬规则 6：请求点名了不存在的字段时仍要输出 error（否则两条规则打架）
    assert "规则 6" in bullet, "series 语义条目必须交代与硬规则 6（缺字段 → error）的分界"
    # 与 schema 保持一致：series 不是必需通道（schema 的 encodings 不强制任何通道）
    encodings = load_schema()["properties"]["encodings"]
    assert "series" in encodings["properties"], "schema 缺 series 通道，prompt 说明需同步"
    assert "series" not in encodings.get("required", []), (
        "series 若被 schema 强制为必需通道，prompt 的「可选」说明就过时了"
    )


def test_prompt_documents_pie_donut_channel_binding() -> None:
    """pie/donut 的通道含义不是柱状图的 x 轴/y 轴：x=分类（→ 扇区）、y=度量（→ 扇区大小）。"""
    bullet = _policy_bullet_with("pie", "donut", "扇区")
    for name in ("pie", "donut"):
        assert name in bullet, f"pie/donut 通道语义条目没点名 {name}"
    for token in ("分类", "扇区", "度量", "大小"):
        assert token in bullet, f"pie/donut 通道语义条目缺「{token}」"
    assert "位置" in bullet, "必须提醒不要按位置把 x/y 读成柱状图的轴"
    # 占比是图表按 y 的取值换算的，不是 LLM 输出的变换步骤（硬规则 5 不支持占比运算）
    assert "占比" in bullet, "pie/donut 条目必须说明占比由图表换算、无需写占比变换"


def test_prompt_keeps_required_channel_guarantee() -> None:
    """「必需通道填不出来就不要选它」的保证必须留在 prompt 里（目录策略 + 逐图型通道）。"""
    section = _selection_section()
    assert _channel_error_policy() in SYSTEM_PROMPT, "缺「通道填不出来就输出 error」策略"
    assert "must NOT be chosen" in section, "缺「通道缺失不得选该图型」的英文保证"
    for channels, types in _channel_groups().items():
        expected = f"{' + '.join(channels)}: {', '.join(types)}."
        assert expected in section, f"选型段缺必需通道行：{expected}"


def test_placeholder_rail_raises_when_a_placeholder_survives() -> None:
    """模板缺了/改了占位符时必须 fail-fast：.replace() 对不存在的 token 是静默 no-op，
    否则会把字面 __CHART_TYPES__ 的坏 prompt 直接发给模型且日志里看不出异常。"""
    with pytest.raises(RuntimeError) as excinfo:
        _assert_placeholders_replaced("1. chart.type must be one of: __CHART_TYPES__.")
    message = str(excinfo.value)
    assert "__CHART_TYPES__" in message, f"报错没点名残留占位符：{message}"
    assert "__SELECTION_GUIDANCE__" not in message, f"报错点名了未残留的占位符：{message}"


def test_placeholder_rail_raises_naming_every_survivor() -> None:
    with pytest.raises(RuntimeError) as excinfo:
        _assert_placeholders_replaced("__CHART_TYPES__ 和 __SELECTION_GUIDANCE__ 都还在")
    assert str(excinfo.value) == (
        f"SYSTEM_PROMPT 模板占位符未被替换：{list(_PLACEHOLDERS)}"
    ), "残留占位符必须全部点名（顺序与 _PLACEHOLDERS 一致）"


def test_placeholder_rail_also_catches_a_renamed_template_token() -> None:
    """模板里的 token 被改名时 .replace 同样静默 no-op，残留的 __…__ 也必须被点名。"""
    with pytest.raises(RuntimeError) as excinfo:
        _assert_placeholders_replaced("1. chart.type must be one of: __CHART_TYPEZ__.")
    assert "__CHART_TYPEZ__" in str(excinfo.value), f"报错没点名残留 token：{excinfo.value}"


def test_placeholder_rail_passes_for_the_real_prompt() -> None:
    assert not [token for token in _PLACEHOLDERS if token in SYSTEM_PROMPT]
    _assert_placeholders_replaced(SYSTEM_PROMPT)  # 不抛即通过


def test_placeholder_tuple_matches_replace_chain() -> None:
    """_PLACEHOLDERS 必须与模块体里链式 .replace 的 token 一致，否则断言自身会漂移。"""
    source = Path(prompt_module.__file__).read_text(encoding="utf-8")
    chain_tokens = re.findall(r'\.replace\(\s*"(__[A-Z_]+__)"', source)
    assert set(chain_tokens) == set(_PLACEHOLDERS), (
        f"链上 token {chain_tokens} 与 _PLACEHOLDERS {list(_PLACEHOLDERS)} 不一致"
    )


def test_every_few_shot_chart_spec_passes_l1() -> None:
    specs = _few_shot_chart_specs()
    assert len(specs) >= 1, "few-shot 列表为空"
    for spec in specs:
        errors = validate_spec(spec)
        assert errors == [], f"few-shot chart_spec 未过 L1: {spec.get('chart')} → {errors}"
