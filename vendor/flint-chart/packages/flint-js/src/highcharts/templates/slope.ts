// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Slope Chart — two periods joined per entity. Reuses the line
// template (category axis, one series per group) and adds end-point markers.

import { ChartTemplateDef } from '../../core/types';
import { hcLineChartDef } from './line';

export const hcSlopeChartDef: ChartTemplateDef = {
    ...hcLineChartDef,
    chart: 'Slope Chart',
    instantiate: (spec, ctx) => {
        hcLineChartDef.instantiate(spec, ctx);
        for (const s of spec.series ?? []) {
            s.marker = { enabled: true, radius: 4 };
        }
    },
};
