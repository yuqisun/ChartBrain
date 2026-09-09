// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Scatter Plot template. Both position channels are measures, so
// points are emitted as [x, y] pairs on linear axes.

import { ChartTemplateDef } from '../../core/types';
import { groupBy } from './utils';

export const hcScatterPlotDef: ChartTemplateDef = {
    chart: 'Scatter Plot',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color', 'size'],
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
                series.push({ name, type: 'scatter', data: toPairs(rows) });
            }
        } else {
            series.push({ name: yField, type: 'scatter', data: toPairs(table) });
        }

        const option: any = {
            chart: { type: 'scatter' },
            xAxis: { type: 'linear', title: { text: xField } },
            yAxis: { type: 'linear', title: { text: yField } },
            series,
            legend: { enabled: series.length > 1, title: { text: colorField ?? '' } },
            _hcTooltip: { trigger: 'item', categoryLabel: xField, valueLabel: yField, groupLabel: colorField },
        };

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};
