// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Slope Chart (slopegraph) test data.
 *
 * A slopegraph connects each category's value at exactly TWO periods with a
 * straight line + end points; the read is the slope (direction of change) and
 * the crossovers between categories. These generators cover the data shapes a
 * slopegraph is built for: ordinal-label periods, temporal (year / date)
 * periods, low → high category cardinality, negative / zero-crossing values,
 * faceting, and the degenerate single-series case.
 *
 * `genSlopeTests`        — the canonical (Vega-Lite) gallery + coverage set.
 * `genEChartsSlopeTests` — curated, color-grouped subset for the ECharts wall.
 * `genChartJsSlopeTests` — curated, color-grouped subset for the Chart.js wall.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { seededRandom, genCategories, genYears } from './generators';

/** Two-period rows: one {period, category, value} row per (period × category). */
function buildSlopeRows(
    periods: (string | number)[],
    categoryValues: Record<string, number[]>,
    fields: { period: string; category: string; value: string },
): any[] {
    const rows: any[] = [];
    for (const [cat, vals] of Object.entries(categoryValues)) {
        periods.forEach((p, i) => {
            rows.push({ [fields.period]: p, [fields.category]: cat, [fields.value]: vals[i] });
        });
    }
    return rows;
}

export function genSlopeTests(): TestCase[] {
    const tests: TestCase[] = [];
    const rand = seededRandom(910);

    // 1. BASIC — 5 products, two ordinal-label periods, color per product.
    {
        const periods = ['2019', '2024'];
        const products = genCategories('Product', 5);
        const catValues: Record<string, number[]> = {};
        for (const p of products) {
            const start = Math.round(20 + rand() * 60);
            const end = Math.round(20 + rand() * 60);
            catValues[p] = [start, end];
        }
        const data = buildSlopeRows(periods, catValues, { period: 'Period', category: 'Product', value: 'Revenue' });
        tests.push({
            title: 'Two periods × 5 products + Color (basic)',
            description: '5 products, value change from 2019 → 2024 — minimum useful slopegraph',
            tags: ['ordinal', 'quantitative', 'color', 'small'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Period'), makeField('Revenue'), makeField('Product')],
            metadata: {
                Period: { type: Type.String, semanticType: 'Category', levels: periods },
                Revenue: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Product: { type: Type.String, semanticType: 'Product', levels: products },
            },
            encodingMap: { x: makeEncodingItem('Period'), y: makeEncodingItem('Revenue'), color: makeEncodingItem('Product') },
        });
    }

    // 2. ADVANCED — temporal (year) periods, 8 teams that cross over, color.
    {
        const years = [genYears(1, 2018)[0], genYears(1, 2023)[0]]; // [2018, 2023]
        const teams = genCategories('Company', 8);
        const catValues: Record<string, number[]> = {};
        teams.forEach((t, idx) => {
            // Engineer clear crossings: rising and falling cohorts interleave.
            const start = 30 + idx * 8 + Math.round(rand() * 6);
            const end = 90 - idx * 8 + Math.round(rand() * 6);
            catValues[t] = [start, end];
        });
        const data = buildSlopeRows(years, catValues, { period: 'Year', category: 'Company', value: 'Market Share' });
        tests.push({
            title: 'Temporal years × 8 companies + Color (crossings)',
            description: '8 companies, market-share crossovers from 2018 → 2023 — multi-series with crossings',
            tags: ['temporal', 'quantitative', 'color', 'medium', 'crossings'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Year'), makeField('Market Share'), makeField('Company')],
            metadata: {
                Year: { type: Type.Number, semanticType: 'Year', levels: years },
                'Market Share': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Company: { type: Type.String, semanticType: 'Company', levels: teams },
            },
            encodingMap: { x: makeEncodingItem('Year'), y: makeEncodingItem('Market Share'), color: makeEncodingItem('Company') },
        });
    }

    // 3. Temporal ISO-date periods, 4 items, color per country.
    {
        const dates = ['2020-01-01', '2023-06-01'];
        const items = genCategories('Country', 4);
        // Explicit, well-separated start/end pairs (two risers, two fallers)
        // so the four lines stay distinct and end-points never coincide.
        const profiles: [number, number][] = [[68, 52], [50, 72], [60, 44], [44, 63]];
        const catValues: Record<string, number[]> = {};
        items.forEach((it, i) => { catValues[it] = [profiles[i][0], profiles[i][1]]; });
        const data = buildSlopeRows(dates, catValues, { period: 'Date', category: 'Country', value: 'Index' });
        tests.push({
            title: 'ISO dates × 4 countries + Color (temporal)',
            description: '4 countries across two ISO dates — temporal periods with a color legend',
            tags: ['temporal', 'quantitative', 'color', 'small', 'dates'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Date'), makeField('Index'), makeField('Country')],
            metadata: {
                Date: { type: Type.Date, semanticType: 'Date', levels: [] },
                Index: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Country: { type: Type.String, semanticType: 'Country', levels: items },
            },
            encodingMap: { x: makeEncodingItem('Date'), y: makeEncodingItem('Index'), color: makeEncodingItem('Country') },
        });
    }

    // 4. Negative / zero-crossing values — net profit change per region.
    {
        const periods = ['Q1', 'Q4'];
        const regions = ['North', 'South', 'East', 'West', 'Central', 'Coast'];
        const starts = [40, 10, -15, 25, -5, 30];
        const ends = [15, -20, 35, -10, 28, 22];
        const catValues: Record<string, number[]> = {};
        regions.forEach((r, i) => { catValues[r] = [starts[i], ends[i]]; });
        const data = buildSlopeRows(periods, catValues, { period: 'Quarter', category: 'Region', value: 'Net Profit' });
        tests.push({
            title: 'Two periods × 6 regions + Color (zero-crossing values)',
            description: '6 regions whose net profit crosses zero between Q1 and Q4 — diverging values',
            tags: ['ordinal', 'quantitative', 'color', 'negative', 'medium'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Quarter'), makeField('Net Profit'), makeField('Region')],
            metadata: {
                Quarter: { type: Type.String, semanticType: 'Category', levels: periods },
                'Net Profit': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: regions },
            },
            encodingMap: { x: makeEncodingItem('Quarter'), y: makeEncodingItem('Net Profit'), color: makeEncodingItem('Region') },
        });
    }

    // 5. Minimal / low cardinality — 2 items, Before → After.
    {
        const periods = ['Before', 'After'];
        const catValues: Record<string, number[]> = { Treatment: [62, 88], Control: [60, 64] };
        const data = buildSlopeRows(periods, catValues, { period: 'Phase', category: 'Cohort', value: 'Score' });
        tests.push({
            title: 'Two periods × 2 cohorts + Color (minimal)',
            description: '2 cohorts, before/after — lowest-cardinality slopegraph',
            tags: ['ordinal', 'quantitative', 'color', 'small'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Phase'), makeField('Score'), makeField('Cohort')],
            metadata: {
                Phase: { type: Type.String, semanticType: 'Category', levels: periods },
                Score: { type: Type.Number, semanticType: 'Score', levels: [] },
                Cohort: { type: Type.String, semanticType: 'Category', levels: ['Treatment', 'Control'] },
            },
            encodingMap: { x: makeEncodingItem('Phase'), y: makeEncodingItem('Score'), color: makeEncodingItem('Cohort') },
        });
    }

    // 6. Faceted — slopegraph split into small multiples by Segment (column).
    {
        const periods = ['2021', '2022'];
        const products = genCategories('Product', 4);
        const segments = ['Retail', 'Online'];
        // Distinct value bands per product keep the four lines separated within
        // each panel so end-point markers do not collide.
        const productBase = [64, 50, 38, 26];
        const productDelta = [-6, 14, -10, 8];
        const data: any[] = [];
        for (const seg of segments) {
            const segLift = seg === 'Online' ? 6 : 0;
            products.forEach((p, pi) => {
                const start = productBase[pi] + segLift + Math.round(rand() * 3);
                const end = start + productDelta[pi] + Math.round(rand() * 3);
                data.push({ Period: periods[0], Product: p, Segment: seg, Sales: start });
                data.push({ Period: periods[1], Product: p, Segment: seg, Sales: end });
            });
        }
        tests.push({
            title: 'Two periods × 4 products + Color, faceted by Segment',
            description: '4 products across two periods, small multiples by channel (column facet)',
            tags: ['ordinal', 'quantitative', 'color', 'facet', 'medium'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Period'), makeField('Sales'), makeField('Product'), makeField('Segment')],
            metadata: {
                Period: { type: Type.String, semanticType: 'Category', levels: periods },
                Sales: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Product: { type: Type.String, semanticType: 'Product', levels: products },
                Segment: { type: Type.String, semanticType: 'Category', levels: segments },
            },
            encodingMap: {
                x: makeEncodingItem('Period'), y: makeEncodingItem('Sales'),
                color: makeEncodingItem('Product'), column: makeEncodingItem('Segment'),
            },
        });
    }

    // 7. High cardinality — 12 categories (crowded; stress, kept out of wall).
    {
        const periods = ['2021', '2022'];
        const names = genCategories('Name', 12);
        const catValues: Record<string, number[]> = {};
        for (const n of names) catValues[n] = [Math.round(10 + rand() * 90), Math.round(10 + rand() * 90)];
        const data = buildSlopeRows(periods, catValues, { period: 'Period', category: 'Name', value: 'Value' });
        tests.push({
            title: 'Two periods × 12 categories + Color (high cardinality)',
            description: '12 categories across two periods — crowded slopegraph stress case',
            tags: ['ordinal', 'quantitative', 'color', 'large', 'stress'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Period'), makeField('Value'), makeField('Name')],
            metadata: {
                Period: { type: Type.String, semanticType: 'Category', levels: periods },
                Value: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Name: { type: Type.String, semanticType: 'Name', levels: names },
            },
            encodingMap: { x: makeEncodingItem('Period'), y: makeEncodingItem('Value'), color: makeEncodingItem('Name') },
        });
    }

    // 8. Degenerate — single series (no color/detail), two periods.
    {
        const periods = ['Start', 'End'];
        const data = [
            { Stage: periods[0], Conversion: 42 },
            { Stage: periods[1], Conversion: 67 },
        ];
        tests.push({
            title: 'Two periods × single series (no color)',
            description: 'A single line connecting two periods — degenerate slopegraph',
            tags: ['ordinal', 'quantitative', 'small', 'degenerate'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Stage'), makeField('Conversion')],
            metadata: {
                Stage: { type: Type.String, semanticType: 'Category', levels: periods },
                Conversion: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Stage'), y: makeEncodingItem('Conversion') },
        });
    }

    // 9. Detail channel — one line per category, grouped WITHOUT a color legend.
    //    Exercises the `detail` channel (intended to produce same-colored,
    //    legend-less lines whose collective shape is the read). Tagged
    //    edge-case so it stays out of the gallery wall but is covered by tests.
    {
        const periods = ['Before', 'After'];
        const items = genCategories('Unit', 6);
        const catValues: Record<string, number[]> = {};
        for (const it of items) catValues[it] = [Math.round(30 + rand() * 50), Math.round(30 + rand() * 50)];
        const data = buildSlopeRows(periods, catValues, { period: 'Phase', category: 'Unit', value: 'Score' });
        tests.push({
            title: 'Two periods × 6 units + Detail (no legend)',
            description: '6 units grouped by detail rather than color — legend-less slopegraph',
            tags: ['ordinal', 'quantitative', 'detail', 'medium', 'edge-case'],
            chartType: 'Slope Chart',
            data,
            fields: [makeField('Phase'), makeField('Score'), makeField('Unit')],
            metadata: {
                Phase: { type: Type.String, semanticType: 'Category', levels: periods },
                Score: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Unit: { type: Type.String, semanticType: 'Category', levels: items },
            },
            encodingMap: { x: makeEncodingItem('Phase'), y: makeEncodingItem('Score'), detail: makeEncodingItem('Unit') },
        });
    }

    return tests;
}

/**
 * ECharts wall variants — color-grouped slopegraphs (basic, temporal crossings,
 * zero-crossing). Reuses the canonical cases that translate cleanly to the
 * series-based ECharts backend.
 */
export function genEChartsSlopeTests(): TestCase[] {
    const all = genSlopeTests();
    const pick = (title: string) => all.find(t => t.title === title)!;
    return [
        pick('Two periods × 5 products + Color (basic)'),
        pick('Temporal years × 8 companies + Color (crossings)'),
        pick('Two periods × 6 regions + Color (zero-crossing values)'),
    ];
}

/**
 * Chart.js wall variants — color-grouped slopegraphs. Chart.js builds one
 * dataset per category, so the color-grouped cases are the representative set.
 */
export function genChartJsSlopeTests(): TestCase[] {
    const all = genSlopeTests();
    const pick = (title: string) => all.find(t => t.title === title)!;
    return [
        pick('Two periods × 5 products + Color (basic)'),
        pick('Temporal years × 8 companies + Color (crossings)'),
        pick('Two periods × 2 cohorts + Color (minimal)'),
    ];
}
