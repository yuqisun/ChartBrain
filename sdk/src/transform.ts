/**
 * 声明式变换运行时：在消费端本地、对全量数据确定性执行变换计划。
 *
 * 算子闭集（docs/design.md §4.2）：filter / aggregate / sort / limit。
 * 假设输入 spec 已通过服务端 L1/L2 校验（字段存在性/类型/白名单）。
 */

import type {
  AggregateStep,
  FilterStep,
  LimitStep,
  Row,
  Scalar,
  SortStep,
  TransformStep,
} from "./types";

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
      if (m.agg === "countDistinct") {
        out[m.as] = new Set(groupRows.map((r) => String(r[m.field] ?? ""))).size;
        continue;
      }
      if (!m.field) continue;
      const v = numericAgg(groupRows, m.field, m.agg);
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
      default:
        throw new Error(`不支持的变换算子: ${(step as TransformStep).op}`);
    }
  }
  return rows;
}
