// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Optional data aggregation transform.
 *
 * Flint's default contract is "callers own the data" — the host passes in rows
 * that are already shaped for the chart. As a convenience, an encoding may set
 * `aggregate` to ask Flint to collapse the rows itself, mirroring the way
 * Vega-Lite derives an aggregated field:
 *
 *   - Rows are grouped by every channel that has a `field` and no `aggregate`
 *     (the dimensions).
 *   - For each group, each aggregated channel produces a derived column named
 *     `${field}_${op}` (`count` produces `_count`), which the backend assemblers
 *     already reference once `aggregate` is set.
 *
 * The derived column name IS the contract: if a caller has already
 * pre-aggregated, they simply reference that column by name (e.g. `revenue_sum`)
 * and omit `aggregate`, and this transform is a no-op. `average` and `mean` are
 * synonyms (both arithmetic mean) and keep distinct suffixes by design.
 *
 * This is a deliberate, opt-in exception to the no-transform principle — most
 * callers should still aggregate upstream.
 */

import { ChartEncoding } from './types';

interface AggSpec {
    field?: string;
    op: string;
    /** Derived column name the assemblers expect (`${field}_${op}` or `_count`). */
    target: string;
}

/**
 * Apply requested `aggregate` operations to the data, returning grouped rows.
 *
 * Returns the input unchanged when no encoding requests aggregation, or when the
 * derived columns are already present (caller pre-aggregated).
 */
export function applyAggregation(
    encodings: Record<string, ChartEncoding>,
    data: any[],
): any[] {
    if (!data || data.length === 0) return data;

    // Collect aggregate requests from the input encodings.
    const specs: AggSpec[] = [];
    for (const enc of Object.values(encodings)) {
        if (!enc || !enc.aggregate) continue;
        const op = enc.aggregate;
        if (op !== 'count' && !enc.field) continue; // nothing to reduce
        const target = op === 'count' ? '_count' : `${enc.field}_${op}`;
        specs.push({ field: enc.field, op, target });
    }
    if (specs.length === 0) return data;

    // If every derived column already exists, the caller pre-aggregated — trust
    // the supplied data and do nothing.
    const firstRow = data[0];
    const allPresent = specs.every(s =>
        Object.prototype.hasOwnProperty.call(firstRow, s.target),
    );
    if (allPresent) return data;

    // Group-by dimensions: every channel with a field and no aggregate.
    const groupFields: string[] = [];
    const seen = new Set<string>();
    for (const enc of Object.values(encodings)) {
        if (!enc || enc.aggregate || !enc.field) continue;
        if (seen.has(enc.field)) continue;
        seen.add(enc.field);
        groupFields.push(enc.field);
    }

    // Bucket rows by the tuple of group-field values (insertion order preserved).
    const groups = new Map<string, any[]>();
    for (const row of data) {
        const key = JSON.stringify(groupFields.map(f => row[f] ?? null));
        let bucket = groups.get(key);
        if (!bucket) {
            bucket = [];
            groups.set(key, bucket);
        }
        bucket.push(row);
    }

    const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v));
    const reduceOp = (rows: any[], spec: AggSpec): number => {
        if (spec.op === 'count') return rows.length;
        const nums = rows
            .map(r => toNum(r[spec.field as string]))
            .filter(v => Number.isFinite(v));
        if (nums.length === 0) return 0;
        const sum = nums.reduce((a, b) => a + b, 0);
        // 'average' and 'mean' are synonyms (arithmetic mean); 'sum' totals.
        return spec.op === 'sum' ? sum : sum / nums.length;
    };

    const out: any[] = [];
    for (const rows of groups.values()) {
        const head = rows[0];
        const aggregated: Record<string, any> = {};
        for (const f of groupFields) aggregated[f] = head[f];
        for (const spec of specs) {
            const val = reduceOp(rows, spec);
            aggregated[spec.target] = val;
            // Keep the source column populated so semantic/format inference for
            // the measure channel still sees representative numeric values.
            if (spec.op !== 'count' && spec.field) aggregated[spec.field] = val;
        }
        out.push(aggregated);
    }
    return out;
}
