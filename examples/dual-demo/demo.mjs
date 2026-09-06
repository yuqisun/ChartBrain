/**
 * ChartBrain 双库对比 demo（M5 渲染层验证）。
 *
 * 同一个问题：NL → chartbrain-server 出 spec
 *            → @chartbrain/sdk buildHighcharts + buildECharts（同一 spec，双库）
 *            → 一个 HTML 里 Highcharts 与 ECharts 并排渲染
 *
 * 前置：① sdk 已构建（cd ../../sdk && npm run build）
 *       ② chartbrain-server 在跑（DeepSeek provider）
 *       ③ 本目录依赖已装（npm i）
 * 运行：node demo.mjs ["你的问题"] → 打开 dual-chart.html
 */

import { writeFileSync } from "node:fs";

import { buildECharts, buildHighcharts } from "../../sdk/dist/index.js";
import { columns, rows } from "../highcharts-demo/data.mjs";

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
      library: "highcharts", // spec 与库无关：同一份给双库用
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
  const spec = body.chart_spec;

  console.log("✅ 中性 spec（server 返回）:");
  console.log(JSON.stringify(spec, null, 2));
  console.log();

  // 同一 spec → 双库 option（D13 确定性步骤全在 SDK）
  const hc = buildHighcharts(rows, spec);
  const ec = buildECharts(rows, spec);
  console.log("📊 Highcharts series:", hc.series.map((s) => s.name).join(" | "));
  console.log("📊 ECharts    series:", ec?.series?.map((s) => s?.name ?? s?.type).join(" | "));

  writeDualHtml(query, hc, ec);
  console.log("\n✅ 已生成 dual-chart.html —— 浏览器打开，Highcharts/ECharts 并排对比");
}

function writeDualHtml(query, hc, ec) {
  const hcJson = JSON.stringify(hc);
  const ecJson = JSON.stringify(ec);
  const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>ChartBrain 双库对比 — ${escapeHtml(query)}</title>
<script src="https://code.highcharts.com/highcharts.js"></script>
<script>if (!window.Highcharts) { document.write('<script src="./node_modules/highcharts/highcharts.js"><\\/script>'); }</script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<script>if (!window.echarts) { document.write('<script src="./node_modules/echarts/dist/echarts.min.js"><\\/script>'); }</script>
<style>
  body{font-family:system-ui;margin:24px}
  .row{display:flex;flex-wrap:wrap;gap:24px}
  .cell{flex:1 1 420px;min-width:380px}
  .chart{width:100%;height:480px}
</style>
</head>
<body>
<h2>${escapeHtml(query)}</h2>
<p><small>ChartBrain 双库 demo · 同一 spec → Highcharts / ECharts 各自渲染</small></p>
<div class="row">
  <div class="cell"><h3>Highcharts</h3><div id="hc" class="chart"></div></div>
  <div class="cell"><h3>ECharts（flint-js 编译）</h3><div id="ec" class="chart"></div></div>
</div>
<script>
  function fail(id, msg) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<p style="color:#c00">' + msg + '</p>';
  }
  if (!window.Highcharts) {
    fail('hc', 'Highcharts 未能加载（离线请先 npm i highcharts 并重新运行 demo.mjs）');
  } else {
    const opt = ${hcJson};
    opt.chart = { ...(opt.chart || {}), renderTo: 'hc' };
    opt.title = { text: opt.title?.text ?? '' };
    Highcharts.chart(opt);
  }
  if (!window.echarts) {
    fail('ec', 'ECharts 未能加载（离线请先 npm i echarts 并重新运行 demo.mjs）');
  } else {
    const ecChart = echarts.init(document.getElementById('ec'));
    const ecOpt = ${ecJson};
    ecChart.setOption(ecOpt);
  }
</script>
</body>
</html>`;
  writeFileSync(new URL("./dual-chart.html", import.meta.url), html, "utf-8");
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
