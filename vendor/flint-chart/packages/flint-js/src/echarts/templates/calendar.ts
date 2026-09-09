// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Calendar Heatmap template.
 *
 * Contrast with VL:
 *   VL: has no first-class calendar; would fake it with rect + computed
 *       week/day fields.
 *   EC: a `calendar` coordinate system + a `heatmap` series bound to it
 *       (coordinateSystem: 'calendar'), plus a continuous `visualMap`.
 *
 * Encoding:
 *   x     (temporal) → the date of each cell
 *   color (quantitative) → the cell value (defaults to a count of 1)
 */

import { ChartTemplateDef, EncodingActionDef } from '../../core/types';
import { getPaletteForScheme } from '../colormap';

/** Sequential color ramps (low → high). Mirrors heatmap's scheme vocabulary. */
const SCHEME_COLORS: Record<string, string[]> = {
    viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
    blues: ['#f7fbff', '#6baed6', '#08519c'],
    greens: ['#f7fcf5', '#74c476', '#00441b'],
    reds: ['#fff5f0', '#fb6a4a', '#a50f15'],
    oranges: ['#fff5eb', '#fd8d3c', '#7f2704'],
    purples: ['#fcfbfd', '#9e9ac8', '#3f007d'],
    github: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
};

/** Coerce a raw cell key into a 'YYYY-MM-DD' string, regardless of upstream temporal conversion. */
function toDateString(raw: unknown): string | null {
    if (raw == null) return null;
    let d: Date;
    if (raw instanceof Date) {
        d = raw;
    } else if (typeof raw === 'number' && isFinite(raw)) {
        // Treat as epoch (ms if large, seconds otherwise).
        d = new Date(raw < 1e12 ? raw * 1000 : raw);
    } else {
        const s = String(raw).trim();
        d = new Date(s);
        if (isNaN(d.getTime())) return null;
    }
    if (isNaN(d.getTime())) return null;
    // Use UTC components so the labelled day matches the source date.
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export const ecCalendarHeatmapDef: ChartTemplateDef = {
    chart: 'Calendar Heatmap',
    template: { mark: 'rect', encoding: {} },
    channels: ['x', 'color'],
    markCognitiveChannel: 'color',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, colorDecisions, encodings } = ctx;
        const dateField = channelSemantics.x?.field;
        const valueField = channelSemantics.color?.field;
        if (!dateField) return;

        // Aggregate to one value per calendar day (sum when multiple rows share a date).
        const cellMap = new Map<string, number>();
        for (const row of table) {
            const dateStr = toDateString(row[dateField]);
            if (!dateStr) continue;
            const val = valueField ? (Number(row[valueField]) || 0) : 1;
            cellMap.set(dateStr, (cellMap.get(dateStr) ?? 0) + val);
        }

        const calData: [string, number][] = [];
        let minVal = Infinity;
        let maxVal = -Infinity;
        let minDate = '9999-12-31';
        let maxDate = '0000-01-01';
        for (const [dateStr, val] of cellMap) {
            calData.push([dateStr, val]);
            if (val < minVal) minVal = val;
            if (val > maxVal) maxVal = val;
            if (dateStr < minDate) minDate = dateStr;
            if (dateStr > maxDate) maxDate = dateStr;
        }
        if (calData.length === 0) return;
        if (minVal === Infinity) minVal = 0;
        if (maxVal === -Infinity) maxVal = 1;
        if (minVal === maxVal) maxVal = minVal + 1;

        // ── Layout: weeks span the X axis, weekdays the Y axis ───────────────
        const dayMs = 86400000;
        const spanDays = (Date.parse(maxDate) - Date.parse(minDate)) / dayMs;
        const weeks = Math.max(1, Math.ceil((spanDays + 8) / 7));
        // Shrink cells when the range is long so the canvas stays reasonable.
        const cell = weeks > 60 ? 12 : weeks > 30 ? 15 : 18;
        const calLeft = 44;   // room for weekday labels
        const calRight = 16;
        const calTop = 34;    // room for the month-label row
        // Bottom band for the continuous visualMap. In the gallery `calculable`
        // is on, so the colour bar also draws value labels + drag handles above
        // it; reserve enough height that none of it rides up into the last
        // weekday row of the calendar.
        const vmHeight = 70;
        const gridH = 7 * cell;

        const canvasW = calLeft + weeks * cell + calRight;
        const canvasH = calTop + gridH + vmHeight;

        // ── Color scheme ─────────────────────────────────────────────────────
        const encScheme = encodings?.color?.scheme;
        const userScheme = (encScheme && encScheme !== 'default') ? encScheme : undefined;
        const schemeName = userScheme || 'viridis';
        const decision = colorDecisions?.color ?? colorDecisions?.group;
        let schemeColors: string[] = SCHEME_COLORS[schemeName] || SCHEME_COLORS.viridis;
        if (decision?.schemeId) {
            const fromDecision = getPaletteForScheme(decision.schemeId);
            if (fromDecision && fromDecision.length > 0) schemeColors = fromDecision;
        }

        const option: any = {
            tooltip: {
                trigger: 'item',
                formatter: (params: any) => {
                    const [date, val] = params.value;
                    return `${date}<br/>${valueField ?? 'Count'}: ${val}`;
                },
            },
            visualMap: {
                type: 'continuous',
                min: minVal,
                max: maxVal,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: 6,
                itemWidth: 12,
                itemHeight: 100,
                text: ['high', 'low'],
                inRange: { color: schemeColors },
            },
            calendar: {
                top: calTop,
                left: calLeft,
                right: calRight,
                cellSize: [cell, cell],
                range: minDate === maxDate ? minDate : [minDate, maxDate],
                orient: 'horizontal',
                splitLine: { show: true, lineStyle: { color: '#ccc', width: 1 } },
                itemStyle: { borderWidth: 1, borderColor: '#fff', color: '#f4f4f4' },
                yearLabel: { show: false },
                dayLabel: { firstDay: 1, fontSize: 10, color: '#666' },
                monthLabel: { fontSize: 11, color: '#333' },
            },
            series: [{
                type: 'heatmap',
                coordinateSystem: 'calendar',
                data: calData,
            }],
            _width: canvasW,
            _height: canvasH,
        };

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    encodingActions: [
        {
            key: 'colorScheme',
            label: 'Scheme',
            isApplicable: (ctx) => !!ctx.encodings.color?.field,
            dependencies: ['color'],
            control: {
                type: 'discrete', options: [
                    { value: undefined, label: 'Default (Viridis)' },
                    { value: 'viridis', label: 'Viridis' },
                    { value: 'github', label: 'GitHub' },
                    { value: 'blues', label: 'Blues' },
                    { value: 'greens', label: 'Greens' },
                    { value: 'reds', label: 'Reds' },
                    { value: 'oranges', label: 'Oranges' },
                    { value: 'purples', label: 'Purples' },
                ],
            },
            get: (enc) => enc.color?.scheme,
            set: (enc, value) => ({ ...enc, color: { ...enc.color, scheme: value } }),
        },
    ] as EncodingActionDef[],
};
