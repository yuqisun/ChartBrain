// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts template registry.

import { ChartTemplateDef } from '../../core/types';
import { hcBarChartDef, hcGroupedBarChartDef, hcStackedBarChartDef } from './bar';
import { hcLineChartDef } from './line';
import { hcAreaChartDef } from './area';
import { hcSlopeChartDef } from './slope';
import { hcScatterPlotDef } from './scatter';
import { hcConnectedScatterDef } from './connected-scatter';
import { hcPieChartDef } from './pie';
import { hcDonutChartDef } from './donut';

/** Highcharts chart template definitions, grouped by category. */
export const hcTemplateDefs: { [key: string]: ChartTemplateDef[] } = {
    'Scatter & Point': [hcScatterPlotDef, hcConnectedScatterDef],
    'Bar':             [hcBarChartDef, hcGroupedBarChartDef, hcStackedBarChartDef],
    'Line & Area':     [hcLineChartDef, hcAreaChartDef, hcSlopeChartDef],
    'Part-to-Whole':   [hcPieChartDef, hcDonutChartDef],
};

/** Flat list of all Highcharts chart template definitions. */
export const hcAllTemplateDefs: ChartTemplateDef[] = Object.values(hcTemplateDefs).flat();

/** Look up a Highcharts chart template definition by chart type name. */
export function hcGetTemplateDef(chartType: string): ChartTemplateDef | undefined {
    return hcAllTemplateDefs.find(t => t.chart === chartType);
}

/** Get the available channels for a Highcharts chart type. */
export function hcGetTemplateChannels(chartType: string): string[] {
    return hcGetTemplateDef(chartType)?.channels || [];
}
