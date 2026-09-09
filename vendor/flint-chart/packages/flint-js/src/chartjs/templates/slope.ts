// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Slope Chart (slopegraph) template.
 *
 * One straight line **per category** connecting that category's value at exactly
 * **two periods**, with a point marker at each end. The read is the slope /
 * direction of change and the crossovers between categories — the 2-point
 * value-change cousin of the Bump Chart. Mirrors cjsLineChartDef where
 * practical.
 *
 * Contract:
 *   x      — period, rendered as a *category* axis with exactly two labels.
 *   y      — value (linear).
 *   color  — category → one line (dataset) per value (legend).
 *   detail — category → one line per value (used when color is absent).
 *
 * Each dataset uses tension 0 (straight) and a visible point at each end.
 */

import { ChartTemplateDef } from '../../core/types';
import {
    extractCategories,
    groupBy,
    buildCategoryAlignedData,
    getChartJsPalette,
    getSeriesBorderColor,
} from './utils';

/**
 * Order the period categories naturally: numerically when every label parses as
 * a number, chronologically when every label parses as a date, else preserve
 * the extracted order.
 */
function orderPeriods(categories: string[]): string[] {
    if (categories.length <= 1) return categories;
    const allNumeric = categories.every(c => c.trim() !== '' && !isNaN(Number(c)));
    if (allNumeric) return [...categories].sort((a, b) => Number(a) - Number(b));
    const allDates = categories.every(c => !isNaN(Date.parse(c)));
    if (allDates) return [...categories].sort((a, b) => Date.parse(a) - Date.parse(b));
    return categories;
}

export const cjsSlopeChartDef: ChartTemplateDef = {
    chart: 'Slope Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        axisFlags: { x: { banded: true } },
        paramOverrides: {
            defaultBandSize: 120,
            continuousMarkCrossSection: { x: 0, y: 0, seriesCountAxis: 'auto' },
        },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        // One line per category: prefer color, fall back to detail.
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        // Period axis is always a two-label category axis (slopegraph).
        const categories = orderPeriods(
            extractCategories(table, xField, xCS.ordinalSortOrder),
        );

        const palette = getChartJsPalette(ctx, 'color');

        const config: any = {
            type: 'line',
            data: { labels: categories, datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'category',
                        // Inset the two period bands so the end points/labels
                        // are not clipped against the plot edges.
                        offset: true,
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

        // Slope charts emphasize the change, not the absolute level — let the
        // value axis fit the data unless the zero decision forces zero.
        if (channelSemantics.y?.zero) {
            config.options.scales.y.beginAtZero = channelSemantics.y.zero.zero !== false;
        }

        const baseDataset = {
            // Straight segments + visible end points.
            tension: 0,
            pointRadius: 4,
            backgroundColor: 'transparent',
            fill: false,
        };

        if (groupField) {
            const groups = groupBy(table, groupField);
            config.options.plugins.legend = { display: true };
            let colorIdx = 0;
            for (const [name, rows] of groups) {
                config.data.datasets.push({
                    label: name,
                    data: buildCategoryAlignedData(rows, xField, yField, categories),
                    borderColor: getSeriesBorderColor(palette, colorIdx),
                    ...baseDataset,
                });
                colorIdx++;
            }
        } else {
            config.data.datasets.push({
                label: yField,
                data: buildCategoryAlignedData(table, xField, yField, categories),
                borderColor: getSeriesBorderColor(palette, 0),
                ...baseDataset,
            });
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
};
