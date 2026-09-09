// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Connected Scatter Plot template.
 *
 * Points plotted in 2-D (x, y both quantitative) and **connected by a straight
 * line in a defined order** (usually time / sequence), tracing a trajectory.
 * Shows the x↔y correlation AND the ordered path at once — distinct from a
 * plain scatter (no order, no line) and from a regression (a fitted trend).
 *
 * Mirrors cjsScatterPlotDef (points) and cjsLineChartDef (connecting line).
 *
 * Contract:
 *   x      — quantitative (linear axis).
 *   y      — quantitative (linear axis).
 *   order  — the sequence field; each dataset's points are **pre-sorted by this
 *            field** so the line follows the trajectory, NOT the x value. With
 *            `tension:0` the segments stay straight, so a looping path crosses
 *            itself.
 *   color  — optional series → one dataset (trajectory) per value (legend).
 *   detail — optional series → one trajectory per value (used when color absent).
 *
 * Each dataset is a `scatter` with `showLine:true` so both the points and the
 * connecting line are drawn.
 */

import { ChartTemplateDef } from '../../core/types';
import {
    groupBy,
    getChartJsPalette,
    getSeriesBorderColor,
    getSeriesBackgroundColor,
} from './utils';

/**
 * Stable sort of `rows` by the sequence `field`. Detection is value-based so it
 * works for any order field type: numeric (years / step indices) sort
 * numerically, date-parseable values sort chronologically, everything else
 * sorts lexically. Ties keep their original row order.
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

/** Build the {x, y} point list for a (sorted) set of rows. */
function toPoints(rows: any[], xField: string, yField: string): { x: number; y: number }[] {
    return rows.map(r => ({ x: Number(r[xField]), y: Number(r[yField]) }));
}

export const cjsConnectedScatterDef: ChartTemplateDef = {
    chart: 'Connected Scatter Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'order', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const orderField = channelSemantics.order?.field;
        // One trajectory per dataset: prefer color, fall back to detail.
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        const palette = getChartJsPalette(ctx, 'color');

        const config: any = {
            type: 'scatter',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: xField },
                        ticks: { font: { size: 10 } },
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: yField },
                        ticks: { font: { size: 10 } },
                    },
                },
                plugins: {
                    tooltip: { enabled: true },
                    legend: { display: false },
                },
            },
        };

        // A trajectory reads its shape, not the distance from zero — fit the
        // data unless the zero decision forces a zero baseline.
        if (channelSemantics.x?.zero) {
            config.options.scales.x.beginAtZero = channelSemantics.x.zero.zero !== false;
        }
        if (channelSemantics.y?.zero) {
            config.options.scales.y.beginAtZero = channelSemantics.y.zero.zero !== false;
        }

        const baseDataset = {
            // Straight segments + visible points connecting the trajectory.
            showLine: true,
            tension: 0,
            borderWidth: 2,
            pointRadius: 4,
            fill: false,
            // Don't clip points at the chart-area edge: a point that lands
            // exactly on an axis bound would otherwise have its marker cut off.
            clip: false,
        };

        if (groupField) {
            const groups = groupBy(table, groupField);
            config.options.plugins.legend = { display: true };
            let colorIdx = 0;
            for (const [name, rows] of groups) {
                const sorted = sortByOrder(rows, orderField);
                config.data.datasets.push({
                    label: name,
                    data: toPoints(sorted, xField, yField),
                    borderColor: getSeriesBorderColor(palette, colorIdx),
                    backgroundColor: getSeriesBackgroundColor(palette, colorIdx, 1),
                    ...baseDataset,
                });
                colorIdx++;
            }
        } else {
            const sorted = sortByOrder(table, orderField);
            config.data.datasets.push({
                label: yField,
                data: toPoints(sorted, xField, yField),
                borderColor: getSeriesBorderColor(palette, 0),
                backgroundColor: getSeriesBackgroundColor(palette, 0, 1),
                ...baseDataset,
            });
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
};
