// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.
//
// Defensive invariant (M3, vendor half): the Highcharts backend must never
// return an options object without a usable `chart.type`. A spec that is
// otherwise valid but omits a required channel (e.g. `y`) makes the template
// early-return, and without a guard the layout pass would ship a typeless,
// series-less `chart = {}` straight to Highcharts.chart(). Empty *data* is a
// different case and must keep producing a valid, typed, empty chart.

import { describe, it, expect } from 'vitest';
import { assembleHighcharts } from '../src';

const ROWS = [
  { month: '2026-01', region: 'East', revenue: 120 },
  { month: '2026-02', region: 'East', revenue: 150 },
  { month: '2026-01', region: 'West', revenue: 90 },
  { month: '2026-02', region: 'West', revenue: 110 },
];

const BASE = {
  data: { values: ROWS },
  semantic_types: { month: 'YearMonth', region: 'Country', revenue: 'Price' },
};

describe('highcharts backend: missing required channels fail loudly', () => {
  it('Grouped Bar Chart without y throws an error naming the chart type and the missing channel', () => {
    const assemble = () =>
      assembleHighcharts({
        ...BASE,
        chart_spec: {
          chartType: 'Grouped Bar Chart',
          encodings: { x: { field: 'month' }, group: { field: 'region' } },
        },
      });

    expect(assemble).toThrow(/Highcharts backend: spec for 'Grouped Bar Chart' produced no chart type/);
    expect(assemble).toThrow(/required encoding channel is missing/);
    expect(assemble).toThrow(/need y/);
  });

  it('Strip Plot without y throws an error naming the chart type and the missing channel', () => {
    const assemble = () =>
      assembleHighcharts({
        ...BASE,
        chart_spec: {
          chartType: 'Strip Plot',
          encodings: { x: { field: 'region' } },
        },
      });

    expect(assemble).toThrow(/Highcharts backend: spec for 'Strip Plot' produced no chart type/);
    expect(assemble).toThrow(/required encoding channel is missing/);
    expect(assemble).toThrow(/need y/);
  });

  it('Grouped Bar Chart with x and y bound still returns a typed option', () => {
    const option = assembleHighcharts({
      ...BASE,
      chart_spec: {
        chartType: 'Grouped Bar Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' }, group: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('column');
    expect(option.series).toHaveLength(2);
  });

  it('Strip Plot with x and y bound still returns a typed option', () => {
    const option = assembleHighcharts({
      data: { values: ROWS },
      semantic_types: { region: 'Country', revenue: 'Price' },
      chart_spec: {
        chartType: 'Strip Plot',
        encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
      },
    }) as any;

    expect(option.chart.type).toBe('scatter');
  });

  it('empty data with a complete spec returns a typed option instead of throwing', () => {
    const option = assembleHighcharts({
      ...BASE,
      data: { values: [] },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' } },
      },
    }) as any;

    expect(option.chart.type).toBe('line');
    expect(option.series).toHaveLength(1);
    expect(option.series[0].data).toEqual([]);
  });
});
