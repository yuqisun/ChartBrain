/**
 * ChartBrain M4 end-to-end demo (Highcharts consumer).
 *
 * Flow: local data + natural language → chartbrain-server (/v1/charts) → neutral spec
 *       → @chartbrain/sdk transform + convert → Highcharts option → HTML page
 *
 * Prereq: ① sdk built (cd ../../sdk && npm run build)
 *         ② chartbrain-server running (cd ../../server && .\.venv\Scripts\uvicorn ...)
 * Run: node demo.mjs ["your question"]  → open the generated chart-output.html
 */

import { writeFileSync } from "node:fs";

import { buildHighcharts } from "../../sdk/dist/index.js";
import { columns, rows } from "./data.mjs";

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

  console.log("✅ Neutral spec (from server):");
  console.log(JSON.stringify(body.chart_spec, null, 2));
  console.log();

  // D13: every deterministic step runs locally in the consumer SDK
  const option = buildHighcharts(rows, body.chart_spec);
  console.log("📊 Highcharts option summary:");
  for (const s of option.series) {
    console.log(`   - ${s.name}: ${Array.isArray(s.data) ? `${s.data.length} data points` : ""}`);
  }

  writeHtml(query, option);
  console.log("\n✅ Generated chart-output.html — open it in your browser");
}

function writeHtml(query, option) {
  const json = JSON.stringify(option);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ChartBrain Demo — ${escapeHtml(query)}</title>
<script src="https://cdn.jsdelivr.net/npm/highcharts@12/highcharts.js"></script>
<script>if (!window.Highcharts) { document.write('<script src="https://registry.npmmirror.com/highcharts/12.6.0/files/highcharts.js"><\\/script>'); }</script>
<script>if (!window.Highcharts) { document.write('<script src="./node_modules/highcharts/highcharts.js"><\\/script>'); }</script>
<style>body{font-family:system-ui;margin:24px} #container{max-width:900px;min-height:480px}</style>
</head>
<body>
<h2>${escapeHtml(query)}</h2>
<p><small>ChartBrain end-to-end demo · spec → SDK transform/convert → Highcharts render</small></p>
<div id="container"><p>Loading…</p></div>
<script>
  if (!window.Highcharts) {
    document.getElementById('container').innerHTML =
      '<p>❌ Highcharts failed to load (CDN unreachable and not installed locally).<br/>Run <code>npm i highcharts</code> and re-run <code>node demo.mjs</code>.</p>';
  } else {
    const option = ${json};
    option.chart = { ...(option.chart || {}), renderTo: 'container' };
    // keep the layout-derived title style instead of replacing the object
    option.title = { ...(option.title || {}), text: option.title?.text ?? '' };
    Highcharts.chart(option);
  }
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
