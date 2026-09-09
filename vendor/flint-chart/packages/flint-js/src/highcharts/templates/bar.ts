// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Bar Chart template (vertical columns by default, horizontal when
// the category axis is `y`).
//
// Contrast with ECharts: ECharts stacks via `series[].stack`; Highcharts stacks
// via `plotOptions.series.stacking`. Grouped vs stacked is therefore expressed
// once at plotOptions level instead of per series.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { detectBandedAxisFromSemantics } from '../../core/axis-detection';
import {
    extractCategories, groupBy, detectAxes, getCategoryOrder,
    isDiscrete, buildCategoryValues, buildCategoryCounts,
    buildGroupValueMatrix, buildGroupCountMatrix, sortTemporalCategories,
} from './utils';

export const hcBarChartDef: ChartTemplateDef = {
    chart: 'Bar Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const valCS = channelSemantics[valueAxis];
        const colorField = channelSemantics.color?.field ?? channelSemantics.group?.field;
        const isHorizontal = categoryAxis === 'y';
        // Highcharts renders the series type, so a horizontal chart needs `bar`
        // (not `column`) on every series or the bars come out vertical.
        const markType = isHorizontal ? 'bar' : 'column';

        let categories = extractCategories(table, catField, getCategoryOrder(ctx, categoryAxis));
        if (catCS?.type === 'temporal') categories = sortTemporalCategories(categories);

        const series: any[] = [];
        const bothDiscrete = isDiscrete(channelSemantics.x?.type) && isDiscrete(channelSemantics.y?.type);

        if (bothDiscrete) {
            // x = category, y = second category → count rows per (x, y) pair,
            // one series per y value. (ECharts renders a heatmap here; a grouped
            // count column chart is the more conventional Highcharts output.)
            const groups = extractCategories(table, valField, getCategoryOrder(ctx, valueAxis));
            const matrix = buildGroupCountMatrix(table, catField, valField, categories, groups);
            groups.forEach((name, i) => {
                series.push({ name, type: markType, data: matrix[i] });
            });
        } else if (colorField) {
            // color + measure → stacked bars (Highcharts convention).
            const groups = groupBy(table, colorField);
            const names = [...groups.keys()];
            const useCounts = valCS?.type === 'temporal';
            const matrix = useCounts
                ? names.map(name => buildCategoryCounts(groups.get(name)!, catField, categories))
                : buildGroupValueMatrix(table, catField, valField, colorField, categories, names);
            names.forEach((name, i) => {
                series.push({ name, type: markType, data: matrix[i] });
            });
        } else {
            const data = valCS?.type === 'temporal'
                ? buildCategoryCounts(table, catField, categories)
                : buildCategoryValues(table, catField, valField, categories);
            series.push({ name: valCS?.type === 'temporal' ? 'Count' : valField, type: markType, data });
        }

        const option: any = {
            chart: { type: isHorizontal ? 'bar' : 'column' },
            xAxis: isHorizontal
                ? { type: 'linear', title: { text: valCS?.type === 'temporal' ? 'Count' : valField } }
                : { type: 'category', categories, title: { text: catField } },
            yAxis: isHorizontal
                ? { type: 'category', categories, title: { text: catField } }
                : { type: 'linear', title: { text: valCS?.type === 'temporal' ? 'Count' : valField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: {
                trigger: 'axis',
                categoryLabel: catField,
                valueLabel: valCS?.type === 'temporal' ? 'Count' : valField,
                groupLabel: colorField,
            },
        };

        // color + measure stacks; plain category counts do not.
        if (colorField && !bothDiscrete) {
            option.plotOptions = { series: { stacking: 'normal' } };
        }

        const cornerRadius = chartProperties?.cornerRadius;
        if (typeof cornerRadius === 'number' && cornerRadius > 0) {
            option.plotOptions = {
                ...(option.plotOptions ?? {}),
                column: { borderRadius: cornerRadius },
            };
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'cornerRadius', label: 'Corners', type: 'continuous', min: 0, max: 15, step: 1, defaultValue: 0 },
    ] as ChartPropertyDef[],
};
