# 贡献指南

欢迎贡献！请先阅读 [docs/design.md](docs/design.md)（单一事实来源，含 D1–D13 决策记录）再动手。

## 提 issue / PR

- 缺陷或问题先开 issue 描述清楚（复现步骤、期望/实际行为）；
- 提交 PR 前请跑通对应质量门禁（见下），CI 也会自动跑：
  - server：`.venv\Scripts\python.exe -m pytest -q`（Linux 上 `python -m pytest -q`）
  - sdk：`npm run typecheck && npm run build && npm test`

## 约定

- commit message 用前缀：`feat:` / `fix:` / `docs:` / `test:` / `chore:` / `refactor:`；
- 变更契约 `specs/chart-spec.schema.json` 时必须同步：
  1. server 的 L1 校验器（`server/chartbrain_server/spec/validator.py` 直接读该文件，通常无需改）；
  2. 需要时更新提示词规则（`server/chartbrain_server/spec/prompt.py`）与 L2 校验
     （`server/chartbrain_server/spec/l2.py`）；
  3. SDK 的 TS 类型（`sdk/src/types.ts`）与测试；
- 决策类变更（架构、技术选型）不改 D 编号记录本身，而是在 `docs/design.md` 追加新决策行
  （D14 起）或新章节说明理由；
- 环境变量/密钥：`.env` 不入库；新变量请同步 `server/.env.example`；
- demo 生成的 `*.html`（chart-output.html / dual-chart.html）与 `eval_report.json` 不入库。

## 目录速览

```
specs/        中性 chart spec 的 JSON Schema（契约源，server 与 SDK 共享）
server/       chartbrain-server：Python/FastAPI 无状态意图层（LLM → spec）
sdk/          @chartbrain/sdk：TS 确定性执行层（变换 + 转换 + 绑定）
examples/     Highcharts / ECharts（双库并排）消费端 demo
docs/         设计文档与决策记录
research/     竞品调研分报告（引用以 repo URL + commit 时间为准）
```

## 质量与安全红线

- LLM **永不产出代码/SQL/库配置**、不碰数值计算；执行与计算全部走确定性代码；
- 服务端默认**不接收/不存储全量业务数据**；权限在**执行期**强制；
- 修改校验/生成逻辑后请跑 `server/scripts/eval_spec_baseline.py`（需 DeepSeek key）确认
  spec 质量基线不回退。
