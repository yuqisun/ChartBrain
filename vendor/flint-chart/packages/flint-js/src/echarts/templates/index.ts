// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts template registry.
 *
 * Mirrors the structure of vegalite/templates/index.ts but with ECharts
 * template definitions.
 */

import { ChartTemplateDef } from '../../core/types';
import { ecScatterPlotDef, ecRegressionDef } from './scatter';
import { ecConnectedScatterDef } from './connected-scatter';
import { ecBarChartDef, ecStackedBarChartDef, ecGroupedBarChartDef } from './bar';
import { ecLineChartDef, ecBumpChartDef } from './line';
import { ecSlopeChartDef } from './slope';
import { ecAreaChartDef } from './area';
import { ecRangeAreaChartDef } from './range-area';
import { ecPieChartDef } from './pie';
import { ecHeatmapDef } from './heatmap';
import { ecHistogramDef } from './histogram';
import { ecBoxplotDef } from './boxplot';
import { ecRadarChartDef } from './radar';
import { ecCandlestickDef } from './candlestick';
import { ecStreamgraphDef } from './streamgraph';
import { ecRoseChartDef } from './rose';
import { ecGaugeChartDef } from './gauge';
import { ecFunnelChartDef } from './funnel';
import { ecTreemapDef } from './treemap';
import { ecSunburstDef } from './sunburst';
import { ecSankeyDef } from './sankey';
import { ecLollipopChartDef } from './lollipop';
import { ecStripPlotDef } from './jitter';
import { ecWaterfallChartDef } from './waterfall';
import { ecPyramidChartDef } from './pyramid';
import { ecRangedDotPlotDef } from './ranged-dot';
import { ecDensityPlotDef } from './density';
import { ecEcdfPlotDef } from './ecdf';
import { ecCalendarHeatmapDef } from './calendar';
import { ecParallelCoordinatesDef } from './parallel';
import { ecGraphDef } from './graph';
import { ecTreeDef } from './tree';
import { ecGanttChartDef } from './gantt';
import { ecBulletChartDef } from './bullet';

/**
 * ECharts chart template definitions, grouped by category.
 * Mirrors vegalite/templates/index.ts so VegaLite test cases can run through ECharts.
 */
export const ecTemplateDefs: { [key: string]: ChartTemplateDef[] } = {
    'Scatter & Point': [ecScatterPlotDef, ecRegressionDef, ecConnectedScatterDef, ecRangedDotPlotDef, ecBoxplotDef, ecStripPlotDef],
    'Bar':             [ecBarChartDef, ecGroupedBarChartDef, ecStackedBarChartDef, ecLollipopChartDef, ecPyramidChartDef, ecHeatmapDef, ecCalendarHeatmapDef],
    'Line & Area':     [ecLineChartDef, ecBumpChartDef, ecSlopeChartDef, ecAreaChartDef, ecStreamgraphDef, ecRangeAreaChartDef],
    'Part-to-Whole':   [ecPieChartDef, ecFunnelChartDef, ecTreemapDef, ecSunburstDef, ecTreeDef],
    'Statistical':     [ecHistogramDef, ecDensityPlotDef, ecEcdfPlotDef, ecParallelCoordinatesDef],
    'Financial':       [ecCandlestickDef],
    'Other':           [ecWaterfallChartDef, ecGanttChartDef, ecBulletChartDef],
    'Polar':           [ecRadarChartDef, ecRoseChartDef],
    'Indicator':       [ecGaugeChartDef],
    'Flow':            [ecSankeyDef, ecGraphDef],
};

/**
 * Flat list of all ECharts chart template definitions.
 */
export const ecAllTemplateDefs: ChartTemplateDef[] = Object.values(ecTemplateDefs).flat();

/**
 * Look up an ECharts chart template definition by chart type name.
 */
export function ecGetTemplateDef(chartType: string): ChartTemplateDef | undefined {
    return ecAllTemplateDefs.find(t => t.chart === chartType);
}

/**
 * Get the available channels for an ECharts chart type.
 */
export function ecGetTemplateChannels(chartType: string): string[] {
    return ecGetTemplateDef(chartType)?.channels || [];
}
