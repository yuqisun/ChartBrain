// Copyright (c) 2026 ChartBrain contributors.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleHighcharts, hcAllTemplateDefs, hcGetTemplateDef } from '../src';

const CATEGORICAL_DATA = [
  { month: '2026-01', region: 'East', revenue: 120 },
  { month: '2026-02', region: 'East', revenue: 150 },
  { month: '2026-01', region: 'West', revenue: 90 },
  { month: '2026-02', region: 'West', revenue: 110 },
];

const SCATTER_DATA = [
  { weight: 1.6, mpg: 32, origin: 'JP' },
  { weight: 2.1, mpg: 27, origin: 'US' },
  { weight: 1.9, mpg: 29, origin: 'EU' },
];

const CATEGORICAL_BASE = {
  data: { values: CATEGORICAL_DATA },
  semantic_types: { month: 'YearMonth', region: 'Country', revenue: 'Price' },
};

describe('highcharts backend smoke', () => {
  it('registers the ChartBrain chart types', () => {
    const names = hcAllTemplateDefs.map(t => t.chart);
    expect(names).toEqual(
      expect.arrayContaining(['Bar Chart', 'Line Chart', 'Area Chart', 'Scatter Plot', 'Connected Scatter Plot', 'Pie Chart', 'Donut Chart', 'Slope Chart']),
    );
    expect(hcGetTemplateDef('Bar Chart')).toBeDefined();
    expect(hcGetTemplateDef('Nonexistent Chart')).toBeUndefined();
  });

  it('Bar Chart → stacked column series on a category axis', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: {
          x: { field: 'month' },
          y: { field: 'revenue' },
          color: { field: 'region' },
        },
      },
    }) as any;

    expect(option.chart.type).toBe('column');
    expect(option.xAxis.type).toBe('category');
    expect(option.xAxis.categories).toEqual(['2026-01', '2026-02']);
    expect(option.series).toHaveLength(2);
    expect(option.series.every((s: any) => s.type === 'column')).toBe(true);
    expect(option.plotOptions.series.stacking).toBe('normal');
    expect(option.tooltip.shared).toBe(true);
    expect(option._hcTooltip).toBeUndefined();
    expect(option._warnings).toBeUndefined();
  });

  it('Line Chart → line series on a datetime axis', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('line');
    expect(option.xAxis.type).toBe('datetime');
    expect(option.series.every((s: any) => s.type === 'line')).toBe(true);
    expect(option.series[0].data).toEqual([
      [Date.parse('2026-01'), 120],
      [Date.parse('2026-02'), 150],
    ]);
  });

  it('Area Chart → stacked area series on a datetime axis', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Area Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('area');
    expect(option.xAxis.type).toBe('datetime');
    expect(option.series.every((s: any) => s.type === 'area')).toBe(true);
    expect(option.plotOptions.series.stacking).toBe('normal');
  });

  it('Slope Chart → one line per entity across two periods', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { period: 'before', region: 'East', revenue: 120 },
          { period: 'after', region: 'East', revenue: 150 },
          { period: 'before', region: 'West', revenue: 90 },
          { period: 'after', region: 'West', revenue: 110 },
        ],
      },
      semantic_types: { period: 'Category', region: 'Country', revenue: 'Price' },
      chart_spec: {
        chartType: 'Slope Chart',
        encodings: { x: { field: 'period' }, y: { field: 'revenue' }, color: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('line');
    expect(option.series.map((s: any) => s.name)).toEqual(['East', 'West']);
    expect(option.series[0].data).toEqual([120, 150]);
    expect(option.series[1].data).toEqual([90, 110]);
    expect(option.series.every((s: any) => s.marker?.enabled === true)).toBe(true);
  });

  it('Scatter Plot → [x, y] pairs on linear axes, one series per group', () => {
    const option = assembleHighcharts({
      data: { values: SCATTER_DATA },
      semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
      chart_spec: {
        chartType: 'Scatter Plot',
        encodings: {
          x: { field: 'weight' },
          y: { field: 'mpg' },
          color: { field: 'origin' },
        },
      },
    }) as any;

    expect(option.chart.type).toBe('scatter');
    expect(option.xAxis.type).toBe('linear');
    expect(option.yAxis.type).toBe('linear');
    expect(option.series).toHaveLength(3);
    expect(option.series[0].data).toEqual([[1.6, 32]]);
    expect(option.tooltip.pointFormat).toBeDefined();
  });

  it('Connected Scatter Plot → path follows data order (no sorting)', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { x: 3, y: 1, g: 'A' },
          { x: 1, y: 2, g: 'A' },
          { x: 2, y: 3, g: 'A' },
        ],
      },
      semantic_types: { x: 'Quantity', y: 'Quantity', g: 'Category' },
      chart_spec: {
        chartType: 'Connected Scatter Plot',
        encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'g' } },
      },
    }) as any;

    expect(option.chart.type).toBe('line');
    expect(option.series).toHaveLength(1);
    expect(option.series[0].name).toBe('A');
    expect(option.series[0].data).toEqual([[3, 1], [1, 2], [2, 3]]);
    expect(option.series[0].marker.enabled).toBe(true);
  });

  it('Connected Scatter Plot without color keeps one path in row order', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { x: 5, y: 1 },
          { x: 2, y: 3 },
          { x: 7, y: 2 },
        ],
      },
      semantic_types: { x: 'Quantity', y: 'Quantity' },
      chart_spec: {
        chartType: 'Connected Scatter Plot',
        encodings: { x: { field: 'x' }, y: { field: 'y' } },
      },
    }) as any;

    expect(option.series).toHaveLength(1);
    expect(option.series[0].name).toBe('y');
    expect(option.series[0].data).toEqual([[5, 1], [2, 3], [7, 2]]);
    expect(option.series[0].marker.enabled).toBe(true);
  });

  it('Connected Scatter Plot keeps duplicate x points instead of summing them', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { x: 1, y: 10, g: 'A' },
          { x: 1, y: 20, g: 'A' },
          { x: 2, y: 30, g: 'A' },
        ],
      },
      semantic_types: { x: 'Quantity', y: 'Quantity', g: 'Category' },
      chart_spec: {
        chartType: 'Connected Scatter Plot',
        encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'g' } },
      },
    }) as any;

    // line 模板会把两个 x=1 的行合并成 [1,30]；连线散点必须保留两个点
    expect(option.series[0].data).toEqual([[1, 10], [1, 20], [2, 30]]);
  });

  it('Pie Chart → {name, y} slices with percentage labels', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Pie Chart',
        encodings: { color: { field: 'region' }, size: { field: 'revenue' } },
      },
    }) as any;

    expect(option.chart.type).toBe('pie');
    expect(option.series[0].type).toBe('pie');
    expect(option.series[0].data).toEqual([
      { name: 'East', y: 270 },
      { name: 'West', y: 200 },
    ]);
    expect(option.series[0].dataLabels.enabled).toBe(true);
    expect(option.tooltip.pointFormat).toContain('{point.percentage');
  });

  it('applies the spec title and layout-derived canvas size', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Bar Chart',
        title: 'Revenue by month',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' } },
        baseSize: { width: 400, height: 300 },
      },
    }) as any;

    expect(option.title.text).toBe('Revenue by month');
    expect(option.chart.width).toBeGreaterThan(0);
    expect(option.chart.height).toBeGreaterThan(0);
    expect(option._width).toBe(option.chart.width);
    expect(option._dataLength).toBe(4);
    // Single series: no legend, no stacking.
    expect(option.legend.enabled).toBe(false);
    expect(option.plotOptions).toBeUndefined();
  });

  it('horizontal bar (discrete y) uses the bar mark', () => {
    const option = assembleHighcharts({
      data: { values: [{ region: 'North', revenue: 120 }, { region: 'South', revenue: 80 }] },
      semantic_types: { region: 'Country', revenue: 'Price' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'revenue' }, y: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('bar');
    expect(option.series[0].type).toBe('bar');
    expect(option.yAxis.type).toBe('category');
  });

  it('negative values do not pin the value axis to zero', () => {
    const option = assembleHighcharts({
      data: { values: [{ m: '2026-01', p: -30 }, { m: '2026-02', p: 20 }] },
      semantic_types: { m: 'YearMonth', p: 'Price' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'm' }, y: { field: 'p' } } },
    }) as any;

    expect(option.yAxis.min).toBeUndefined();
  });

  it('reports an overflow truncation exactly once', () => {
    const option = assembleHighcharts({
      data: { values: Array.from({ length: 120 }, (_, i) => ({ cat: `C${i}`, v: i })) },
      semantic_types: { cat: 'Category', v: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'cat' }, y: { field: 'v' } },
        baseSize: { width: 400, height: 300 },
      },
    }) as any;

    expect(option.xAxis.categories).toHaveLength(100);
    expect(option._warnings).toHaveLength(1);
    expect(option._warnings[0].code).toBe('overflow');
  });

  it('Line Chart with a discrete y swaps the category axis to y', () => {
    const option = assembleHighcharts({
      data: { values: [{ score: 10, team: 'A' }, { score: 20, team: 'B' }] },
      semantic_types: { score: 'Quantity', team: 'Category' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: { field: 'score' }, y: { field: 'team' } },
      },
    }) as any;

    expect(option.xAxis.type).toBe('linear');
    expect(option.yAxis).toMatchObject({ type: 'category', categories: ['A', 'B'] });
    expect(option.series[0].data).toEqual([10, 20]);
  });

  it('Line Chart with two discrete channels counts rows per category', () => {
    const option = assembleHighcharts({
      data: { values: [{ a: 'X', b: 'p' }, { a: 'X', b: 'q' }, { a: 'Y', b: 'p' }] },
      semantic_types: { a: 'Category', b: 'Category' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: { field: 'a' }, y: { field: 'b' } },
      },
    }) as any;

    expect(option.xAxis.categories).toEqual(['X', 'Y']);
    expect(option.series[0].name).toBe('Count');
    expect(option.series[0].data).toEqual([2, 1]);
  });

  it('applies field display names to axis titles and series', () => {
    const option = assembleHighcharts({
      data: { values: [{ cat: 'A', val: 10 }, { cat: 'B', val: 20 }] },
      semantic_types: { cat: 'Category', val: 'Quantity' },
      field_display_names: { cat: '类别', val: '营收' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'cat' }, y: { field: 'val' } },
      },
    }) as any;

    expect(option.xAxis.title.text).toBe('类别');
    expect(option.yAxis.title.text).toBe('营收');
    expect(option.series[0].name).toBe('营收');
  });

  it('rejects unknown chart types loudly', () => {
    expect(() => assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: { chartType: 'Radar Chart', encodings: { x: { field: 'month' } } },
    })).toThrow(/Unknown Highcharts chart type/);
  });

  it('Grouped Bar Chart → side-by-side columns, no stacking', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Grouped Bar Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' }, group: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('column');
    expect(option.series).toHaveLength(2);
    expect(option.series.every((s: any) => s.type === 'column')).toBe(true);
    expect(option.plotOptions?.series?.stacking).toBeUndefined();
    expect(option.series.map((s: any) => s.name)).toEqual(['East', 'West']);
    expect(option.series[0].data).toEqual([120, 150]);
  });

  it('Stacked Bar Chart → stacked columns', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Stacked Bar Chart',
        encodings: { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'region' } },
      },
    }) as any;

    expect(option.chart.type).toBe('column');
    expect(option.plotOptions.series.stacking).toBe('normal');
    expect(option.series.map((s: any) => s.name)).toEqual(['East', 'West']);
    expect(option.series[0].data).toEqual([120, 150]);
  });

  it('Stacked Bar Chart splits by color even when group is also bound', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Stacked Bar Chart',
        encodings: {
          x: { field: 'month' }, y: { field: 'revenue' },
          color: { field: 'region' }, group: { field: 'region' },
        },
      },
    }) as any;
    expect(option.series.map((s: any) => s.name)).toEqual(['East', 'West']);
    expect(option.plotOptions.series.stacking).toBe('normal');
  });

  it('Grouped Bar Chart splits by group even when color is also bound', () => {
    const option = assembleHighcharts({
      ...CATEGORICAL_BASE,
      chart_spec: {
        chartType: 'Grouped Bar Chart',
        encodings: {
          x: { field: 'month' }, y: { field: 'revenue' },
          group: { field: 'region' }, color: { field: 'region' },
        },
      },
    }) as any;
    expect(option.series.map((s: any) => s.name)).toEqual(['East', 'West']);
    expect(option.plotOptions?.series?.stacking).toBeUndefined();
  });

  it('Strip Plot → deterministic jitter within each category band', () => {
    const input = {
      data: {
        values: [
          { region: 'East', revenue: 120 },
          { region: 'East', revenue: 150 },
          { region: 'West', revenue: 90 },
        ],
      },
      semantic_types: { region: 'Country', revenue: 'Price' },
      chart_spec: {
        chartType: 'Strip Plot',
        encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
      },
    } as any;

    const a = assembleHighcharts(input) as any;
    const b = assembleHighcharts(input) as any;

    expect(a.chart.type).toBe('scatter');
    expect(a.series[0].data).toHaveLength(3);
    expect(a.series[0].data).toEqual(b.series[0].data);
    // y 值保持原值；x 被抖动到类目带内
    expect(a.series[0].data.map((p: any) => p[1])).toEqual([120, 150, 90]);
    // 带内断言：East(slot=0) 的两点落在 [-0.4, 0.4)，West(slot=1) 落在 [0.6, 1.4)
    const xs = a.series[0].data.map((p: any) => p[0]);
    expect(xs[0]).toBeGreaterThanOrEqual(-0.4);
    expect(xs[0]).toBeLessThan(0.4);
    expect(xs[1]).toBeGreaterThanOrEqual(-0.4);
    expect(xs[1]).toBeLessThan(0.4);
    expect(xs[2]).toBeGreaterThanOrEqual(0.6);
    expect(xs[2]).toBeLessThan(1.4);
    expect(xs[0]).not.toBe(xs[1]); // 同带内两点的 x 必须不同（否则就是堆叠）
  });

  it('Strip Plot → grouped series jitter continues across groups', () => {
    const option = assembleHighcharts({
      data: {
        values: [
          { region: 'East', g: 'A', revenue: 120 },
          { region: 'East', g: 'B', revenue: 130 },
        ],
      },
      semantic_types: { region: 'Country', g: 'Category', revenue: 'Price' },
      chart_spec: {
        chartType: 'Strip Plot',
        encodings: { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'g' } },
      },
    }) as any;

    expect(option.series).toHaveLength(2);
    // 两个分组在同一个带内，首行 x 不得相同（相同即退化为竖向堆叠）
    expect(option.series[0].data[0][0]).not.toBe(option.series[1].data[0][0]);
  });

});
