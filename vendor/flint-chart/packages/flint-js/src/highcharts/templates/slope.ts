// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts Slope Chart — line + end-point markers (two periods are the most
// common use, but the template does not enforce exactly two points). Reuses
// the line template (category axis, one series per group) and turns markers on.
//
// Delegation contract: this template relies on `hcLineChartDef.instantiate`
// writing `series` into `spec` on its success path, then post-processes
// `spec.series` in place. If line's early-return (missing x/y) or its output
// shape changes (e.g. the `series` key is renamed), re-check this file — a
// silent early return here would ship a marker-less line config without error.

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
