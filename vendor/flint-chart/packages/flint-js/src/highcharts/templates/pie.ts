// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Pie Chart template. Axis-less: the color channel names the slices
// and the size channel carries their measure; with neither, rows are counted.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories } from './utils';

export const hcPieChartDef: ChartTemplateDef = {
    chart: 'Pie Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['size', 'color'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const colorField = channelSemantics.color?.field;
        const sizeField = channelSemantics.size?.field;

        const data: { name: string; y: number }[] = [];

        if (colorField) {
            const agg = new Map<string, number>();
            for (const row of table) {
                const cat = String(row[colorField] ?? '');
                const v = sizeField ? Number(row[sizeField]) : 1;
                if (Number.isFinite(v)) agg.set(cat, (agg.get(cat) ?? 0) + v);
            }
            const categories = extractCategories(table, colorField, channelSemantics.color?.ordinalSortOrder);
            for (const cat of categories) data.push({ name: cat, y: agg.get(cat) ?? 0 });
        } else if (sizeField) {
            for (const row of table) {
                const v = Number(row[sizeField]);
                if (Number.isFinite(v)) data.push({ name: String(v), y: v });
            }
        }

        const innerRadius = Number(chartProperties?.innerRadius ?? 0);
        const labelType = chartProperties?.labelType ?? 'categoryPercent';
        const formats: Record<string, string | undefined> = {
            none: undefined,
            category: '{point.name}',
            value: '{point.y}',
            percent: '{point.percentage:.1f}%',
            categoryPercent: '{point.name}: {point.percentage:.1f}%',
        };

        const option: any = {
            chart: { type: 'pie' },
            series: [{
                type: 'pie',
                name: sizeField ?? 'Count',
                data,
                dataLabels: {
                    enabled: labelType !== 'none',
                    format: formats[labelType] ?? formats.categoryPercent,
                },
                showInLegend: true,
            }],
            legend: { enabled: true, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'item', categoryLabel: colorField ?? 'Category', valueLabel: sizeField ?? 'Value' },
        };

        if (innerRadius > 0) {
            option.series[0].innerSize = `${Math.min(90, innerRadius)}%`;
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'innerRadius', label: 'Donut', type: 'continuous', min: 0, max: 60, step: 5, defaultValue: 0 } as ChartPropertyDef,
        {
            key: 'labelType', label: 'Labels', type: 'discrete',
            options: [
                { value: 'categoryPercent', label: 'Name + %' },
                { value: 'category', label: 'Name' },
                { value: 'value', label: 'Value' },
                { value: 'percent', label: 'Percent' },
                { value: 'none', label: 'None' },
            ],
            defaultValue: 'categoryPercent',
        } as ChartPropertyDef,
    ],
};
