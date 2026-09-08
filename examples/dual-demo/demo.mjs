/**
 * ChartBrain dual-chart demo (M5 render-layer validation).
 *
 * One question: NL → chartbrain-server → neutral spec
 *            → @chartbrain/sdk buildHighcharts + buildECharts (same spec, two libs)
 *            → one HTML rendering Highcharts and ECharts side by side
 *
 * Prereq: ① sdk built (cd ../../sdk && npm run build)
 *         ② chartbrain-server running (DeepSeek provider)
 *         ③ this dir deps installed (npm i)
 * Run: node demo.mjs ["your question"] → open dual-chart.html
 */

import { writeFileSync } from "node:fs";

import { buildECharts, buildHighcharts } from "../../sdk/dist/index.js";
import { columns, rows } from "../highcharts-demo/data.mjs";

const SERVER = process.env.CHARTBRAIN_SERVER ?? "http://127.0.0.1:8000";
const query = process.argv[2] ?? "Revenue by region, highest first";

async function main() {
  console.log(`❓ Question: ${query}`);
  console.log(`   Dataset: ${rows.length} rows x ${columns.length} columns\n`);

  const resp = await fetch(`${SERVER}/v1/charts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      library: "highcharts", // spec is library-agnostic: the same one feeds both libraries
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

  console.log("✅ Neutral spec (from server):");
  console.log(JSON.stringify(spec, null, 2));
  console.log();

  // same spec → options for both libraries (D13: deterministic steps live in the SDK)
  const hc = buildHighcharts(rows, spec);
  const ec = buildECharts(rows, spec);
  console.log("📊 Highcharts series:", hc.series.map((s) => s.name).join(" | "));
  console.log("📊 ECharts    series:", ec?.series?.map((s) => s?.name ?? s?.type).join(" | "));

  writeDualHtml(query, hc, ec);
  console.log("\n✅ Generated dual-chart.html — open it to compare Highcharts vs ECharts");
}

function writeDualHtml(query, hc, ec) {
  const hcJson = JSON.stringify(hc);
  const ecJson = JSON.stringify(ec);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ChartBrain dual-chart — ${escapeHtml(query)}</title>
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
<p><small>ChartBrain dual-chart demo · same spec → rendered by Highcharts and ECharts</small></p>
<div class="row">
  <div class="cell"><h3>Highcharts</h3><div id="hc" class="chart"></div></div>
  <div class="cell"><h3>ECharts (compiled via flint-js)</h3><div id="ec" class="chart"></div></div>
</div>
<script>
  function fail(id, msg) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<p style="color:#c00">' + msg + '</p>';
  }
  if (!window.Highcharts) {
    fail('hc', 'Highcharts failed to load (offline: run `npm i highcharts` and re-run demo.mjs)');
  } else {
    const opt = ${hcJson};
    opt.chart = { ...(opt.chart || {}), renderTo: 'hc' };
    opt.title = { text: opt.title?.text ?? '' };
    Highcharts.chart(opt);
  }
  if (!window.echarts) {
    fail('ec', 'ECharts failed to load (offline: run `npm i echarts` and re-run demo.mjs)');
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
