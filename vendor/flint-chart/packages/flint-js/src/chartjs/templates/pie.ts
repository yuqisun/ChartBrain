// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Pie Chart template.
 *
 * Contrast with VL:
 *   VL: mark = "arc" with theta + color
 *   CJS: type = 'pie' or 'doughnut' with data = { labels, datasets[{data}] }
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import {
    extractCategories,
    getChartJsPalette,
    getSeriesBorderColor,
    getSeriesBackgroundColor,
} from './utils';

/**
 * Reorder parallel label/value arrays in place by slice value. 'descending'
 * leads with the largest slice, 'ascending' the smallest; anything else keeps
 * the incoming data/category order.
 */
export function sortSlicesInPlace(
    labels: string[],
    values: number[],
    sortSlices: unknown,
): void {
    if (sortSlices !== 'descending' && sortSlices !== 'ascending') return;
    const idx = values.map((_, i) => i);
    idx.sort((a, b) => (sortSlices === 'descending' ? values[b] - values[a] : values[a] - values[b]));
    const sortedLabels = idx.map((i) => labels[i]);
    const sortedValues = idx.map((i) => values[i]);
    labels.splice(0, labels.length, ...sortedLabels);
    values.splice(0, values.length, ...sortedValues);
}

const SORT_SLICES_PROPERTY: ChartPropertyDef = {
    key: 'sortSlices', label: 'Sort slices', type: 'discrete',
    options: [
        { value: 'none', label: 'Data order' },
        { value: 'descending', label: 'Largest first' },
        { value: 'ascending', label: 'Smallest first' },
    ],
    defaultValue: 'none',
};

export const cjsPieChartDef: ChartTemplateDef = {
    chart: 'Pie Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['size', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const colorField = channelSemantics.color?.field;
        const sizeField = channelSemantics.size?.field;

        const labels: string[] = [];
        const values: number[] = [];

        const palette = getChartJsPalette(ctx, 'color');

        if (colorField && sizeField) {
            // color = category (slice label), size = measure (slice value)
            const agg = new Map<string, number>();
            for (const row of table) {
                const cat = String(row[colorField] ?? '');
                const val = Number(row[sizeField]) || 0;
                agg.set(cat, (agg.get(cat) ?? 0) + val);
            }
            const categories = extractCategories(table, colorField, channelSemantics.color?.ordinalSortOrder);
            for (const cat of categories) {
                labels.push(cat);
                values.push(agg.get(cat) ?? 0);
            }
        } else if (colorField) {
            // No size field → count occurrences per category
            const counts = new Map<string, number>();
            for (const row of table) {
                const cat = String(row[colorField] ?? '');
                counts.set(cat, (counts.get(cat) ?? 0) + 1);
            }
            const categories = extractCategories(table, colorField, channelSemantics.color?.ordinalSortOrder);
            for (const cat of categories) {
                labels.push(cat);
                values.push(counts.get(cat) ?? 0);
            }
        } else if (sizeField) {
            for (const row of table) {
                const val = Number(row[sizeField]) || 0;
                labels.push(String(val));
                values.push(val);
            }
        }

        const innerRadius = chartProperties?.innerRadius ?? 0;
        const isDoughnut = innerRadius > 0;

        sortSlicesInPlace(labels, values, chartProperties?.sortSlices);

        const config: any = {
            type: isDoughnut ? 'doughnut' : 'pie',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: labels.map((_, i) => getSeriesBackgroundColor(palette, i, 0.6)),
                    borderColor: labels.map((_, i) => getSeriesBorderColor(palette, i)),
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'right' as const },
                    tooltip: { enabled: true },
                },
                ...(isDoughnut ? { cutout: `${innerRadius}%` } : {}),
            },
            // Canvas size from context (no axes)
            _width: Math.max(ctx.canvasSize.width, 300),
            _height: Math.max(ctx.canvasSize.height, 250),
        };

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'innerRadius', label: 'Donut', type: 'continuous', min: 0, max: 60, step: 5, defaultValue: 0 } as ChartPropertyDef,
        SORT_SLICES_PROPERTY,
    ],
};
