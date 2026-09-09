// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Donut Chart — a pie with a hole. Mirrors the Vega-Lite backend's
// donutChartDef: property defaults are not merged into `chartProperties` at
// assemble time, so the non-zero default must be applied here before delegating.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { hcPieChartDef } from './pie';

const DONUT_DEFAULT_INNER_RADIUS = 50;

export const hcDonutChartDef: ChartTemplateDef = {
    ...hcPieChartDef,
    chart: 'Donut Chart',
    properties: (hcPieChartDef.properties ?? []).map(p =>
        p.key === 'innerRadius' ? { ...p, defaultValue: DONUT_DEFAULT_INNER_RADIUS } : p,
    ) as ChartPropertyDef[],
    instantiate: (spec, ctx) => {
        const innerRadius = ctx.chartProperties?.innerRadius;
        const withHole = innerRadius == null
            ? {
                ...ctx,
                chartProperties: { ...(ctx.chartProperties ?? {}), innerRadius: DONUT_DEFAULT_INNER_RADIUS },
            }
            : ctx;
        hcPieChartDef.instantiate(spec, withHole);
    },
};
