/**
 * Offline dual-library comparison (P4 acceptance).
 *
 * No server / LLM needed: a hand-written neutral spec per chart type is fed to
 * both `buildHighcharts` (vendored Flint Highcharts backend) and `buildECharts`
 * (upstream Flint ECharts backend), and both outputs are rendered side by side
 * in one HTML page.
 *
 * Prereq: ① vendored flint-js built (cd ../../vendor/flint-chart/packages/flint-js && npm install && npm run build)
 *         ② sdk built (cd ../../sdk && npm install && npm run build)
 * Run:    node offline.mjs  → open dual-offline.html
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { buildECharts, buildHighcharts } from "../../sdk/dist/index.js";
import { rows } from "../highcharts-demo/data.mjs";

const SERIES = { field: "region" };

const CASES = [
  {
    label: "Bar — monthly revenue by region",
    spec: {
      schema_version: 1,
      chart: { type: "bar", title: "Monthly revenue by region" },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Line — monthly revenue by region",
    spec: {
      schema_version: 1,
      chart: { type: "line", title: "Monthly revenue by region" },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Area — monthly revenue by region",
    spec: {
      schema_version: 1,
      chart: { type: "area", title: "Monthly revenue by region" },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Scatter — orders vs revenue",
    spec: {
      schema_version: 1,
      chart: { type: "scatter", title: "Orders vs revenue" },
      encodings: {
        x: { field: "orders", value_type: "numeric" },
        y: { field: "revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Pie — revenue share by region",
    spec: {
      schema_version: 1,
      chart: { type: "pie", title: "Revenue share by region" },
      transform_plan: {
        steps: [
          {
            op: "aggregate",
            group_by: ["region"],
            measures: [{ field: "revenue", agg: "sum", as: "region_revenue" }],
          },
        ],
      },
      encodings: {
        x: { field: "region", value_type: "categorical" },
        y: { field: "region_revenue", value_type: "numeric" },
      },
    },
  },
  {
    label: "Grouped Bar — monthly revenue by region (side by side)",
    spec: {
      schema_version: 1,
      chart: { type: "groupedBar", title: "Monthly revenue by region" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["month", "region"],
          measures: [{ field: "revenue", agg: "sum", as: "monthly_revenue" }],
        }],
      },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "monthly_revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Stacked Bar — monthly revenue composition",
    spec: {
      schema_version: 1,
      chart: { type: "stackedBar", title: "Revenue composition by region" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["month", "region"],
          measures: [{ field: "revenue", agg: "sum", as: "monthly_revenue" }],
        }],
      },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "monthly_revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Donut — revenue share by region",
    spec: {
      schema_version: 1,
      chart: { type: "donut", title: "Revenue share by region" },
      transform_plan: {
        steps: [{
          op: "aggregate",
          group_by: ["region"],
          measures: [{ field: "revenue", agg: "sum", as: "region_revenue" }],
        }],
      },
      encodings: {
        x: { field: "region", value_type: "categorical" },
        y: { field: "region_revenue", value_type: "numeric" },
      },
    },
  },
  {
    label: "Slope — revenue shift Jul 2025 → Jun 2026",
    spec: {
      schema_version: 1,
      chart: { type: "slope", title: "Revenue shift by region (Jul 2025 → Jun 2026)" },
      transform_plan: {
        steps: [
          { op: "filter", field: "month", operator: "in", values: ["2025-07", "2026-06"] },
          {
            op: "aggregate",
            group_by: ["month", "region"],
            measures: [{ field: "revenue", agg: "sum", as: "monthly_revenue" }],
          },
        ],
      },
      encodings: {
        x: { field: "month", value_type: "temporal" },
        y: { field: "monthly_revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Connected Scatter — orders vs revenue path",
    spec: {
      schema_version: 1,
      chart: { type: "connectedScatter", title: "Orders vs revenue path" },
      encodings: {
        x: { field: "orders", value_type: "numeric" },
        y: { field: "revenue", value_type: "numeric" },
        series: SERIES,
      },
    },
  },
  {
    label: "Strip — revenue spread by region",
    spec: {
      schema_version: 1,
      chart: { type: "strip", title: "Revenue spread by region" },
      encodings: {
        x: { field: "region", value_type: "categorical" },
        y: { field: "revenue", value_type: "numeric" },
      },
    },
  },
];

const pad = (s, n) => String(s).padEnd(n);
const axisOf = (opt) => {
  const x = Array.isArray(opt.xAxis) ? opt.xAxis[0] : opt.xAxis;
  return x?.type ?? "-";
};
const pointsOf = (opt) =>
  (opt.series ?? []).reduce((n, s) => n + (Array.isArray(s.data) ? s.data.length : 0), 0);

console.log(`Dataset: ${rows.length} rows\n`);
console.log(
  pad("case", 42) + pad("HC type", 9) + pad("HC series", 11) + pad("HC pts", 8) +
  pad("EC type", 9) + pad("EC series", 11) + pad("EC pts", 8) + "axis (HC/EC)",
);

const rendered = [];
for (const { label, spec } of CASES) {
  const hc = buildHighcharts(rows, spec);
  const ec = buildECharts(rows, spec);
  const hcSeries = (hc.series ?? []).length;
  const ecSeries = (ec.series ?? []).length;
  console.log(
    pad(label, 42) +
    pad(hc.chart?.type, 9) + pad(hcSeries, 11) + pad(pointsOf(hc), 8) +
    pad((ec.series ?? [])[0]?.type, 9) + pad(ecSeries, 11) + pad(pointsOf(ec), 8) +
    `${axisOf(hc)}/${axisOf(ec)}`,
  );
  if (hcSeries !== ecSeries) {
    console.log(`  ⚠ series count differs for "${label}"`);
  }
  rendered.push({ label, hc, ec });
}

/**
 * Prefer a locally installed library (inlined → the page works offline);
 * fall back to a CDN chain when this demo's node_modules is missing.
 */
function libTag(localPath, globalName, urls) {
  if (existsSync(localPath)) {
    const code = readFileSync(localPath, "utf8").replace(/<\/script/gi, "<\\/script");
    return `<script>${code}</script>`;
  }
  const tags = [`<script src="${urls[0]}"></script>`];
  for (const url of urls.slice(1)) {
    tags.push(`<script>if (!window.${globalName}) { document.write('<script src="${url}"><\\/script>'); }</script>`);
  }
  return tags.join("\n");
}

const highchartsTag = libTag(
  new URL("./node_modules/highcharts/highcharts.js", import.meta.url),
  "Highcharts",
  [
    "https://cdn.jsdelivr.net/npm/highcharts@12/highcharts.js",
    "https://unpkg.com/highcharts@12/highcharts.js",
    "https://registry.npmmirror.com/highcharts/12.6.0/files/highcharts.js",
  ],
);

const echartsTag = libTag(
  new URL("./node_modules/echarts/dist/echarts.min.js", import.meta.url),
  "echarts",
  [
    "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js",
    "https://unpkg.com/echarts@5/dist/echarts.min.js",
    "https://registry.npmmirror.com/echarts/5.6.0/files/dist/echarts.min.js",
  ],
);

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function writeHtml() {
  const rowsHtml = rendered
    .map(
      (r, i) => `  <h2>${i + 1}. ${escapeHtml(r.label)}</h2>
  <div class="row">
    <div class="cell"><h3>Highcharts (vendored Flint backend)</h3><div id="hc${i}" class="chart"></div></div>
    <div class="cell"><h3>ECharts (upstream Flint backend)</h3><div id="ec${i}" class="chart"></div></div>
  </div>`,
    )
    .join("\n");

  const scripts = rendered
    .map(
      (r, i) => `  // ${r.label}
  try { Highcharts.chart('hc${i}', ${JSON.stringify(r.hc)}); } catch (e) { fail('hc${i}', e.message); }
  try { echarts.init(document.getElementById('ec${i}')).setOption(${JSON.stringify(r.ec)}); } catch (e) { fail('ec${i}', e.message); }`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ChartBrain — Highcharts vs ECharts (same neutral spec)</title>
${highchartsTag}
${echartsTag}
<style>
  body{font-family:system-ui;margin:24px;color:#111}
  h2{font-size:15px;margin:28px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px}
  h3{font-size:12px;font-weight:600;color:#666;margin:0 0 6px}
  .row{display:flex;flex-wrap:wrap;gap:20px}
  .cell{flex:1 1 420px;min-width:360px}
  .chart{width:100%;height:380px}
  .note{color:#666;font-size:12px}
</style>
</head>
<body>
<h1 style="font-size:20px">Same neutral spec → two libraries</h1>
<p class="note">Left: Highcharts, compiled by the vendored flint-js Highcharts backend (added by this fork).
Right: ECharts, compiled by the upstream Flint ECharts backend. Both consume the identical ChartBrain neutral spec.</p>
${rowsHtml}
<script>
  function fail(id, msg) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<p style="color:#c00">' + msg + '</p>';
  }
${scripts}
</script>
</body>
</html>`;
  writeFileSync(new URL("./dual-offline.html", import.meta.url), html, "utf-8");
}

writeHtml();
console.log("\n✅ dual-offline.html written — open it to compare the two renderings");
