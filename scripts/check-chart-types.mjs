#!/usr/bin/env node
/**
 * 图型一致性检查（纯静态，不导入 Python、不起子进程）：图型目录 specs/chart-types.json 是
 * 单一事实源（single source of truth）。
 *
 * 白名单五处（新增图型时必须全部同步；第 1 处是基准，其余各处向它看齐）：
 *   1. specs/chart-types.json                   → types[].type
 *   2. specs/chart-spec.schema.json             → chart.type enum
 *   3. sdk/src/types.ts                         → ChartType union 字面量
 *   4. sdk/src/converter/highcharts.ts          → FLINT_CHART_TYPE 的键
 *   5. sdk/src/converter/echarts.ts             → FLINT_CHART_TYPE 的键
 *
 * prompt.py 规则 1 不列为独立来源：它已由目录在 import 时渲染（__CHART_TYPES__ 占位符），
 * 手写副本不可能再漂移；它的「渲染结果」由 pytest 断言（见下）。
 *
 * 目录字段与下游代码 / prompt 接线的一致性（全部静态可判定）：
 *   6. types[].flint             == 两个转换器里的 Flint 名称
 *   7. types[].required_channels == sdk/src/converter/validate.ts 的 REQUIRED_CHANNELS
 *   8. types[].selection 非空、selection_policy 为非空数组
 *   9. prompt.py 仍是「目录渲染」接线：模板含 __CHART_TYPES__ / __SELECTION_GUIDANCE__ 占位符，
 *      有对应的 .replace(...) 调用，且 _chart_type_names() / _selection_guidance() 确实从
 *      load_chart_types() 取数
 *  10. prompt.py 未「检出」图型枚举形状。启发式：两处不同的目录图型名之间只隔 ≤16 个非单词字符
 *      （含跨行）即判为枚举；few-shot 里单个 "type": "<图型>" 字面量与散文提及（如 "pie chart"）
 *      不算。它**不**证明「没有手写枚举」——实测挡不住：逐行尾注释、`"bar": true,` 形式的键、
 *      UPPERCASE 副本、间隔 ≥17 个非单词字符的写法（引号本身也算字符），都检不出来。它证明的只是
 *      「没检出同段相邻枚举这一形状」；「渲染出来的文本正确」归 pytest（server/tests/test_prompt.py）。
 *  11. 目录自身不变量：types[].type 唯一（无重复）
 *  12. 目录自身不变量：schema_version 存在且为 ≥ 1 的整数
 *  13. 目录自身不变量：types[].flint 非空
 *  14. 目录自身不变量：types[].required_channels 取值 ∈ {x, y, series}
 *
 * 本脚本只做静态检查：跨语言白名单门禁不应因缺 Python 运行时或服务端依赖（pydantic/dotenv）变红。
 * 渲染后的 SYSTEM_PROMPT 由配套门禁断言：
 *   python -m pytest server/tests/test_prompt.py
 *     → 规则 1 列表 == 目录类型集合、每图型选型行、selection_policy 条目、必需通道保证
 *
 * 用法：
 *   node scripts/check-chart-types.mjs
 *     exit 0：全部一致
 *     exit 1：目录与代码 / prompt 接线不一致（打印差异）
 *     exit 2：文件读取或解析失败（环境问题，与图型一致性无关）
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r/g, '');

const CATALOG_FILE = 'specs/chart-types.json';
const PROMPT_FILE = 'server/chartbrain_server/spec/prompt.py';

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

/** 读取仓库内文件；失败按环境问题处理（exit 2）。 */
function readOrExit(file, label) {
  try {
    return read(file);
  } catch (e) {
    console.error(`✗ ${label}\n    读取失败：${e.message}\n    文件：${file}`);
    process.exit(2);
  }
}

/** 取 Python 源码里某个函数的函数体（到下一个顶层 def 之前）。 */
function bodyOf(src, name) {
  const start = src.indexOf(`def ${name}(`);
  if (start < 0) return null;
  const next = src.indexOf('\ndef ', start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

const catalogSrc = readOrExit(CATALOG_FILE, 'specs/chart-types.json（图型目录）');
let catalog;
try {
  catalog = JSON.parse(catalogSrc);
} catch (e) {
  console.error(`✗ specs/chart-types.json（图型目录）\n    解析失败：${e.message}\n    文件：${CATALOG_FILE}`);
  process.exit(2);
}
const catalogTypes = catalog.types.map((t) => t.type);
const promptSrc = readOrExit(PROMPT_FILE, 'server/chartbrain_server/spec/prompt.py');

const sources = [
  {
    name: 'specs/chart-types.json（types[].type，基准）',
    file: CATALOG_FILE,
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

console.log(`· ${PROMPT_FILE} 规则 1 由目录生成，不列为独立来源；其渲染结果由 pytest 断言（server/tests/test_prompt.py）`);

const [anchor, ...rest] = parsed;
const expect = [...anchor.set].sort();
const norm = (a) => a.join(',');
let bad = 0;
const fail = (msg) => {
  bad++;
  console.error(`✗ ${msg}`);
};
/** 跑一段校验；无失败则打印 ✓ 行（保持既有输出风格）。 */
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

// 6. 目录 flint 名称 == 两个转换器的 Flint 名称
check(`types[].flint 与两个转换器一致（${catalogTypes.length} 图型）`, () => {
  for (const file of ['sdk/src/converter/highcharts.ts', 'sdk/src/converter/echarts.ts']) {
    let map;
    try {
      map = parseFlintMap(read(file));
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

// 7. 目录 required_channels == validate.ts 的 REQUIRED_CHANNELS
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

// 8. 目录自身字段完整：selection 非空、selection_policy 非空
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

// 9. prompt.py 仍是「目录渲染」接线（占位符 + .replace 调用 + 渲染器从目录取数）
check('prompt.py 规则 1 与选型段仍由目录渲染（占位符 + .replace 调用 + 取数来源）', () => {
  if (!/chart\.type must be one of:\s*__CHART_TYPES__\./.test(promptSrc)) {
    fail('prompt.py 规则 1 不再是占位符（应形如 "1. chart.type must be one of: __CHART_TYPES__."）');
  }
  if (!/__SELECTION_GUIDANCE__/.test(promptSrc)) {
    fail('prompt.py 模板缺 __SELECTION_GUIDANCE__ 占位符（选型段应由目录渲染）');
  }
  if (!/\.replace\(\s*"__CHART_TYPES__"\s*,\s*"\s\|\s"\.join\(\s*_chart_type_names\(\)\s*\)\s*\)/.test(promptSrc)) {
    fail('prompt.py 缺 .replace("__CHART_TYPES__", " | ".join(_chart_type_names())) 调用');
  }
  if (!/\.replace\(\s*"__SELECTION_GUIDANCE__"\s*,\s*_selection_guidance\(\)\s*\)/.test(promptSrc)) {
    fail('prompt.py 缺 .replace("__SELECTION_GUIDANCE__", _selection_guidance()) 调用');
  }
  const namesBody = bodyOf(promptSrc, '_chart_type_names');
  if (namesBody === null) {
    fail('prompt.py 找不到 _chart_type_names()');
  } else if (!/load_chart_types\(\)/.test(namesBody)) {
    fail('prompt.py 的 _chart_type_names() 不再从 load_chart_types() 取图型');
  }
  const guidanceBody = bodyOf(promptSrc, '_selection_guidance');
  if (guidanceBody === null) {
    fail('prompt.py 找不到 _selection_guidance()');
  } else {
    if (!/\['selection'\]/.test(guidanceBody)) fail("prompt.py 的 _selection_guidance() 不再取目录的 ['selection']");
    if (!/selection_policy/.test(guidanceBody)) fail('prompt.py 的 _selection_guidance() 不再取目录的 selection_policy');
  }
});

// 10. prompt.py 未检出图型枚举形状（启发式，能力边界见文件头说明）
check('prompt.py 未检出图型枚举形状（≤16 字符窗口；渲染正确性由 pytest 断言）', () => {
  const alternation = [...catalogTypes].sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`\\b(${alternation})\\b[^A-Za-z0-9_]{0,16}\\b(${alternation})\\b`, 'g');
  const seenLines = new Map();
  let m;
  while ((m = re.exec(promptSrc)) !== null) {
    if (m[1] !== m[2]) {
      const line = promptSrc.slice(0, m.index).split('\n').length;
      if (!seenLines.has(line)) seenLines.set(line, m[0].replace(/\s+/g, ' '));
    }
    re.lastIndex = m.index + m[0].length;
  }
  for (const [line, text] of [...seenLines].slice(0, 5)) {
    fail(`prompt.py 第 ${line} 行疑似硬编码图型枚举：${JSON.stringify(text)}\n    白名单/选型段应由目录渲染；few-shot 里单个 "type": "<图型>" 字面量不算`);
  }
});

// 11–14. 目录自身不变量（不依赖任何下游文件：目录写坏了本身就该红）
const ALLOWED_CHANNELS = new Set(['x', 'y', 'series']);

check(`types[].type 唯一（${catalogTypes.length} 条无重复）`, () => {
  const seen = new Set();
  const dupes = new Set();
  for (const name of catalogTypes) {
    if (seen.has(name)) dupes.add(name);
    seen.add(name);
  }
  if (dupes.size > 0) {
    fail(`目录 types[].type 重复：${[...dupes].join(', ')}（类型名是白名单基准，必须唯一）`);
  }
});

check('schema_version 存在且为 ≥ 1 的整数', () => {
  const v = catalog.schema_version;
  if (!Number.isInteger(v) || v < 1) {
    fail(`目录 schema_version 必须是 ≥ 1 的整数，实际：${JSON.stringify(v)}`);
  }
});

check(`types[].flint 非空（${catalogTypes.length}/${catalogTypes.length}）`, () => {
  for (const t of catalog.types) {
    if (typeof t.flint !== 'string' || t.flint.trim() === '') {
      fail(`目录 ${t.type} 缺 flint（Flint 图型名，供两个转换器对拍）`);
    }
  }
});

check('types[].required_channels 取值 ∈ {x, y, series}', () => {
  for (const t of catalog.types) {
    const chs = t.required_channels;
    if (!Array.isArray(chs) || chs.length === 0) {
      fail(`目录 ${t.type} 的 required_channels 必须是非空数组，实际：${JSON.stringify(chs)}`);
      continue;
    }
    const unknown = chs.filter((c) => !ALLOWED_CHANNELS.has(c));
    if (unknown.length > 0) {
      fail(`目录 ${t.type} 的 required_channels 含未知通道：${unknown.join(', ')}（只允许 x / y / series）`);
    }
  }
});

if (bad === 0) {
  console.log(`\n✅ 目录与 ${sources.length} 处静态来源一致（${anchor.set.length} 种）；渲染后的 prompt 由 server/tests/test_prompt.py 断言`);
  process.exit(0);
}
console.error(`\n✗ 共 ${bad} 处与 ${anchor.file} 不一致，请同步后重跑`);
process.exit(1);
