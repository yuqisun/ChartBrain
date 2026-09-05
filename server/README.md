# chartbrain-server

ChartBrain 服务端（Python / FastAPI）。按 D13，本服务**无状态**：只做

1. 接收消费端的自然语言 + 所用库声明 + 列 schema/样例；
2. 让 LLM 产出「轻量中性 chart spec + 声明式变换计划」；
3. L1/L2 校验后返回（**不产库配置**——变换/转换/绑定在消费端 SDK 完成）。

## 开发运行

```bash
cd server
python -m venv .venv
.\.venv\Scripts\pip install -e .[dev]
.\.venv\Scripts\uvicorn chartbrain_server.main:app --reload --port 8000
```

验证：

```bash
curl http://127.0.0.1:8000/health
curl -X POST http://127.0.0.1:8000/v1/charts \
  -H "Content-Type: application/json" \
  -d '{"query":"按月份看营收趋势","library":"highcharts","columns":[{"name":"month","type":"string"},{"name":"revenue","type":"number"}]}'
```

## 目录

```
chartbrain_server/
├── main.py            # FastAPI app（create_app）
├── config.py          # env 配置（LLM provider 选择、OpenAI 兼容参数）
├── models.py          # API 请求/响应 Pydantic 模型（对应 docs/design.md §6）
├── api/
│   └── routes.py      # GET /health · POST /v1/charts（M1 占位）
├── llm/               # LLM Provider 抽象（base/registry/mock/openai_compat）
└── spec/
    └── validator.py   # L1：加载 specs/chart-spec.schema.json 并校验
```

契约源：仓库根 `specs/chart-spec.schema.json`（服务端与未来 SDK 共用同一份）。
