#!/usr/bin/env node
/**
 * 双端一致性检查：同一份 Flint 输入分别交给 Highcharts 后端与 ECharts 后端，
 * 断言 图型 / series 数 / 点数 / 逐 series y 值 一致。
 *
 * 用法：
 *   node scripts/chart-parity.mjs                    # 用 vendor 的 dist
 *   node scripts/chart-parity.mjs --dist <dir>       # 用任意构建产物目录（须含 *\/index.cjs 或 *\/index.js）
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const i = process.argv.indexOf('--dist');
if (i > -1 && (i + 1 >= process.argv.length || !process.argv[i + 1])) {
  console.error('✗ --dist 缺少目录参数\n  用法：node scripts/chart-parity.mjs [--dist <dir>]');
  process.exit(2);
}
const DIST = i > -1
  ? path.resolve(process.argv[i + 1])
  : path.join(root, 'vendor/flint-chart/packages/flint-js/dist');

// 每个后端依次尝试 index.cjs（esbuild 产物）与 index.js（tsc 产物），
// 取第一个存在的；两者都缺才报错退出 2。
const BACKENDS = ['highcharts', 'echarts'];
const entries = {};
for (const b of BACKENDS) {
  const cjs = path.join(DIST, `${b}/index.cjs`);
  const js = path.join(DIST, `${b}/index.js`);
  if (existsSync(cjs)) {
    entries[b] = cjs;
  } else if (existsSync(js)) {
    entries[b] = js;
  } else {
    console.error(`✗ 找不到 ${b} 后端产物：\n    ${cjs}\n    ${js}\n  先在 vendor 目录执行 npm run build，或用 tsc 构建后以 --dist 指定产物目录`);
    process.exit(2);
  }
}
const { assembleHighcharts } = require(entries.highcharts);
const { assembleECharts } = require(entries.echarts);

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
// Connected Scatter 保序夹具：origin 各 2 行、x 整体刻意非升序（3→1→2→4），
// 用于验证点序与输入行序一致（后端不得按 x 排序重排）。
const SCAT_ORD = [
  { weight: 3, mpg: 31, origin: 'JP' },
  { weight: 1, mpg: 25, origin: 'JP' },
  { weight: 2, mpg: 28, origin: 'US' },
  { weight: 4, mpg: 33, origin: 'US' },
];
const CAT_BASE = {
  data: { values: CAT },
  semantic_types: { month: 'YearMonth', period: 'Category', region: 'Country', revenue: 'Price' },
};
const SCAT_BASE = {
  data: { values: SCAT },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
};
const SCAT_ORD_BASE = {
  data: { values: SCAT_ORD },
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
  {
    label: 'Donut Chart',
    input: inp('Donut Chart', { color: { field: 'region' }, size: { field: 'revenue' } }),
    hc: 'pie', ec: 'pie',
    // 定义性差异：donut 必须有内孔（HC innerSize 定义且非 0），不能退化成实心饼（EC radius 首项 ≠ '0%'）
    check(hc, ec) {
      const inner = hc.series?.[0]?.innerSize;
      if (inner == null || inner === 0 || inner === '0' || inner === '0%') {
        throw new Error(`HC donut series[0].innerSize=${JSON.stringify(inner)}，期望定义内孔（如 '45%'）`);
      }
      const er = ec.series?.[0]?.radius;
      // 收紧：内径必须是正数。radius[0] 形如 '50%' / '96px'，去掉 '%'/'px'
      // 后缀后若 ≤ 0（0、'0%'、'0px'，乃至 '-5%'）都无内孔或非法，必须拒绝。
      const holeText = Array.isArray(er) && er.length > 0 ? String(er[0]).replace(/%$/, '').replace(/px$/, '') : null;
      const hole = holeText != null ? Number.parseFloat(holeText) : NaN;
      if (!Array.isArray(er) || er.length === 0 || !Number.isFinite(hole) || hole <= 0) {
        throw new Error(`EC donut series[0].radius=${JSON.stringify(er)}，期望形如 ['50%','…px'] 且首项（去 %/px 后缀后）为正数`);
      }
    },
  },
  {
    label: 'Slope Chart',
    input: inp('Slope Chart', { x: { field: 'period' }, y: { field: 'revenue' }, color: { field: 'region' } }),
    hc: 'line', ec: 'line',
    // 定义性差异：slope 的节点靠 marker 呈现，HC 每个 series 都必须开 marker
    check(hc) {
      const sers = hc.series ?? [];
      sers.forEach((s, i) => {
        const en = s.marker?.enabled;
        if (en !== true) {
          throw new Error(`series[${i}]（name=${JSON.stringify(s.name)}）marker.enabled=${JSON.stringify(en)}，应为 true`);
        }
      });
    },
  },
  {
    label: 'Connected Scatter Plot',
    input: inp('Connected Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } }, SCAT_ORD_BASE),
    hc: 'line', ec: 'line',
    // 保序语义：每个 series 点数 ≥ 2，且点序与输入行序一致（按 origin 分组、x 不被重排）
    check(hc) {
      const want = new Map();
      for (const r of SCAT_ORD) {
        if (!want.has(r.origin)) want.set(r.origin, []);
        want.get(r.origin).push(r.weight);
      }
      const sers = hc.series ?? [];
      if (!sers.length) throw new Error('HC 无 series');
      for (const s of sers) {
        const xs = (s.data ?? []).map((d) => (Array.isArray(d) ? d[0] : d?.x));
        const exp = want.get(s.name);
        if (exp === undefined) {
          throw new Error(`series name=${JSON.stringify(s.name)} 不在输入分组 ${JSON.stringify([...want.keys()])} 内`);
        }
        if (xs.length < 2) throw new Error(`series name=${JSON.stringify(s.name)} 点数 ${xs.length} < 2`);
        if (JSON.stringify(xs) !== JSON.stringify(exp)) {
          throw new Error(`series name=${JSON.stringify(s.name)} 点序 x=[${xs}] ≠ 输入行序 x=[${exp}]`);
        }
      }
    },
  },
  { label: 'Strip Plot', input: inp('Strip Plot', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'region' } }), hc: 'scatter', ec: 'scatter' },
];

if (CASES.length === 0) {
  console.error('✗ CASES 为空：没有任何可检查的用例，拒绝假绿');
  process.exit(1);
}

const pointsOf = (o) => (o.series ?? []).reduce((n, s) => n + (Array.isArray(s.data) ? s.data.length : 0), 0);
const yOf = (d) => (Array.isArray(d) ? d[1] : (d && typeof d === 'object' ? (d.y ?? d.value) : d));
const isPie = (t) => /Pie|Donut/i.test(t);
const norm = (o, pie) => (o.series ?? []).map((s) =>
  pie
    ? (s.data ?? []).map((d) => [d?.name, d?.y ?? d?.value])
    : { name: s.name, values: (s.data ?? []).map((d) => yOf(d)) });

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
    if (typeof c.check === 'function') c.check(hc, ec);
    console.log(`  ✓ ${c.label}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${c.label}\n      ${e.message}`);
    fails.push(c.label);
  }
}
console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
