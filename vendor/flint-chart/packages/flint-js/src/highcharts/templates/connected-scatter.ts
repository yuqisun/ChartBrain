// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Connected Scatter Plot — points joined in DATA ORDER (a path, not
// a sorted series). This is the one line-family template that must NOT sort by x.

import { ChartTemplateDef } from '../../core/types';
import { groupBy } from './utils';

export const hcConnectedScatterDef: ChartTemplateDef = {
    chart: 'Connected Scatter Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        if (!xField || !yField) return;

        const colorField = channelSemantics.color?.field ?? channelSemantics.group?.field;
        const toPairs = (rows: any[]) => rows
            .map(r => [Number(r[xField]), Number(r[yField])] as [number, number])
            .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));

        const series: any[] = [];
        if (colorField) {
            for (const [name, rows] of groupBy(table, colorField)) {
                series.push({ name, type: 'line', data: toPairs(rows), marker: { enabled: true, radius: 4 } });
            }
        } else {
            series.push({ name: yField, type: 'line', data: toPairs(table), marker: { enabled: true, radius: 4 } });
        }

        Object.assign(spec, {
            chart: { type: 'line' },
            xAxis: { type: 'linear', title: { text: xField } },
            yAxis: { type: 'linear', title: { text: yField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'axis', categoryLabel: xField, valueLabel: yField, groupLabel: colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
