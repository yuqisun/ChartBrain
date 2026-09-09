// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Highcharts palette definitions + palette picker.
//
// Mirrors `echarts/colormap.ts`: `core/color-decisions.ts` produces abstract
// ColorDecision objects (schemeType / categoryCount / schemeId); picking an
// actual palette is a backend concern, so it happens here with
// Highcharts-native colors.

import type { ColorDecision, ColorMapType } from '../core/color-decisions';

export type HighchartsPaletteId = 'default10' | 'default20' | 'viridis' | 'RdBu' | string;

export interface HighchartsColorMapDef {
    /** Global id, e.g. 'default10', 'viridis', 'RdBu'. */
    id: HighchartsPaletteId;
    type: ColorMapType;
    /** Suitable as a discrete palette (categorical legend). */
    supportsDiscrete: boolean;
    /** Suitable as a continuous color ramp (gradient). */
    supportsContinuous: boolean;
    /** Suggested background. */
    background: 'light' | 'dark' | 'any';
    /** Recommended for color-blind users. */
    colorblindSafe?: boolean;
    /** For categorical palettes: approximate maximum category count. */
    maxCategories?: number;
    /** Diverging ramp metadata. */
    diverging?: boolean;
    preferredMidpoint?: number;
    /** Actual color array. */
    colors: string[];
}

/**
 * Highcharts-native palettes.
 * - default10 / default20: Highcharts' own default series colors.
 * - viridis: a sequential ramp for continuous measures.
 * - RdBu: classic diverging ramp for signed measures.
 */
const HIGHCARTS_COLOR_MAPS: HighchartsColorMapDef[] = [
    {
        id: 'default10',
        type: 'categorical',
        supportsDiscrete: true,
        supportsContinuous: false,
        background: 'any',
        maxCategories: 10,
        colorblindSafe: false,
        colors: [
            '#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9',
            '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1',
        ],
    },
    {
        id: 'default20',
        type: 'categorical',
        supportsDiscrete: true,
        supportsContinuous: false,
        background: 'any',
        maxCategories: 20,
        colorblindSafe: false,
        colors: [
            '#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9',
            '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1',
            '#5aa4d6', '#6d6d75', '#7fd16d', '#e5944f', '#6f74d6',
            '#d94f72', '#cfc046', '#257d7c', '#d94f4f', '#7fd1cb',
        ],
    },
    {
        id: 'viridis',
        type: 'sequential',
        supportsDiscrete: true,
        supportsContinuous: true,
        background: 'any',
        colorblindSafe: true,
        colors: [
            '#440154', '#46327e', '#365c8d', '#277f8e',
            '#1fa187', '#4ac16d', '#a0da39', '#fde725',
        ],
    },
    {
        id: 'RdBu',
        type: 'diverging',
        supportsDiscrete: true,
        supportsContinuous: true,
        background: 'any',
        colorblindSafe: false,
        diverging: true,
        preferredMidpoint: 0,
        colors: [
            '#b2182b', '#d6604d', '#f4a582', '#fddbc7',
            '#f7f7f7',
            '#d1e5f0', '#92c5de', '#4393c3', '#2166ac',
        ],
    },
];

/** Fallback palette when no decision is available. */
export const HC_DEFAULT_COLORS = HIGHCARTS_COLOR_MAPS[0].colors;

function getMapById(id: HighchartsPaletteId | undefined): HighchartsColorMapDef | undefined {
    if (!id) return undefined;
    const key = String(id).toLowerCase();
    return HIGHCARTS_COLOR_MAPS.find(m => m.id.toLowerCase() === key);
}

export function getHighchartsPaletteForScheme(id: HighchartsPaletteId): string[] | undefined {
    return getMapById(id)?.colors;
}

/**
 * Highcharts-side palette picker — the backend analogue of `pickColorMap`.
 *
 * Strategy (same shape as the ECharts picker):
 *   1) If the caller pinned a `schemeId`, use that palette when it exists.
 *   2) Otherwise pick by `schemeType` + `categoryCount`:
 *        - categorical → the smallest palette that still fits the category count;
 *        - sequential  → a continuous ramp (viridis);
 *        - diverging   → a diverging ramp (RdBu).
 *   3) Fall back to Highcharts' default series colors.
 */
export function pickHighchartsPalette(decision: ColorDecision | undefined): string[] {
    if (!decision) return HC_DEFAULT_COLORS;

    const { schemeType, schemeId, categoryCount } = decision;

    if (schemeId) {
        const fromId = getHighchartsPaletteForScheme(schemeId);
        if (fromId && fromId.length > 0) return fromId;
    }

    const mapsOfType = HIGHCARTS_COLOR_MAPS.filter(m => m.type === schemeType);

    if (schemeType === 'categorical') {
        const candidates = mapsOfType.filter(m => m.supportsDiscrete);
        if (candidates.length) {
            const k = categoryCount ?? 0;
            const byCapacity = candidates
                .filter(m => m.maxCategories == null || m.maxCategories >= k)
                .sort((a, b) => (a.maxCategories ?? Infinity) - (b.maxCategories ?? Infinity));
            const picked = byCapacity[0] ?? candidates[0];
            if (picked.colors.length) return picked.colors;
        }
    } else if (schemeType === 'sequential') {
        const seq = mapsOfType.find(m => m.supportsContinuous) ?? getMapById('viridis');
        if (seq?.colors.length) return seq.colors;
    } else if (schemeType === 'diverging') {
        const div = mapsOfType.find(m => m.diverging) ?? getMapById('RdBu');
        if (div?.colors.length) return div.colors;
    }

    return HC_DEFAULT_COLORS;
}
