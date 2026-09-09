// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts backend barrel.

export { assembleHighcharts } from './assemble';
export { hcApplyLayoutToSpec, hcApplyTooltips } from './instantiate-spec';
export {
    hcTemplateDefs,
    hcAllTemplateDefs,
    hcGetTemplateDef,
    hcGetTemplateChannels,
} from './templates';
export {
    pickHighchartsPalette,
    getHighchartsPaletteForScheme,
    HC_DEFAULT_COLORS,
    type HighchartsColorMapDef,
    type HighchartsPaletteId,
} from './colormap';
