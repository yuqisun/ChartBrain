// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Area Chart template. Same axis model as the line template
// (linear / datetime / category, with the same discrete-y and both-discrete
// fallbacks); a color channel stacks the areas.

import { ChartTemplateDef } from '../../core/types';
import {
    extractCategories, groupBy, getCategoryOrder,
    isDiscrete, hcAxisKind, isParseableTemporal, toEpochMs, sortTemporalCategories,
} from './utils';

export const hcAreaChartDef: ChartTemplateDef = {
    chart: 'Area Chart',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;

        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const xField = xCS?.field;
        const yField = yCS?.field;
        if (!xField || !yField) return;

        const colorField = channelSemantics.color?.field ?? channelSemantics.group?.field;
        const xKind = hcAxisKind(xCS);
        const useTime = xKind === 'datetime' && isParseableTemporal(table.map(r => r[xField]));
        const yContinuous = yCS?.type === 'quantitative' || yCS?.type === 'temporal';
        const series: any[] = [];

        if ((xKind === 'linear' || useTime) && yContinuous) {
            const xOf = (row: any) => (useTime ? toEpochMs(row[xField]) : Number(row[xField]));
            const toPairs = (rows: any[]) => {
                const agg = new Map<number, number>();
                for (const r of rows) {
                    const x = xOf(r);
                    const y = Number(r[yField]);
                    if (x === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue;
                    agg.set(x, (agg.get(x) ?? 0) + y);
                }
                return [...agg.entries()].sort((a, b) => a[0] - b[0]);
            };

            if (colorField) {
                for (const [name, rows] of groupBy(table, colorField)) {
                    series.push({ name, type: 'area', data: toPairs(rows) });
                }
            } else {
                series.push({ name: yField, type: 'area', data: toPairs(table) });
            }

            Object.assign(spec, {
                chart: { type: 'area' },
                xAxis: { type: useTime ? 'datetime' : 'linear', title: { text: xField } },
                yAxis: { type: 'linear', title: { text: yField } },
                series,
                legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
                _hcTooltip: { trigger: 'axis', categoryLabel: xField, valueLabel: yField, groupLabel: colorField },
            });
        } else {
            const catAxis: 'x' | 'y' = isDiscrete(xCS?.type) || xCS?.type === 'temporal' ? 'x' : 'y';
            const catField = channelSemantics[catAxis]?.field ?? xField;
            const valField = catAxis === 'x' ? yField : xField;
            const bothDiscrete =
                isDiscrete(channelSemantics.x?.type) && isDiscrete(channelSemantics.y?.type);
            const valueLabel = bothDiscrete ? 'Count' : valField;

            let categories = extractCategories(table, catField, getCategoryOrder(ctx, catAxis));
            if (channelSemantics[catAxis]?.type === 'temporal') {
                categories = sortTemporalCategories(categories);
            }

            const buildValues = (rows: any[]) => {
                const map = new Map<string, number>();
                for (const r of rows) {
                    const cat = String(r[catField] ?? '');
                    if (bothDiscrete) {
                        map.set(cat, (map.get(cat) ?? 0) + 1);
                        continue;
                    }
                    const v = Number(r[valField]);
                    if (Number.isFinite(v)) map.set(cat, (map.get(cat) ?? 0) + v);
                }
                return categories.map(c => (map.has(c) ? map.get(c)! : null));
            };

            if (colorField) {
                for (const [name, rows] of groupBy(table, colorField)) {
                    series.push({ name, type: 'area', data: buildValues(rows) });
                }
            } else {
                series.push({ name: valueLabel, type: 'area', data: buildValues(table) });
            }

            const axisOption = { type: 'category', categories, title: { text: catField } };
            const valueOption = { type: 'linear', title: { text: valueLabel } };

            Object.assign(spec, {
                chart: { type: 'area' },
                xAxis: catAxis === 'x' ? axisOption : valueOption,
                yAxis: catAxis === 'x' ? valueOption : axisOption,
                series,
                legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
                _hcTooltip: {
                    trigger: 'axis',
                    categoryLabel: catField,
                    valueLabel,
                    groupLabel: colorField,
                },
            });
        }

        // Stacked areas when split by color — the conventional reading.
        if (colorField) {
            spec.plotOptions = { ...(spec.plotOptions ?? {}), series: { stacking: 'normal' } };
        }

        delete spec.mark;
        delete spec.encoding;
    },
};
