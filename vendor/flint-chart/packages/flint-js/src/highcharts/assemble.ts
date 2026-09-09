// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.

/**
 * Highcharts chart assembly — pipeline coordinator.
 *
 * Reuses the **same core analysis pipeline** as Vega-Lite / ECharts:
 *   PRE-PHASE  normalizeStaticSeries / applyEncodingOverrides / applyAggregation
 *   Phase 0    resolveChannelSemantics → ChannelSemantics (+ zero finalization)
 *   Step 0a    declareLayoutMode       → LayoutDeclaration
 *   Step 0b    convertTemporalData, filterOverflow
 *   Phase 1    computeLayout           → LayoutResult
 *   Phase 2    template.instantiate → hcApplyLayoutToSpec → hcApplyTooltips
 *
 * ── Backend translation responsibilities ─────────────────────────────
 * LayoutResult is target-agnostic; this assembler turns it into Highcharts
 * structures (see `instantiate-spec.ts`):
 *   subplotWidth / subplotHeight → chart.width / chart.height
 *   xStep / stepPadding          → series[].pointWidth
 *   xLabel / yLabel              → xAxis.labels.rotation + font sizes
 *
 * Deliberately out of scope in v1 (documented in `README.md`):
 *   faceting (Highcharts has no native facet grid), chartProperties-driven
 *   chart-type transforms, and resolved-encoding sort overrides.
 */

import {
    ChartAssemblyInput,
    ChartEncoding,
    ChartTemplateDef,
    AssembleOptions,
    LayoutDeclaration,
    InstantiateContext,
} from '../core/types';
import type { ChartWarning } from '../core/types';
import { applyEncodingOverrides } from '../core/encoding-overrides';
import { applyAggregation } from '../core/aggregate';
import { normalizeStaticSeries } from '../core/static-series';
import { normalizeChartProperties } from '../core/normalize-properties';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { filterOverflow } from '../core/filter-overflow';
import {
    computeLayout,
    computeChannelBudgets,
    deriveStretchCaps,
    resolveBaseSize,
    resolveFacetColumnsOption,
} from '../core/compute-layout';
import { computeZeroDecision } from '../core/semantic-types';
import { decideColorMaps } from '../core/color-decisions';
import { hcGetTemplateDef } from './templates';
import { hcApplyLayoutToSpec, hcApplyTooltips } from './instantiate-spec';

/** Localized display names for fields (column → display label). */
function applyFieldDisplayNames(option: any, names: Record<string, string> | undefined): void {
    if (!names) return;
    const displayName = (value: unknown) =>
        typeof value === 'string' ? names[value] ?? value : value;

    for (const axisKey of ['xAxis', 'yAxis']) {
        const axes = Array.isArray(option[axisKey]) ? option[axisKey] : [option[axisKey]];
        for (const axis of axes) {
            if (axis?.title?.text) axis.title.text = displayName(axis.title.text);
        }
    }
    for (const series of option.series ?? []) {
        if (series?.name) series.name = displayName(series.name);
    }
}

/**
 * Assemble a Highcharts options object.
 *
 * ```ts
 * const option = assembleHighcharts({
 *   data: { values: myRows },
 *   semantic_types: { weight: 'Quantity' },
 *   chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'category' }, y: { field: 'value' } } },
 * });
 * // → Highcharts.chart('container', option)
 * ```
 *
 * @returns A Highcharts options object with optional `_warnings`, `_width`, `_height` hints
 */
export function assembleHighcharts(input: ChartAssemblyInput): any {
    const chartType = input.chart_spec.chartType;
    const semanticTypes = input.semantic_types ?? {};
    const sizeCeiling = input.chart_spec.canvasSize;
    const baseSize = resolveBaseSize(input.chart_spec.baseSize, sizeCeiling);
    const canvasSize = baseSize;
    const options = input.options ?? {};

    const chartTemplate = hcGetTemplateDef(chartType) as ChartTemplateDef;
    if (!chartTemplate) {
        throw new Error(
            `Unknown Highcharts chart type: ${chartType}. Use hcAllTemplateDefs to see available types.`,
        );
    }

    const warnings: ChartWarning[] = [];

    const normalizedProps = normalizeChartProperties(
        chartTemplate.properties, input.chart_spec.chartProperties,
    );
    const chartProperties = normalizedProps.chartProperties;
    warnings.push(...normalizedProps.warnings);

    // ═══════════════════════════════════════════════════════════════════
    // PRE-PHASE: static series normalization + encoding resolution
    // ═══════════════════════════════════════════════════════════════════
    const rawData = input.data.values ?? [];
    const normalized = normalizeStaticSeries(input.chart_spec.encodings, rawData, semanticTypes);
    let data = normalized.data;
    const staticSeries = normalized.staticSeries;

    const prelimConvertedData = convertTemporalData(data, semanticTypes);
    const prelimSemantics = resolveChannelSemantics(
        normalized.encodings, data, semanticTypes, prelimConvertedData,
    );
    const typedRawEncodings: Record<string, ChartEncoding> = {};
    for (const [ch, enc] of Object.entries(normalized.encodings)) {
        typedRawEncodings[ch] = enc.type
            ? enc
            : { ...enc, type: prelimSemantics[ch]?.type };
    }

    const encodings = applyEncodingOverrides(chartTemplate, typedRawEncodings, chartProperties);
    data = applyAggregation(encodings, data);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 0: resolve semantics (shared with VL / ECharts)
    // ═══════════════════════════════════════════════════════════════════
    const tplMark = chartTemplate.template?.mark;
    const templateMarkType = typeof tplMark === 'string' ? tplMark : tplMark?.type;

    const convertedData = convertTemporalData(data, semanticTypes);
    const channelSemantics = resolveChannelSemantics(encodings, data, semanticTypes, convertedData);

    const effectiveMarkType = templateMarkType || 'point';
    for (const [channel, cs] of Object.entries(channelSemantics)) {
        if ((channel === 'x' || channel === 'y') && cs.type === 'quantitative') {
            const numericValues = data
                .map(r => r[cs.field])
                .filter((v: any) => v != null && typeof v === 'number' && !isNaN(v));
            cs.zero = computeZeroDecision(
                cs.semanticAnnotation.semanticType, channel, effectiveMarkType, numericValues,
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 0a: declareLayoutMode
    // ═══════════════════════════════════════════════════════════════════
    const declaration: LayoutDeclaration = chartTemplate.declareLayoutMode
        ? chartTemplate.declareLayoutMode(channelSemantics, data, chartProperties)
        : {};

    const effectiveOptions: AssembleOptions = {
        // Highcharts' native category bands are slightly wider than ECharts'.
        defaultBandSize: 24,
        bandStepFit: 1,
        maxBandSize: 100,
        baseLabelFontSize: 11,
        baseTitleFontSize: 12,
        ...options,
        ...(declaration.paramOverrides || {}),
    };

    Object.assign(effectiveOptions, deriveStretchCaps(baseSize, sizeCeiling, effectiveOptions));
    effectiveOptions.bandStepFitCapacityX = sizeCeiling?.width ?? baseSize.width;
    effectiveOptions.bandStepFitCapacityY = sizeCeiling?.height ?? baseSize.height;
    effectiveOptions.facetColumns = resolveFacetColumnsOption(input.chart_spec.chartProperties);

    const { addTooltips: addTooltipsOpt = true } = effectiveOptions;

    // ═══════════════════════════════════════════════════════════════════
    // STEP 0b: channel budgets + overflow filtering
    // ═══════════════════════════════════════════════════════════════════
    const allMarkTypes = new Set<string>();
    if (templateMarkType) allMarkTypes.add(templateMarkType);

    const budgets = computeChannelBudgets(
        channelSemantics, declaration, convertedData, canvasSize, effectiveOptions,
    );
    const facetGridResult = budgets.facetGrid;

    const overflowResult = filterOverflow(
        channelSemantics, declaration, encodings, convertedData, budgets, allMarkTypes,
    );

    const values = overflowResult.filteredData;
    warnings.push(...overflowResult.warnings);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1: compute layout (shared)
    // ═══════════════════════════════════════════════════════════════════
    const layoutResult = computeLayout(
        channelSemantics, declaration, values, canvasSize, effectiveOptions, facetGridResult,
    );
    layoutResult.truncations = overflowResult.truncations;

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: instantiate Highcharts option
    // ═══════════════════════════════════════════════════════════════════
    const colorDecisions = decideColorMaps({
        chartType,
        encodings,
        channelSemantics,
        table: values,
        background: 'light',
    });

    const instantiateContext: InstantiateContext = {
        channelSemantics,
        layout: layoutResult,
        table: values,
        fullTable: convertedData,
        // v1 leaves this empty: `getCategoryOrder` falls back to
        // channelSemantics.ordinalSortOrder / encodings.sortBy, which covers
        // the shared Sort action without a backend-specific encoding builder.
        resolvedEncodings: {},
        encodings,
        chartProperties,
        staticSeries,
        canvasSize,
        semanticTypes,
        chartType,
        assembleOptions: effectiveOptions,
        colorDecisions,
    };

    const hcOption: any = structuredClone(chartTemplate.template);

    // The spec title must be present before layout runs so the title font size
    // decision can see it.
    if (input.chart_spec.title) {
        hcOption.title = { ...(hcOption.title ?? {}), text: input.chart_spec.title };
    }

    chartTemplate.instantiate(hcOption, instantiateContext);
    hcApplyLayoutToSpec(hcOption, instantiateContext);
    if (addTooltipsOpt) hcApplyTooltips(hcOption);
    if (chartTemplate.postProcess) chartTemplate.postProcess(hcOption, instantiateContext);

    // ═══════════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════════
    if (warnings.length > 0) hcOption._warnings = warnings;
    hcOption._dataLength = values.length;

    applyFieldDisplayNames(hcOption, input.field_display_names);

    return hcOption;
}
