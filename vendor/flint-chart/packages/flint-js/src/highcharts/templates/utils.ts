// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Shared helpers for Highcharts template hooks.
//
// The discrete-axis helpers (extractCategories / groupBy / detectAxes /
// getCategoryOrder) are backend-agnostic in practice; upstream Flint keeps
// them under `echarts/templates/utils.ts`, so we reuse them from there rather
// than duplicating the logic. Everything Highcharts-specific lives below.

import type { ChannelSemantics, LayoutResult } from '../../core/types';

export {
    extractCategories,
    groupBy,
    detectAxes,
    getCategoryOrder,
    resolveCategoryOrder,
} from '../../echarts/templates/utils';

export const isDiscrete = (type: string | undefined): boolean =>
    type === 'nominal' || type === 'ordinal';

/**
 * Map a channel's semantic type to a Highcharts axis kind.
 *
 * Temporal maps to `datetime` so line/area charts get proportional time spacing
 * (the same choice the ECharts backend makes with its `time` axis). Callers
 * must check {@link isParseableTemporal} before committing to it.
 */
export type HcAxisKind = 'category' | 'linear' | 'datetime';

export function hcAxisKind(cs: ChannelSemantics | undefined): HcAxisKind {
    if (!cs) return 'category';
    if (cs.type === 'quantitative') return 'linear';
    if (cs.type === 'temporal') return 'datetime';
    return 'category';
}

/** Parse a temporal cell to epoch ms, or `undefined` when unparseable. */
export function toEpochMs(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? t : undefined;
}

/** True when every value parses as a date, so a datetime axis is safe. */
export function isParseableTemporal(values: unknown[]): boolean {
    if (values.length === 0) return false;
    return values.every(v => toEpochMs(v) !== undefined);
}

/** Label rotation (degrees) decided by the shared layout engine, 0 when unset. */
export function hcLabelRotation(label: LayoutResult['xLabel'] | undefined): number {
    return typeof label?.labelAngle === 'number' ? label.labelAngle : 0;
}

/** Sort category labels chronologically when the axis is temporal. */
export function sortTemporalCategories(categories: string[]): string[] {
    return [...categories].sort((a, b) => {
        const ta = new Date(a).getTime();
        const tb = new Date(b).getTime();
        if (!isFinite(ta) || !isFinite(tb)) return 0;
        return ta - tb;
    });
}

/**
 * Values aligned to a category array: sums every row of a category, so both
 * raw and pre-aggregated tables work. `null` marks a category with no rows.
 */
export function buildCategoryValues(
    rows: any[],
    categoryField: string,
    valueField: string,
    categories: string[],
): (number | null)[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        const cat = String(row[categoryField] ?? '');
        const val = row[valueField];
        if (val != null && !isNaN(Number(val))) {
            map.set(cat, (map.get(cat) ?? 0) + Number(val));
        }
    }
    return categories.map(cat => (map.has(cat) ? map.get(cat)! : null));
}

/** Row counts per category (used when the value channel has no numeric field). */
export function buildCategoryCounts(
    rows: any[],
    categoryField: string,
    categories: string[],
): number[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        const cat = String(row[categoryField] ?? '');
        map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return categories.map(cat => map.get(cat) ?? 0);
}

/** One value row per group, aligned to `categories`. */
export function buildGroupValueMatrix(
    rows: any[],
    categoryField: string,
    valueField: string,
    groupField: string,
    categories: string[],
    groups: string[],
): (number | null)[][] {
    return groups.map(group =>
        buildCategoryValues(
            rows.filter(r => String(r[groupField] ?? '') === group),
            categoryField,
            valueField,
            categories,
        ),
    );
}

/** One count row per group, aligned to `categories`. */
export function buildGroupCountMatrix(
    rows: any[],
    categoryField: string,
    groupField: string,
    categories: string[],
    groups: string[],
): number[][] {
    return groups.map(group =>
        buildCategoryCounts(
            rows.filter(r => String(r[groupField] ?? '') === group),
            categoryField,
            categories,
        ),
    );
}

/** Numeric extent of a field, ignoring nulls / non-numerics. */
export function numericExtent(rows: any[], field: string): [number, number] | undefined {
    let min = Infinity;
    let max = -Infinity;
    for (const row of rows) {
        const v = Number(row[field]);
        if (Number.isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    return min === Infinity ? undefined : [min, max];
}
