// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleHighcharts, assembleECharts } from '../src';

const DATA = [
  { region: 'East', revenue: 120 },
  { region: 'West', revenue: 90 },
];
const BASE = { data: { values: DATA }, semantic_types: { region: 'Country', revenue: 'Price' } };
const spec = (chartType: string, chartProperties?: Record<string, unknown>) => ({
  ...BASE,
  chart_spec: {
    chartType,
    encodings: { color: { field: 'region' }, size: { field: 'revenue' } },
    ...(chartProperties ? { chartProperties } : {}),
  },
});

describe('Donut Chart', () => {
  it('Highcharts: pie with a 50% hole', () => {
    const option = assembleHighcharts(spec('Donut Chart')) as any;
    expect(option.chart.type).toBe('pie');
    expect(option.series[0].innerSize).toBe('50%');
    expect(option.series[0].data).toHaveLength(2);
  });

  it('Highcharts: an explicit innerRadius of 0 stays solid', () => {
    const option = assembleHighcharts(spec('Donut Chart', { innerRadius: 0 })) as any;
    expect(option.series[0].innerSize).toBeUndefined();
  });

  it('ECharts: pie with a non-zero inner radius', () => {
    const option = assembleECharts(spec('Donut Chart')) as any;
    expect(option.series[0].type).toBe('pie');
    const [inner] = option.series[0].radius as [string, string];
    expect(parseFloat(inner)).toBeGreaterThan(0);
    expect(option.series[0].data).toHaveLength(2);
  });

  it('ECharts: colors each slice from the palette, not one series colour', () => {
    const option = assembleECharts(spec('Donut Chart')) as any;
    expect(option.series[0].itemStyle?.color).toBeUndefined();
    expect(Array.isArray(option.color)).toBe(true);
    expect((option.color as string[]).length).toBeGreaterThan(1);
  });

  it('ECharts: a plain Pie Chart still has a solid centre', () => {
    const option = assembleECharts(spec('Pie Chart')) as any;
    expect((option.series[0].radius as [string, string])[0]).toBe('0%');
  });
});
