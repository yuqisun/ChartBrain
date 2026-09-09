// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Connected Scatter Plot template.
 *
 * Points plotted in 2-D (x, y both quantitative) and **connected by a straight
 * line in a defined order** (usually time / sequence), tracing a trajectory.
 * Shows the x↔y correlation AND the ordered path at once — distinct from a
 * plain scatter (no order, no line) and from a regression (a fitted trend).
 *
 * Mirrors ecScatterPlotDef (points) and ecLineChartDef (connecting line).
 *
 * Contract:
 *   x      — quantitative (value axis).
 *   y      — quantitative (value axis).
 *   order  — the sequence field; the series data is **sorted by this field** so
 *            the line follows the trajectory, NOT the x value. `smooth:false`
 *            keeps the segments straight, so a looping path crosses itself.
 *   color  — optional series → one line series (trajectory) per value.
 *   detail — optional series → one trajectory per value (used when color absent).
 *
 * Each series is a `line` with `showSymbol:true` so every observation shows a
 * point marker.
 */

import { ChartTemplateDef } from '../../core/types';
import { groupBy } from './utils';

/**
 * Stable sort of `rows` by the sequence `field`. Detection is value-based so it
 * works for any order field type: numeric (years / step indices) sort
 * numerically, date-parseable values sort chronologically, everything else
 * sorts lexically. Ties keep their original row order so equal-key points stay
 * stable.
 */
function sortByOrder(rows: any[], field: string | undefined): any[] {
    if (!field) return rows;
    const tagged = rows.map((row, idx) => ({ row, idx, key: row[field] }));
    const present = tagged.filter(t => t.key != null && t.key !== '');
    const allNumeric = present.length > 0 &&
        present.every(t => typeof t.key === 'number' ||
            (typeof t.key === 'string' && t.key.trim() !== '' && !isNaN(Number(t.key))));
    const allDates = !allNumeric && present.length > 0 &&
        present.every(t => !isNaN(Date.parse(String(t.key))));
    const rank = (k: any): number | string => {
        if (allNumeric) return Number(k);
        if (allDates) return Date.parse(String(k));
        return String(k);
    };
    return [...tagged].sort((a, b) => {
        const ra = rank(a.key);
        const rb = rank(b.key);
        if (ra < rb) return -1;
        if (ra > rb) return 1;
        return a.idx - b.idx; // stable
    }).map(t => t.row);
}

/** Build the [x, y] point list for a (sorted) set of rows. */
function toPoints(rows: any[], xField: string, yField: string): (number | null)[][] {
    return rows.map(r => {
        const x = r[xField];
        const y = r[yField];
        return [
            x != null && !isNaN(Number(x)) ? Number(x) : null,
            y != null && !isNaN(Number(y)) ? Number(y) : null,
        ];
    });
}

export const ecConnectedScatterDef: ChartTemplateDef = {
    chart: 'Connected Scatter Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'order', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const orderField = channelSemantics.order?.field;
        // One trajectory per series: prefer color, fall back to detail.
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        const option: any = {
            tooltip: { trigger: 'item' },
            xAxis: {
                type: 'value',
                name: xField,
                nameLocation: 'middle',
                nameGap: 30,
                axisTick: { show: true },
            },
            yAxis: {
                type: 'value',
                name: yField,
                nameLocation: 'middle',
                nameGap: 40,
                axisTick: { show: true },
            },
            series: [],
        };

        // A trajectory reads its shape, not the distance from zero, so let both
        // value axes fit the data unless a zero decision forces a zero baseline.
        option.xAxis.scale = channelSemantics.x?.zero ? !channelSemantics.x.zero.zero : true;
        option.yAxis.scale = channelSemantics.y?.zero ? !channelSemantics.y.zero.zero : true;

        const baseSeriesOpt = {
            type: 'line' as const,
            showSymbol: true,
            symbol: 'circle' as const,
            symbolSize: 8,
            // Straight segments — never smooth, so a looping path crosses itself.
            smooth: false as const,
            lineStyle: { width: 2 },
            // Don't clip symbols at the grid edge: a point that lands exactly on
            // an axis bound would otherwise have its marker cut in half.
            clip: false as const,
        };

        if (groupField) {
            const groups = groupBy(table, groupField);
            option.legend = { data: [...groups.keys()] };
            for (const [name, rows] of groups) {
                const sorted = sortByOrder(rows, orderField);
                option.series.push({
                    name,
                    ...baseSeriesOpt,
                    data: toPoints(sorted, xField, yField),
                    // Colors assigned by ecApplyLayoutToSpec from colorDecisions.
                });
            }
        } else {
            const sorted = sortByOrder(table, orderField);
            option.series.push({
                ...baseSeriesOpt,
                data: toPoints(sorted, xField, yField),
            });
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};
