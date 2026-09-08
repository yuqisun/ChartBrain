/**
 * 声明式变换运行时：在消费端本地、对全量数据确定性执行变换计划。
 *
 * 算子闭集（docs/design.md §4.2）：filter / aggregate / sort / limit。
 * 假设输入 spec 已通过服务端 L1/L2 校验（字段存在性/类型/白名单）。
 */

import type {
  AggregateStep,
  BinTimeStep,
  DeriveStep,
  FilterStep,
  LimitStep,
  Row,
  Scalar,
  SortStep,
  TransformStep,
} from "./types.js";

const GROUP_SEP = "\u0000";

function groupKey(row: Row, fields: string[]): string {
  return fields.map((f) => String(row[f] ?? "")).join(GROUP_SEP);
}

/** 数值优先比较；非数值回退字符串比较。 */
function compare(a: unknown, b: unknown): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

function applyFilter(rows: Row[], step: FilterStep): Row[] {
  const { field, operator } = step;
  const candidate = step.value ?? step.values;
  return rows.filter((row) => {
    const actual = row[field];
    const scalar = (arr: Scalar[], i: number) => arr[i];

    switch (operator) {
      case "eq":
        return actual === candidate;
      case "neq":
        return actual !== candidate;
      case "gt":
        return compare(actual, candidate) > 0;
      case "gte":
        return compare(actual, candidate) >= 0;
      case "lt":
        return compare(actual, candidate) < 0;
      case "lte":
        return compare(actual, candidate) <= 0;
      case "between": {
        const pair = Array.isArray(candidate) ? candidate : [];
        if (pair.length < 2) return false;
        return (
          compare(actual, scalar(pair, 0)) >= 0 &&
          compare(actual, scalar(pair, 1)) <= 0
        );
      }
      case "in": {
        const list = Array.isArray(candidate) ? candidate : [candidate];
        return list.some((v) => v === actual);
      }
      case "contains":
        return String(actual).includes(String(candidate));
      default:
        return true;
    }
  });
}

function numericAgg(rows: Row[], field: string, agg: "sum" | "avg" | "min" | "max"): number {
  const values = rows.map((r) => toNumber(r[field])).filter((v) => !Number.isNaN(v));
  if (values.length === 0) return Number.NaN;
  switch (agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}

function applyAggregate(rows: Row[], step: AggregateStep): Row[] {
  const groupBy = step.group_by ?? [];
  const { measures } = step;

  // 保序分组（按首次出现顺序），保证确定性输出
  const order: string[] = [];
  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    const key = groupKey(row, groupBy);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(row);
  }

  return order.map((key) => {
    const groupRows = buckets.get(key)!;
    const out: Row = {};
    if (groupBy.length > 0) {
      const first = groupRows[0];
      for (const f of groupBy) out[f] = first?.[f];
    }
    for (const m of measures) {
      if (m.agg === "count") {
        out[m.as] = groupRows.length;
        continue;
      }
      if (!m.field) continue; // 仅 count 可无 field（L2 已保证）
      const field: string = m.field; // 提出为常量：TS 收窄不进入闭包
      if (m.agg === "countDistinct") {
        out[m.as] = new Set(groupRows.map((r) => String(r[field] ?? ""))).size;
        continue;
      }
      const v = numericAgg(groupRows, field, m.agg);
      out[m.as] = Number.isNaN(v) ? null : v;
    }
    return out;
  });
}

function applySort(rows: Row[], step: SortStep): Row[] {
  const dir = step.order === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => dir * compare(a[step.by], b[step.by]));
}

function applyLimit(rows: Row[], step: LimitStep): Row[] {
  return rows.slice(0, step.n);
}

function toNullableNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function applyDerive(rows: Row[], step: DeriveStep): Row[] {
  return rows.map((row) => {
    const out = { ...row };
    const resolve = (operand: DeriveStep["left"]): number | null => {
      const raw = operand.field != null ? row[operand.field] : operand.value;
      return toNullableNumber(raw);
    };
    const l = resolve(step.left);
    const r = resolve(step.right);
    let value: number | null = null;
    if (l !== null && r !== null) {
      switch (step.operator) {
        case "add":
          value = l + r;
          break;
        case "subtract":
          value = l - r;
          break;
        case "multiply":
          value = l * r;
          break;
        case "divide":
          value = r === 0 ? null : l / r; // 除零 → null（D14）
          break;
      }
    }
    out[step.as] = value;
    return out;
  });
}

function parseDate(v: unknown): { year: number; month: number } | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return { year: v.getUTCFullYear(), month: v.getUTCMonth() + 1 };
  }
  const s = String(v);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }
  return null;
}

function bucketLabel(
  g: BinTimeStep["granularity"],
  year: number,
  month: number,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (g) {
    case "month":
      return `${year}-${pad(month)}`;
    case "quarter":
      return `${year}-Q${Math.ceil(month / 3)}`;
    case "year":
      return String(year);
    default:
      return "";
  }
}

function applyBinTime(rows: Row[], step: BinTimeStep): Row[] {
  return rows.map((row) => {
    const out = { ...row };
    const parsed = parseDate(row[step.field]);
    out[step.as] = parsed
      ? bucketLabel(step.granularity, parsed.year, parsed.month)
      : null;
    return out;
  });
}

/** 顺序执行变换计划：前一步输出是后一步输入。 */
export function executeTransform(data: Row[], steps: TransformStep[]): Row[] {
  let rows = data;
  for (const step of steps) {
    switch (step.op) {
      case "filter":
        rows = applyFilter(rows, step);
        break;
      case "aggregate":
        rows = applyAggregate(rows, step);
        break;
      case "sort":
        rows = applySort(rows, step);
        break;
      case "limit":
        rows = applyLimit(rows, step);
        break;
      case "derive":
        rows = applyDerive(rows, step);
        break;
      case "binTime":
        rows = applyBinTime(rows, step);
        break;
      default:
        throw new Error(`Unsupported transform op: ${(step as TransformStep).op}`);
    }
  }
  return rows;
}
