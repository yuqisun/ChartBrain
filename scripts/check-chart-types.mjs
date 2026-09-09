#!/usr/bin/env node
/**
 * 图型白名单一致性检查：schema / SDK / server 五处各自声明的 chart.type 集合必须一致。
 *
 * 五处白名单（新增图型时必须全部同步）：
 *   1. specs/chart-spec.schema.json            → chart.type enum
 *   2. sdk/src/types.ts                        → ChartType union 字面量
 *   3. sdk/src/converter/highcharts.ts         → FLINT_CHART_TYPE 的键
 *   4. sdk/src/converter/echarts.ts            → FLINT_CHART_TYPE 的键
 *   5. server/chartbrain_server/spec/prompt.py → 规则 1 的 chart.type must be one of 列表
 *
 * 用法：
 *   node scripts/check-chart-types.mjs   # 全部一致 → exit 0；任一不一致 → exit 1 并打印差异
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r/g, '');

const sources = [
  {
    name: 'specs/chart-spec.schema.json（chart.type enum）',
    file: 'specs/chart-spec.schema.json',
    parse: (txt) => JSON.parse(txt).properties.chart.properties.type.enum,
  },
  {
    name: 'sdk/src/types.ts（ChartType union）',
    file: 'sdk/src/types.ts',
    parse: (txt) => {
      const m = txt.match(/export type ChartType\s*=\s*([\s\S]*?);/);
      if (!m) throw new Error('找不到 ChartType union 声明');
      return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    },
  },
  {
    name: 'sdk/src/converter/highcharts.ts（FLINT_CHART_TYPE 键）',
    file: 'sdk/src/converter/highcharts.ts',
    parse: parseMapKeys,
  },
  {
    name: 'sdk/src/converter/echarts.ts（FLINT_CHART_TYPE 键）',
    file: 'sdk/src/converter/echarts.ts',
    parse: parseMapKeys,
  },
  {
    name: 'server/chartbrain_server/spec/prompt.py（规则 1 列表）',
    file: 'server/chartbrain_server/spec/prompt.py',
    parse: (txt) => {
      const m = txt.match(/chart\.type must be one of:\s*([^\n]+)/);
      if (!m) throw new Error('找不到 "chart.type must be one of:" 列表');
      return m[1]
        .split('|')
        .map((s) => s.trim().replace(/\.$/, ''))
        .filter(Boolean);
    },
  },
];

/** 取 FLINT_CHART_TYPE: Record<ChartType, string> = { ... }; 的对象键。 */
function parseMapKeys(txt) {
  const m = txt.match(/const FLINT_CHART_TYPE: Record<ChartType, string> = \{([\s\S]*?)\n\};/);
  if (!m) throw new Error('找不到 FLINT_CHART_TYPE 映射');
  return [...m[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((x) => x[1]);
}

/** 解析并打印每个来源的集合；解析失败按环境问题处理（exit 2）。 */
const parsed = [];
for (const s of sources) {
  try {
    const set = s.parse(read(s.file));
    parsed.push({ ...s, set });
    console.log(`[${parsed.length}/5] ${s.name}\n    → ${set.length} 种：${set.join(', ')}`);
  } catch (e) {
    console.error(`✗ ${s.name}\n    读取失败：${e.message}\n    文件：${s.file}`);
    process.exit(2);
  }
}

const [anchor, ...rest] = parsed;
const expect = [...anchor.set].sort();
const norm = (a) => a.join(',');
let bad = 0;
for (const s of rest) {
  const cur = [...s.set].sort();
  if (norm(cur) !== norm(expect)) {
    bad++;
    const missing = expect.filter((x) => !cur.includes(x));
    const extra = cur.filter((x) => !expect.includes(x));
    console.error(`✗ ${s.name}\n    缺 ${anchor.set.length} 种白名单中的：${missing.join(', ') || '（无）'}\n    多出：${extra.join(', ') || '（无）'}`);
  }
}

if (bad === 0) {
  console.log(`\n✅ 5 处白名单一致（${anchor.set.length} 种）`);
  process.exit(0);
}
console.error(`\n✗ 共 ${bad} 处与 ${anchor.file} 不一致，请同步后重跑`);
process.exit(1);
