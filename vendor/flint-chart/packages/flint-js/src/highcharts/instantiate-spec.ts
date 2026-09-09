// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.

/**
 * Highcharts layout application — the backend translation of the shared,
 * target-agnostic LayoutResult.
 *
 * Mapping (mirrors the ECharts backend's responsibilities):
 *   subplotWidth / subplotHeight  → chart.width / chart.height (+ chrome margins)
 *   xStep / stepPadding           → series[].pointWidth on column/bar series
 *   xLabel / yLabel               → axis label rotation + label font size
 *   titleFontSize / legendFontSize → title / legend / axis-title font sizes
 *   channelSemantics.y.zero       → value-axis domain (see applyValueDomain)
 *
 * Overflow truncations are NOT re-reported here: `filterOverflow` already
 * pushed them into the assembler's warning list.
 */

import type { InstantiateContext } from '../core/types';
import { pickHighchartsPalette } from './colormap';
import { hcLabelRotation } from './templates/utils';

const CANVAS_BUFFER = 16;

const hasAxisTitle = (axis: any): boolean => !!axis?.title?.text;

/**
 * Turn the shared zero-baseline decision into a Highcharts value-axis domain.
 *
 *   zero.zero === true  and no negative values → pin min to 0
 *   zero.zero === false                        → pad the domain (no baseline)
 *   negative values present                    → leave the domain to Highcharts
 *     (forcing min = 0 would clip every negative bar)
 */
function applyValueDomain(yAxis: any, ctx: InstantiateContext): void {
    const cs = ctx.channelSemantics?.y;
    if (!cs?.field) return;

    let min = Infinity;
    let max = -Infinity;
    for (const row of ctx.table ?? []) {
        const v = Number((row as any)[cs.field]);
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (min === Infinity) return;

    const zero = cs.zero;
    if (zero && zero.zero === false) {
        const pad = (max - min) * (zero.domainPadFraction || 0.05);
        yAxis.min = min - pad;
        yAxis.max = max + pad;
    } else if (zero?.zero === true && min >= 0) {
        yAxis.min = 0;
    }
}

export function hcApplyLayoutToSpec(
    option: any,
    ctx: InstantiateContext,
): void {
    const layout = ctx.layout;
    const chart = (option.chart = option.chart ?? {});
    const series: any[] = option.series ?? [];
    const xAxis = option.xAxis;
    const yAxis = option.yAxis;
    const isAxisLess = series.some((s: any) => s?.type === 'pie');

    const titleFontSize = layout.titleFontSize ?? 12;
    const legendFontSize = layout.legendFontSize ?? 11;

    // ── Fonts ──────────────────────────────────────────────────────────
    if (option.title?.text) {
        option.title.style = { ...(option.title.style ?? {}), fontSize: `${titleFontSize}px` };
    }
    if (option.legend?.enabled) {
        option.legend.itemStyle = {
            ...(option.legend.itemStyle ?? {}),
            fontSize: `${legendFontSize}px`,
        };
    }
    for (const axis of [xAxis, yAxis]) {
        if (hasAxisTitle(axis)) {
            axis.title.style = { ...(axis.title.style ?? {}), fontSize: `${titleFontSize}px` };
        }
    }

    // ── Axis labels ────────────────────────────────────────────────────
    if (xAxis) {
        const size = layout.xLabel?.fontSize ?? 11;
        xAxis.labels = {
            ...(xAxis.labels ?? {}),
            style: { ...(xAxis.labels?.style ?? {}), fontSize: `${size}px` },
        };
        if (xAxis.type === 'category') {
            xAxis.labels.rotation = hcLabelRotation(layout.xLabel);
        }
    }
    if (yAxis) {
        const size = layout.yLabel?.fontSize ?? 11;
        yAxis.labels = {
            ...(yAxis.labels ?? {}),
            style: { ...(yAxis.labels?.style ?? {}), fontSize: `${size}px` },
        };
        if (yAxis.type === 'category') {
            yAxis.labels.rotation = 0;
        } else {
            applyValueDomain(yAxis, ctx);
        }
    }

    // ── Bar geometry from the shared step + padding decisions ──────────
    if (chart.type === 'column' || chart.type === 'bar') {
        const step = (xAxis?.type === 'category' ? layout.xStep : layout.yStep) ?? 0;
        const pad = layout.stepPadding ?? 0;
        if (step > 0) {
            const pointWidth = Math.max(1, Math.round(step * (1 - pad)));
            for (const s of series) {
                if (s?.type === 'column' || s?.type === 'bar') s.pointWidth = pointWidth;
            }
        }
    }

    // ── Palette from the shared colour decisions ───────────────────────
    const palette = pickHighchartsPalette(ctx.colorDecisions?.color ?? ctx.colorDecisions?.group);
    option.colors = palette;
    if (series.length > 1) {
        series.forEach((s, i) => {
            if (s?.color === undefined) s.color = palette[i % palette.length];
        });
    }

    // ── Canvas size: shared subplot size + backend chrome margins ──────
    if (isAxisLess) {
        chart.width = Math.max(120, Math.round(layout.subplotWidth));
        chart.height = Math.max(120, Math.round(layout.subplotHeight));
    } else {
        const left = (hasAxisTitle(yAxis) ? 70 : 50) + CANVAS_BUFFER;
        const bottom = (hasAxisTitle(xAxis) ? 45 : 30) + CANVAS_BUFFER;
        const top = (option.title?.text ? 36 : 12) + CANVAS_BUFFER;
        const right = (option.legend?.enabled ? 130 : 20) + CANVAS_BUFFER;
        chart.width = Math.round(layout.subplotWidth + left + right);
        chart.height = Math.round(layout.subplotHeight + top + bottom);
    }

    option._width = chart.width;
    option._height = chart.height;
}

/**
 * Translate the template-authored `_hcTooltip` hint into a Highcharts tooltip.
 * Called after layout so templates stay declarative.
 */
export function hcApplyTooltips(option: any): void {
    const info = option._hcTooltip;
    if (!info) return;
    const isPie = option.series?.some((s: any) => s?.type === 'pie');

    if (info.trigger === 'item') {
        option.tooltip = isPie
            ? { pointFormat: '<b>{point.name}</b>: {point.y} ({point.percentage:.1f}%)' }
            : { pointFormat: `<b>${info.valueLabel}</b>: {point.y}` };
    } else {
        option.tooltip = { shared: true, valueDecimals: 2 };
    }

    delete option._hcTooltip;
}
