// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Bullet Chart — one row per label: a measure bar against its own
 * target, set on muted gray qualitative bands (mirror vegalite/templates/bullet.ts).
 *
 * Channels:
 *   - y      label (banded category axis — one row per KPI)
 *   - x      measured value (bar from a zero baseline)
 *   - goal   target / comparative value (a dark tick across the bar)
 *   - color  optional explicit grouping for the value bar
 *
 * Following Stephen Few's design, each row carries graduated gray bands at
 * quarters of its own goal (0–25 / 25–50 / 50–75%); the 75–100% range is left
 * white so the bar and target tick stay focal. The bands are wide stacked bars;
 * the narrower value bar is overlaid concentrically (`barGap: '-100%'`) and
 * colored by goal attainment; the target is a tall thin rect marker.
 */

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, getCategoryOrder } from './utils';

// Muted grays for the qualitative zones, darkest nearest zero (poorest range).
const ZONE_GRAYS = ['#e2e2e2', '#ececec', '#f5f5f5'];
// Goal-attainment colors: muted red for under target, muted green for met.
const STATUS_COLORS = { below: '#c44e52', met: '#2f855a' };
const STATUS_BELOW = 'Below target';
const STATUS_MET = 'Meets target';

export const ecBulletChartDef: ChartTemplateDef = {
    chart: 'Bullet Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['y', 'x', 'goal', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { y: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const labelField = channelSemantics.y?.field;
        const valueField = channelSemantics.x?.field;
        const goalField = channelSemantics.goal?.field;
        if (!labelField || !valueField || table.length === 0) return;

        const categories = extractCategories(
            table, labelField, getCategoryOrder(ctx, 'y') ?? channelSemantics.y?.ordinalSortOrder,
        );

        const byCat = new Map<string, any>();
        for (const r of table) byCat.set(String(r[labelField] ?? ''), r);

        const valueOf = (cat: string) => Number(byCat.get(cat)?.[valueField]);
        const goalOf = (cat: string) =>
            goalField != null ? Number(byCat.get(cat)?.[goalField]) : NaN;

        // Per-row gray band widths (each a quarter of that row's goal).
        const band1: number[] = [];
        const band2: number[] = [];
        const band3: number[] = [];
        for (const cat of categories) {
            const g = goalOf(cat);
            const q = Number.isFinite(g) && g > 0 ? g / 4 : 0;
            band1.push(q);
            band2.push(q);
            band3.push(q);
        }

        // Value bar, colored per row by goal attainment.
        const valueData = categories.map((cat) => {
            const v = valueOf(cat);
            const g = goalOf(cat);
            const met = Number.isFinite(g) ? v >= g : true;
            return {
                value: Number.isFinite(v) ? v : 0,
                itemStyle: { color: met ? STATUS_COLORS.met : STATUS_COLORS.below },
            };
        });

        // Target tick: a tall thin rect at the goal, sized to the row band.
        const band = ctx.layout?.yStep;
        const tickH = band && band > 0 ? Math.min(band, Math.max(8, Math.round(band * 0.72))) : 18;
        const goalData = goalField
            ? categories
                .map((cat) => ({ value: [goalOf(cat), cat] }))
                .filter((d) => Number.isFinite(d.value[0] as number))
            : [];

        const bandSeries = [band1, band2, band3].map((data, i) => ({
            type: 'bar' as const,
            name: `_band${i}`,
            stack: 'bullet-bands',
            data,
            barWidth: '62%',
            itemStyle: { color: ZONE_GRAYS[i] },
            silent: true,
            emphasis: { disabled: true },
            z: 1,
        }));

        const option: any = {
            tooltip: {
                trigger: 'item',
                formatter: (p: any) => {
                    if (typeof p.seriesName === 'string' && p.seriesName.startsWith('_')) return '';
                    const cat = categories[p.dataIndex] ?? '';
                    const v = valueOf(cat);
                    const g = goalOf(cat);
                    const goalLine = Number.isFinite(g) ? `<br/>${goalField}: ${g}` : '';
                    return `${cat}<br/>${valueField}: ${v}${goalLine}`;
                },
            },
            legend: goalField ? { data: [STATUS_BELOW, STATUS_MET], top: 0 } : undefined,
            grid: { containLabel: true, top: goalField ? 40 : 20 },
            xAxis: {
                type: 'value',
                min: 0,
                name: valueField,
                nameLocation: 'middle',
                nameGap: 30,
            },
            yAxis: {
                type: 'category',
                data: categories,
                inverse: true,
                axisTick: { show: false },
                axisLabel: { interval: 0 },
            },
            series: [
                ...bandSeries,
                {
                    type: 'bar',
                    name: 'value',
                    data: valueData,
                    barWidth: '34%',
                    barGap: '-100%',
                    z: 2,
                },
                {
                    type: 'scatter',
                    name: 'target',
                    data: goalData,
                    symbol: 'rect',
                    symbolSize: [4, tickH],
                    itemStyle: { color: '#1a1a1a' },
                    z: 4,
                    silent: true,
                },
                // Legend-only series for the status colors (no bar slots).
                ...(goalField
                    ? [
                        { type: 'scatter' as const, name: STATUS_BELOW, data: [], itemStyle: { color: STATUS_COLORS.below } },
                        { type: 'scatter' as const, name: STATUS_MET, data: [], itemStyle: { color: STATUS_COLORS.met } },
                    ]
                    : []),
            ],
        };

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};
