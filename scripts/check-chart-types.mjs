#!/usr/bin/env node
/**
 * 图型一致性检查：图型目录 specs/chart-types.json 是单一事实源（single source of truth）。
 *
 * 白名单六处（新增图型时必须全部同步；第 1 处是基准，其余各处向它看齐）：
 *   1. specs/chart-types.json                   → types[].type
 *   2. specs/chart-spec.schema.json             → chart.type enum
 *   3. sdk/src/types.ts                         → ChartType union 字面量
 *   4. sdk/src/converter/highcharts.ts          → FLINT_CHART_TYPE 的键
 *   5. sdk/src/converter/echarts.ts             → FLINT_CHART_TYPE 的键
 *   6. server/chartbrain_server/spec/prompt.py  → 规则 1 的 chart.type must be one of 列表
 *
 * 目录字段与下游代码的一致性：
 *   7. types[].flint             == 两个转换器里的 Flint 名称
 *   8. types[].required_channels == sdk/src/converter/validate.ts 的 REQUIRED_CHANNELS
 *   9. types[].selection 非空、selection_policy 为非空数组
 *  10. 渲染后的 SYSTEM_PROMPT 含每个图型的选型行（白名单与选型段都由目录渲染）
 *
 * 注：prompt.py 在 import 时用目录渲染规则 1 与选型段，源码里只剩占位符，所以第 6/10 项
 * 校验的是「渲染后」的 SYSTEM_PROMPT：本脚本用 python 导入 prompt.py 并把文本落到临时
 * 文件再读回（受限环境下不能用 stdio 管道），可用 CHARTBRAIN_PYTHON 指定解释器。
 *
 * 用法：
 *   node scripts/check-chart-types.mjs
 *     exit 0：全部一致
 *     exit 1：目录与代码不一致（打印差异）
 *     exit 2：文件读取 / 解析 / prompt 渲染失败（环境问题）
 */
import { readFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r/g, '');

/** 取 FLINT_CHART_TYPE: Record<ChartType, string> = { ... }; 的键。 */
function parseMapKeys(txt) {
  const m = txt.match(/const FLINT_CHART_TYPE: Record<ChartType, string> = \{([\s\S]*?)\n\};/);
  if (!m) throw new Error('找不到 FLINT_CHART_TYPE 映射');
  return [...m[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((x) => x[1]);
}

/** 取 FLINT_CHART_TYPE 的 { 图型: Flint 名称 }。 */
function parseFlintMap(txt) {
  const m = txt.match(/const FLINT_CHART_TYPE: Record<ChartType, string> = \{([\s\S]*?)\n\};/);
  if (!m) throw new Error('找不到 FLINT_CHART_TYPE 映射');
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*"([^"]+)"/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

/** 取 validate.ts 的 REQUIRED_CHANNELS：{ 图型: ["x", "y"] }。 */
function parseRequiredChannels(txt) {
  const m = txt.match(/export const REQUIRED_CHANNELS[^{]*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error('找不到 REQUIRED_CHANNELS 表');
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*\[([^\]]*)\]/);
    if (kv) out[kv[1]] = [...kv[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return out;
}

/**
 * 渲染 prompt.py 的 SYSTEM_PROMPT（import 时由目录生成，源码里是占位符）。
 * 输出经临时文件传递，避免依赖 stdio 管道；失败按环境问题处理（exit 2）。
 */
function renderSystemPrompt() {
  const outFile = path.join(os.tmpdir(), `chartbrain-system-prompt-${process.pid}.txt`);
  const code = [
    'import os',
    'try:',
    '    from chartbrain_server.spec.prompt import SYSTEM_PROMPT as _prompt',
    'except Exception as _exc:',
    '    _prompt = "CHARTBRAIN_RENDER_ERROR: " + repr(_exc)',
    'with open(os.environ["CHARTBRAIN_PROMPT_OUT"], "w", encoding="utf-8") as _fh:',
    '    _fh.write(_prompt)',
  ].join('\n');
  const candidates = [process.env.CHARTBRAIN_PYTHON, 'python3', 'python', 'py'].filter(Boolean);
  const tried = [];
  for (const exe of candidates) {
    const r = spawnSync(exe, ['-c', code], {
      cwd: root,
      stdio: 'ignore',
      env: {
        ...process.env,
        PYTHONPATH: path.join(root, 'server'),
        CHARTBRAIN_PROMPT_OUT: outFile,
      },
    });
    if (r.error || r.status !== 0) {
      tried.push(`${exe}: ${r.error ? r.error.code : `exit ${r.status}`}`);
      continue;
    }
    let text = '';
    try {
      text = readFileSync(outFile, 'utf8');
    } catch {
      tried.push(`${exe}: 未写出临时文件`);
      continue;
    }
    try {
      unlinkSync(outFile);
    } catch {
      /* 临时文件清理失败不影响校验 */
    }
    if (text.startsWith('CHARTBRAIN_RENDER_ERROR: ')) {
      tried.push(`${exe}: ${text.trim()}`);
      continue;
    }
    return { text: text.replace(/\r/g, ''), exe };
  }
  console.error('✗ 无法渲染 SYSTEM_PROMPT（prompt.py 的规则 1 与选型段由 specs/chart-types.json 生成）');
  console.error(`    已尝试：${tried.join(' | ') || '（未找到 python 解释器）'}`);
  console.error('    可用 CHARTBRAIN_PYTHON=<解释器> 指定后重跑');
  process.exit(2);
}

let catalog;
try {
  catalog = JSON.parse(read('specs/chart-types.json'));
} catch (e) {
  console.error(`✗ specs/chart-types.json（图型目录）\n    读取失败：${e.message}\n    文件：specs/chart-types.json`);
  process.exit(2);
}
const catalogTypes = catalog.types.map((t) => t.type);
const rendered = renderSystemPrompt();
console.log(`· SYSTEM_PROMPT 渲染来源：${rendered.exe}（用于第 6/10 项校验）`);

const sources = [
  {
    name: 'specs/chart-types.json（types[].type，基准）',
    file: 'specs/chart-types.json',
    parse: () => catalogTypes,
  },
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
    name: 'server/chartbrain_server/spec/prompt.py（规则 1 列表，渲染后）',
    file: 'server/chartbrain_server/spec/prompt.py',
    parse: () => {
      const m = rendered.text.match(/chart\.type must be one of:\s*([^\n]+)/);
      if (!m) throw new Error('渲染后的 SYSTEM_PROMPT 找不到 "chart.type must be one of:" 列表');
      return m[1]
        .split('|')
        .map((s) => s.trim().replace(/\.$/, ''))
        .filter(Boolean);
    },
  },
];

/** 解析并打印每个来源的集合；解析失败按环境问题处理（exit 2）。 */
const parsed = [];
for (const s of sources) {
  try {
    const set = s.parse(read(s.file));
    parsed.push({ ...s, set });
    console.log(`[${parsed.length}/${sources.length}] ${s.name}\n    → ${set.length} 种：${set.join(', ')}`);
  } catch (e) {
    console.error(`✗ ${s.name}\n    读取失败：${e.message}\n    文件：${s.file}`);
    process.exit(2);
  }
}

const [anchor, ...rest] = parsed;
const expect = [...anchor.set].sort();
const norm = (a) => a.join(',');
let bad = 0;
const fail = (msg) => {
  bad++;
  console.error(`✗ ${msg}`);
};
/** 跑一段目录字段校验；无失败则打印 ✓ 行（保持既有输出风格）。 */
const check = (label, fn) => {
  const before = bad;
  fn();
  if (bad === before) console.log(`✓ ${label}`);
};

for (const s of rest) {
  const cur = [...s.set].sort();
  if (norm(cur) !== norm(expect)) {
    bad++;
    const missing = expect.filter((x) => !cur.includes(x));
    const extra = cur.filter((x) => !expect.includes(x));
    console.error(`✗ ${s.name}\n    缺 ${anchor.set.length} 种白名单中的：${missing.join(', ') || '（无）'}\n    多出：${extra.join(', ') || '（无）'}`);
  }
}
if (bad === 0) console.log(`✓ ${sources.length} 处白名单集合一致（${anchor.set.length} 种）`);

// 7. 目录 flint 名称 == 两个转换器的 Flint 名称
check(`types[].flint 与两个转换器一致（${catalogTypes.length} 图型）`, () => {
  for (const [file, parser] of [
    ['sdk/src/converter/highcharts.ts', parseFlintMap],
    ['sdk/src/converter/echarts.ts', parseFlintMap],
  ]) {
    let map;
    try {
      map = parser(read(file));
    } catch (e) {
      console.error(`✗ ${file}\n    读取失败：${e.message}\n    文件：${file}`);
      process.exit(2);
    }
    for (const t of catalog.types) {
      if (map[t.type] !== t.flint) {
        fail(`${file} 的 ${t.type} Flint 名称与目录不一致\n    目录：${t.flint}\n    代码：${map[t.type] ?? '（缺失）'}`);
      }
    }
  }
});

// 8. 目录 required_channels == validate.ts 的 REQUIRED_CHANNELS
check(`types[].required_channels 与 validate.ts REQUIRED_CHANNELS 一致（${catalogTypes.length} 图型）`, () => {
  let table;
  try {
    table = parseRequiredChannels(read('sdk/src/converter/validate.ts'));
  } catch (e) {
    console.error(`✗ sdk/src/converter/validate.ts\n    读取失败：${e.message}\n    文件：sdk/src/converter/validate.ts`);
    process.exit(2);
  }
  for (const t of catalog.types) {
    const code = table[t.type];
    if (!code) {
      fail(`validate.ts 的 REQUIRED_CHANNELS 缺 ${t.type}`);
    } else if (norm([...t.required_channels]) !== norm(code)) {
      fail(`validate.ts 的 ${t.type} 必需通道与目录不一致\n    目录：${t.required_channels.join(', ')}\n    代码：${code.join(', ')}`);
    }
  }
});

// 9. 目录自身字段完整：selection 非空、selection_policy 非空
check(`types[].selection 非空（${catalogTypes.length}/${catalogTypes.length}）、selection_policy 非空`, () => {
  for (const t of catalog.types) {
    if (typeof t.selection !== 'string' || t.selection.trim() === '') {
      fail(`目录 ${t.type} 缺 selection（选型说明）`);
    }
  }
  if (!Array.isArray(catalog.selection_policy) || catalog.selection_policy.length === 0) {
    fail('目录 selection_policy 必须是非空数组');
  }
});

// 10. 渲染后的 SYSTEM_PROMPT 必须含每个图型的选型行
check(`渲染后的 SYSTEM_PROMPT 含全部选型行（${catalogTypes.length}/${catalogTypes.length}）`, () => {
  for (const t of catalog.types) {
    const line = `${t.type} — ${t.selection}`;
    if (!rendered.text.includes(line)) {
      fail(`SYSTEM_PROMPT 缺选型行：${line}`);
    }
  }
});

if (bad === 0) {
  console.log(`\n✅ 图型目录与 5 处代码白名单 + REQUIRED_CHANNELS + prompt 选型段一致（${anchor.set.length} 种）`);
  process.exit(0);
}
console.error(`\n✗ 共 ${bad} 处与 ${anchor.file} 不一致，请同步后重跑`);
process.exit(1);
