/**
 * ChartBrain M4 端到端 demo（Highcharts 消费端）。
 *
 * 流程：本地数据 + 自然语言 → chartbrain-server(/v1/charts) 出 spec
 *       → @chartbrain/sdk 变换 + 转换 → Highcharts option → 生成 HTML 页面
 *
 * 前置：① sdk 已构建（cd ../../sdk && npm run build）
 *       ② chartbrain-server 在跑（cd ../../server && .\.venv\Scripts\uvicorn ...）
 * 运行：node demo.mjs ["你的问题"]
 *       → 打开生成的 chart-output.html 看图
 */

import { writeFileSync } from "node:fs";

import { buildHighcharts } from "../../sdk/dist/index.js";
import { columns, rows } from "./data.mjs";

const SERVER = process.env.CHARTBRAIN_SERVER ?? "http://127.0.0.1:8000";
const query = process.argv[2] ?? "各区域营收对比，按营收从高到低";

async function main() {
  console.log(`❓ 问题: ${query}`);
  console.log(`  数据集: ${rows.length} 行 x ${columns.length} 列\n`);

  const resp = await fetch(`${SERVER}/v1/charts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      library: "highcharts",
      columns,
      data_sample: rows.slice(0, 10),
    }),
  });
  const body = await resp.json();
  if (!resp.ok) {
    console.error(`❌ server ${resp.status}`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log("✅ 中性 spec（server 返回）:");
  console.log(JSON.stringify(body.chart_spec, null, 2));
  console.log();

  // D13：确定性步骤全在消费端 SDK 完成
  const option = buildHighcharts(rows, body.chart_spec);
  console.log("📊 Highcharts option 摘要:");
  for (const s of option.series) {
    console.log(`   - ${s.name}: ${Array.isArray(s.data) ? `${s.data.length} 个数据点` : ""}`);
  }

  writeHtml(query, option);
  console.log("\n✅ 已生成 chart-output.html —— 浏览器打开即可看到图表");
}

function writeHtml(query, option) {
  const json = JSON.stringify(option);
  const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>ChartBrain Demo — ${escapeHtml(query)}</title>
<script src="https://code.highcharts.com/highcharts.js"></script>
<style>body{font-family:system-ui;margin:24px} #container{max-width:900px}</style>
</head>
<body>
<h2>${escapeHtml(query)}</h2>
<p><small>ChartBrain 端到端 demo · spec → SDK 变换/转换 → Highcharts 渲染</small></p>
<div id="container"></div>
<script>
  const option = ${json};
  option.chart = { ...(option.chart || {}), renderTo: 'container' };
  option.title = { text: option.title?.text ?? '' };
  Highcharts.chart(option);
</script>
</body>
</html>`;
  writeFileSync(new URL("./chart-output.html", import.meta.url), html, "utf-8");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

main().catch((e) => {
  console.error("💥", e);
  process.exit(1);
});
