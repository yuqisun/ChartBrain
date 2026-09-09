// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Slope Chart (slopegraph) template.
 *
 * One straight line **per category** connecting that category's value at exactly
 * **two periods**, with a point marker at each end. The read is the slope /
 * direction of change and the crossovers between categories — the 2-point
 * value-change cousin of the Bump Chart, so this mirrors ecBumpChartDef /
 * ecLineChartDef wherever practical.
 *
 * Contract:
 *   x      — period, rendered as a *category* axis with exactly two positions
 *            (temporal / numeric period fields are bucketed into two ordered
 *            category labels, so the slope — not the gap — carries meaning).
 *   y      — value (quantitative).
 *   color  — category → one line per value (legend).
 *   detail — category → one line per value (used when color is absent).
 *
 * The line is always straight (no `smooth`) and shows symbols at both ends.
 */

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, groupBy, getCategoryOrder } from './utils';

/**
 * Order the period categories naturally: numerically when every label parses as
 * a number, chronologically when every label parses as a date, else preserve
 * the order ECharts already extracted from the data.
 */
function orderPeriods(categories: string[]): string[] {
    if (categories.length <= 1) return categories;
    const allNumeric = categories.every(c => c.trim() !== '' && !isNaN(Number(c)));
    if (allNumeric) return [...categories].sort((a, b) => Number(a) - Number(b));
    const allDates = categories.every(c => !isNaN(Date.parse(c)));
    if (allDates) return [...categories].sort((a, b) => Date.parse(a) - Date.parse(b));
    return categories;
}

/** Align a group's rows to the shared period categories → y value per period. */
function alignToPeriods(
    rows: any[],
    xField: string,
    yField: string,
    categories: string[],
): (number | null)[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        const v = row[yField];
        if (v != null && !isNaN(Number(v))) map.set(String(row[xField]), Number(v));
    }
    return categories.map(cat => {
        const v = map.get(cat);
        return v != null ? v : null;
    });
}

export const ecSlopeChartDef: ChartTemplateDef = {
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
        // One line per category: prefer the color field, fall back to detail.
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        // The period axis is always a two-band category axis (slopegraph).
        const categories = orderPeriods(extractCategories(table, xField, getCategoryOrder(ctx, 'x')));

        const option: any = {
            tooltip: { trigger: 'axis' },
            xAxis: {
                type: 'category',
                data: categories,
                name: xField,
                nameLocation: 'middle',
                nameGap: 30,
                boundaryGap: true,
                axisLine: { show: true },
                axisTick: { show: true, alignWithLabel: true },
                axisLabel: { rotate: 0 },
            },
            yAxis: {
                type: 'value',
                name: yField,
                nameLocation: 'middle',
                nameGap: 40,
                axisTick: { show: true },
                axisLabel: { rotate: 0 },
            },
            series: [],
        };
        option._encodingTooltip = { trigger: 'axis', categoryLabel: xField, valueLabel: yField };

        // Slope charts emphasize the change, not the absolute level, so let the
        // value axis fit the data unless the zero decision says otherwise.
        if (channelSemantics.y?.zero) {
            option.yAxis.scale = !channelSemantics.y.zero.zero;
        } else {
            option.yAxis.scale = true;
        }

        const baseSeriesOpt = {
            type: 'line' as const,
            showSymbol: true,
            symbol: 'circle' as const,
            symbolSize: 7,
            // Straight segments — never smooth/monotone for a slopegraph.
            smooth: false as const,
        };

        if (groupField) {
            const groups = groupBy(table, groupField);
            option.legend = { data: [...groups.keys()] };
            for (const [name, rows] of groups) {
                option.series.push({
                    name,
                    ...baseSeriesOpt,
                    data: alignToPeriods(rows, xField, yField, categories),
                    // Colors assigned by ecApplyLayoutToSpec from colorDecisions.
                });
            }
        } else {
            option.series.push({
                ...baseSeriesOpt,
                data: alignToPeriods(table, xField, yField, categories),
            });
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};
