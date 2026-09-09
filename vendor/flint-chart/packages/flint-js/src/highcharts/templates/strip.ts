// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Strip Plot — a scatter whose x is a category, with each point
// jittered inside its band so overlapping observations stay visible. The jitter
// is deterministic (derived from the row index) so output is reproducible.

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, getCategoryOrder } from './utils';

/** Deterministic offset in [-0.4, 0.4] of a category band. */
function jitter(index: number): number {
    const x = Math.sin(index * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 0.8 - 0.4;
}

export const hcStripPlotDef: ChartTemplateDef = {
    chart: 'Strip Plot',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yField = channelSemantics.y?.field;
        const catField = xCS?.field;
        if (!catField || !yField) return;

        const categories = extractCategories(table, catField, getCategoryOrder(ctx, 'x'));
        const indexOf = new Map(categories.map((c, i) => [c, i]));

        const colorField = channelSemantics.color?.field ?? channelSemantics.group?.field;
        const build = (rows: any[]) => rows
            .map((r, i) => {
                const cat = String(r[catField] ?? '');
                const slot = indexOf.get(cat);
                const y = Number(r[yField]);
                if (slot === undefined || !Number.isFinite(y)) return null;
                return [slot + jitter(i), y] as [number, number];
            })
            .filter((p): p is [number, number] => p !== null);

        const series: any[] = [];
        if (colorField) {
            const groups = new Map<string, any[]>();
            for (const r of table) {
                const k = String(r[colorField] ?? '');
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k)!.push(r);
            }
            for (const [name, rows] of groups) series.push({ name, type: 'scatter', data: build(rows) });
        } else {
            series.push({ name: yField, type: 'scatter', data: build(table) });
        }

        Object.assign(spec, {
            chart: { type: 'scatter' },
            xAxis: {
                type: 'category',
                categories,
                title: { text: catField },
                min: -0.5,
                max: categories.length - 0.5,
            },
            yAxis: { type: 'linear', title: { text: yField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'item', categoryLabel: catField, valueLabel: yField, groupLabel: colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
