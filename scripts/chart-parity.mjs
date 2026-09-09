#!/usr/bin/env node
/**
 * 双端一致性检查：同一份 Flint 输入分别交给 Highcharts 后端与 ECharts 后端，
 * 断言 图型 / series 数 / 点数 / 逐 series y 值 一致。
 *
 * 用法：
 *   node scripts/chart-parity.mjs                    # 用 vendor 的 dist
 *   node scripts/chart-parity.mjs --dist <dir>       # 用任意构建产物目录（须含 *\/index.cjs）
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const i = process.argv.indexOf('--dist');
const DIST = i > -1
  ? path.resolve(process.argv[i + 1])
  : path.join(root, 'vendor/flint-chart/packages/flint-js/dist');

for (const f of ['highcharts/index.cjs', 'echarts/index.cjs']) {
  if (!existsSync(path.join(DIST, f))) {
    console.error(`✗ 找不到 ${path.join(DIST, f)}\n  先在 vendor 目录执行 npm run build`);
    process.exit(2);
  }
}
const { assembleHighcharts } = require(path.join(DIST, 'highcharts/index.cjs'));
const { assembleECharts } = require(path.join(DIST, 'echarts/index.cjs'));

const CAT = [
  { month: '2026-01', period: 'before', region: 'East', revenue: 120 },
  { month: '2026-02', period: 'before', region: 'East', revenue: 150 },
  { month: '2026-01', period: 'after', region: 'West', revenue: 90 },
  { month: '2026-02', period: 'after', region: 'West', revenue: 110 },
];
const SCAT = [
  { weight: 1.6, mpg: 32, origin: 'JP' },
  { weight: 2.1, mpg: 27, origin: 'US' },
  { weight: 1.9, mpg: 29, origin: 'EU' },
];
const CAT_BASE = {
  data: { values: CAT },
  semantic_types: { month: 'YearMonth', period: 'Category', region: 'Country', revenue: 'Price' },
};
const SCAT_BASE = {
  data: { values: SCAT },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
};
const inp = (chartType, encodings, base = CAT_BASE) => ({
  ...base,
  chart_spec: { chartType, encodings },
});

const CASES = [
  { label: 'Bar Chart', input: inp('Bar Chart', { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'column', ec: 'bar' },
  { label: 'Line Chart', input: inp('Line Chart', { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'line', ec: 'line' },
  { label: 'Area Chart', input: inp('Area Chart', { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'area', ec: 'line' },
  { label: 'Scatter Plot', input: inp('Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } }, SCAT_BASE), hc: 'scatter', ec: 'scatter' },
  { label: 'Pie Chart', input: inp('Pie Chart', { color: { field: 'region' }, size: { field: 'revenue' } }), hc: 'pie', ec: 'pie' },
  // B1 新增
  { label: 'Grouped Bar Chart', input: inp('Grouped Bar Chart', { x: { field: 'month' }, y: { field: 'revenue' }, group: { field: 'region' } }), hc: 'column', ec: 'bar' },
  { label: 'Stacked Bar Chart', input: inp('Stacked Bar Chart', { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'column', ec: 'bar' },
  { label: 'Donut Chart', input: inp('Donut Chart', { color: { field: 'region' }, size: { field: 'revenue' } }), hc: 'pie', ec: 'pie' },
  { label: 'Slope Chart', input: inp('Slope Chart', { x: { field: 'period' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'line', ec: 'line' },
  { label: 'Connected Scatter Plot', input: inp('Connected Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } }, SCAT_BASE), hc: 'line', ec: 'line' },
  { label: 'Strip Plot', input: inp('Strip Plot', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'scatter', ec: 'scatter' },
];

const pointsOf = (o) => (o.series ?? []).reduce((n, s) => n + (Array.isArray(s.data) ? s.data.length : 0), 0);
const yOf = (d) => (Array.isArray(d) ? d[1] : (d && typeof d === 'object' ? (d.y ?? d.value) : d));
const isPie = (t) => /Pie|Donut/i.test(t);
const norm = (o, pie) => (o.series ?? []).map((s) =>
  (s.data ?? []).map((d) => (pie ? [d?.name, d?.y ?? d?.value] : yOf(d))));

let pass = 0;
const fails = [];
for (const c of CASES) {
  try {
    const hc = assembleHighcharts(c.input);
    const ec = assembleECharts(c.input);
    const pie = isPie(c.label);
    if (hc.chart?.type !== c.hc) throw new Error(`HC 图型 ${hc.chart?.type} ≠ ${c.hc}`);
    const ecType = (ec.series ?? [])[0]?.type;
    if (ecType !== c.ec) throw new Error(`EC 图型 ${ecType} ≠ ${c.ec}`);
    if ((hc.series ?? []).length !== (ec.series ?? []).length) {
      throw new Error(`series 数 ${(hc.series ?? []).length} ≠ ${(ec.series ?? []).length}`);
    }
    if (pointsOf(hc) !== pointsOf(ec)) throw new Error(`点数 ${pointsOf(hc)} ≠ ${pointsOf(ec)}`);
    const a = JSON.stringify(norm(hc, pie));
    const b = JSON.stringify(norm(ec, pie));
    if (a !== b) throw new Error(`逐点值不一致\n    HC ${a}\n    EC ${b}`);
    console.log(`  ✓ ${c.label}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${c.label}\n      ${e.message}`);
    fails.push(c.label);
  }
}
console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
