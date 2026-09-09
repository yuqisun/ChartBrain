// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts, assembleChartjs } from '../src';
import {
  genEcdfTests,
  genEChartsEcdfTests,
  genChartJsEcdfTests,
} from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * ECDF Plot (Empirical Cumulative Distribution Function) on the Vega-Lite,
 * ECharts and Chart.js backends.
 *
 * An ECDF plots each value of a quantitative measure against the proportion of
 * observations ≤ that value — a non-decreasing step rising from ~0 to 1.0. These
 * tests assert the invariants that make a chart an ECDF on each backend:
 *   - the cumulative proportion is COMPUTED (VL: window running-count +
 *     joinaggregate total + calculate; ECharts/Chart.js: precomputed pairs), so
 *     the value axis is the proportion (0..1), NOT raw counts;
 *   - the curve is a STEP (VL step-after / ECharts step:'end' / Chart.js
 *     stepped:'after'), non-decreasing, value-sorted, and reaches 1.0;
 *   - the value axis is pinned to [0, 1];
 *   - a color/group series produces one curve per group, each reaching 1.0.
 * Plus a sweep asserting every bundled gallery example compiles per backend.
 */

/** Convert a gallery TestCase into the assembler input shape. */
function toInput(tc: TestCase) {
  const encodings: Record<string, string> = {};
  for (const [channel, item] of Object.entries(tc.encodingMap)) {
    const field = tc.fields.find((f) => f.id === (item as any).fieldID);
    if (field) encodings[channel] = field.name;
  }
  const semantic_types: Record<string, string> = {};
  for (const [name, meta] of Object.entries(tc.metadata)) {
    semantic_types[name] = meta.semanticType;
  }
  return {
    data: { values: tc.data },
    semantic_types,
    chart_spec: {
      chartType: tc.chartType,
      encodings,
      baseSize: { width: 560, height: 360 },
      ...(tc.chartProperties ? { chartProperties: tc.chartProperties } : {}),
    },
  };
}

const byTitle = (tcs: TestCase[], title: string) =>
  tcs.find((t) => t.title === title)!;

const BASIC = 'API response times (basic)';
const ADVANCED = 'Test scores: control vs treatment + Color';
const NEGATIVES = 'Standardized residuals crossing zero (negatives)';
const SMALL_N = 'Reaction times, small sample (n = 15)';
const FACET = 'Exam scores faceted by subject (column)';

/** Assert an array of (x, y) pairs is value-sorted, monotone-non-decreasing in
 *  y, with every y in [0, 1] and the final y essentially 1.0. */
function assertEcdfShape(pairs: Array<[number, number]>) {
  expect(pairs.length).toBeGreaterThan(0);
  for (let i = 1; i < pairs.length; i++) {
    // value-sorted ascending
    expect(pairs[i][0]).toBeGreaterThanOrEqual(pairs[i - 1][0]);
    // non-decreasing proportion
    expect(pairs[i][1]).toBeGreaterThanOrEqual(pairs[i - 1][1] - 1e-9);
  }
  for (const [, y] of pairs) {
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThanOrEqual(1 + 1e-9);
  }
  expect(pairs[pairs.length - 1][1]).toBeCloseTo(1, 6);
}

describe('Vega-Lite ECDF Plot', () => {
  const cases = genEcdfTests();
  const basic = byTitle(cases, BASIC);
  const spec = assembleVegaLite(toInput(basic)) as any;

  it('computes the cumulative proportion via window + joinaggregate + calculate', () => {
    const t = spec.transform as any[];
    expect(Array.isArray(t)).toBe(true);
    const win = t.find((s) => Array.isArray(s.window));
    const agg = t.find((s) => Array.isArray(s.joinaggregate));
    const calc = t.find((s) => typeof s.calculate === 'string');
    expect(win).toBeDefined();
    expect(agg).toBeDefined();
    expect(calc).toBeDefined();
    // The running count is sorted ascending by the measure (the ≤ x convention).
    expect(win.window[0].op).toBe('count');
    expect(win.sort[0].field).toBe('Response Time (ms)');
    expect(win.sort[0].order).toBe('ascending');
    expect(win.frame).toEqual([null, 0]);
    expect(agg.joinaggregate[0].op).toBe('count');
    // calculate = runningCount / total → the proportion.
    expect(calc.calculate).toContain(win.window[0].as);
    expect(calc.calculate).toContain(agg.joinaggregate[0].as);
  });

  it('draws a step-after line with the measure on x and the proportion on y', () => {
    expect(spec.mark.type).toBe('line');
    expect(spec.mark.interpolate).toBe('step-after');
    expect(spec.encoding.x.field).toBe('Response Time (ms)');
    expect(spec.encoding.x.type).toBe('quantitative');
    // y is the COMPUTED proportion field (matches calculate's output), not a raw count.
    const calc = (spec.transform as any[]).find((s) => typeof s.calculate === 'string');
    expect(spec.encoding.y.field).toBe(calc.as);
    expect(spec.encoding.y.type).toBe('quantitative');
    expect(spec.encoding.y.title).toMatch(/proportion/i);
  });

  it('pins the value axis to [0, 1]', () => {
    expect(spec.encoding.y.scale.domain).toEqual([0, 1]);
  });

  it('normalizes per group: a color series groups the running count + total', () => {
    const adv = assembleVegaLite(toInput(byTitle(cases, ADVANCED))) as any;
    expect(adv.encoding.color.field).toBe('Group');
    const win = (adv.transform as any[]).find((s) => Array.isArray(s.window));
    const agg = (adv.transform as any[]).find((s) => Array.isArray(s.joinaggregate));
    expect(win.groupby).toContain('Group');
    expect(agg.groupby).toContain('Group');
  });

  it('lets the measure span negatives (no zero-crossing artifacts)', () => {
    const neg = assembleVegaLite(toInput(byTitle(cases, NEGATIVES))) as any;
    expect(neg.encoding.x.field).toBe('Std residual');
    expect(neg.encoding.y.scale.domain).toEqual([0, 1]);
  });

  it('facets into small multiples and groups the count by the facet field', () => {
    const facet = assembleVegaLite(toInput(byTitle(cases, FACET))) as any;
    const facetDef = facet.encoding?.facet ?? facet.encoding?.column;
    expect(facetDef?.field).toBe('Subject');
    const win = (facet.transform as any[]).find((s) => Array.isArray(s.window));
    // Per-panel normalization → the facet field is in the window groupby.
    expect(win.groupby).toContain('Subject');
    expect((facet.mark?.type ?? facet.mark)).toBe('line');
  });
});

describe('ECharts ECDF Plot', () => {
  const cases = genEChartsEcdfTests();
  const basic = byTitle(cases, BASIC);
  const option = assembleECharts(toInput(basic)) as any;

  it('renders one stepped line series on a value x-axis with a [0,1] value axis', () => {
    expect(option.series.length).toBe(1);
    const s = option.series[0];
    expect(s.type).toBe('line');
    expect(s.step).toBe('end');
    expect(option.xAxis.type).toBe('value');
    expect(option.yAxis.type).toBe('value');
    expect(option.yAxis.min).toBe(0);
    expect(option.yAxis.max).toBe(1);
  });

  it('emits a non-decreasing, value-sorted curve ending at 1.0 (proportion, not counts)', () => {
    assertEcdfShape(option.series[0].data as Array<[number, number]>);
  });

  it('hides symbols by default (a clean step line)', () => {
    expect(option.series[0].showSymbol).toBe(false);
  });

  it('produces one ECDF curve per color group, each ending at 1.0', () => {
    const adv = assembleECharts(toInput(byTitle(cases, ADVANCED))) as any;
    expect(adv.series.length).toBe(2);
    expect(adv.legend.data).toEqual(['Control', 'Treatment']);
    for (const s of adv.series) {
      expect(s.step).toBe('end');
      assertEcdfShape(s.data as Array<[number, number]>);
    }
  });

  it('handles negatives and small n', () => {
    const neg = assembleECharts(toInput(byTitle(cases, NEGATIVES))) as any;
    const data = neg.series[0].data as Array<[number, number]>;
    expect(Math.min(...data.map((d) => d[0]))).toBeLessThan(0);
    assertEcdfShape(data);

    const small = assembleECharts(toInput(byTitle(cases, SMALL_N))) as any;
    assertEcdfShape(small.series[0].data as Array<[number, number]>);
  });
});

describe('Chart.js ECDF Plot', () => {
  const cases = genChartJsEcdfTests();
  const basic = byTitle(cases, BASIC);
  const config = assembleChartjs(toInput(basic)) as any;

  it('renders one stepped line dataset on a linear x-axis with a [0,1] value axis', () => {
    expect(config.type).toBe('line');
    expect(config.data.datasets.length).toBe(1);
    const ds = config.data.datasets[0];
    expect(ds.stepped).toBe('after');
    expect(config.options.scales.x.type).toBe('linear');
    expect(config.options.scales.y.type).toBe('linear');
    expect(config.options.scales.y.min).toBe(0);
    expect(config.options.scales.y.max).toBe(1);
  });

  it('emits a non-decreasing, value-sorted curve ending at 1.0 (proportion, not counts)', () => {
    const pts = (config.data.datasets[0].data as Array<{ x: number; y: number }>).map(
      (p) => [p.x, p.y] as [number, number],
    );
    assertEcdfShape(pts);
  });

  it('hides points by default (a clean step line)', () => {
    expect(config.data.datasets[0].pointRadius).toBe(0);
  });

  it('produces one ECDF curve per color group, each ending at 1.0', () => {
    const adv = assembleChartjs(toInput(byTitle(cases, ADVANCED))) as any;
    expect(adv.data.datasets.length).toBe(2);
    expect(adv.options.plugins.legend.display).toBe(true);
    for (const ds of adv.data.datasets) {
      expect(ds.stepped).toBe('after');
      const pts = (ds.data as Array<{ x: number; y: number }>).map(
        (p) => [p.x, p.y] as [number, number],
      );
      assertEcdfShape(pts);
    }
  });
});

describe('ECDF gallery examples compile', () => {
  for (const tc of genEcdfTests()) {
    it(`Vega-Lite: ${tc.title}`, () => {
      const spec = assembleVegaLite(toInput(tc)) as any;
      const ok = !!spec.mark || !!spec.facet || !!spec.spec;
      expect(ok).toBe(true);
    });
  }
  for (const tc of genEChartsEcdfTests()) {
    it(`ECharts: ${tc.title}`, () => {
      const option = assembleECharts(toInput(tc)) as any;
      expect(option.series?.length).toBeGreaterThanOrEqual(1);
      // Every series is a stepped line whose curve ends at 1.0.
      for (const s of option.series) {
        expect(s.step).toBe('end');
        const data = s.data as Array<[number, number]>;
        expect(data[data.length - 1][1]).toBeCloseTo(1, 6);
      }
    });
  }
  for (const tc of genChartJsEcdfTests()) {
    it(`Chart.js: ${tc.title}`, () => {
      const config = assembleChartjs(toInput(tc)) as any;
      expect(config.type).toBe('line');
      expect(config.data?.datasets?.length).toBeGreaterThanOrEqual(1);
      for (const ds of config.data.datasets) {
        expect(ds.stepped).toBe('after');
        const data = ds.data as Array<{ x: number; y: number }>;
        expect(data[data.length - 1].y).toBeCloseTo(1, 6);
      }
    });
  }
});
