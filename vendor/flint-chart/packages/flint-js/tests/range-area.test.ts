// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts, assembleChartjs } from '../src';
import {
  genRangeAreaTests,
  genEChartsRangeAreaTests,
  genChartJsRangeAreaTests,
} from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * Range Area Chart (band / high–low / area-range) on the Vega-Lite, ECharts and
 * Chart.js backends.
 *
 * A range area fills a band between a LOWER bound (y) and an UPPER bound (y2) at
 * each x; the read is the band's extent and how it moves over x. These tests
 * assert the invariants that make a chart a range area on each backend:
 *   - the band uses BOTH bounds (VL: y + y2; ECharts: transparent base + stacked
 *     translucent delta; Chart.js: lower + upper line datasets, upper filling to
 *     the lower);
 *   - the fill is translucent;
 *   - the band is NOT forced to a zero baseline (it spans y..y2);
 *   - a color series produces one band per series (overlapping, never stacked);
 *   - the value axis is quantitative.
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

const BASIC = 'Daily temperature range over 14 days (basic)';
const ADVANCED = 'Two cities monthly temperature range + Color';
const ZERO_CROSS = 'Temperature anomaly band crossing zero (negatives)';

describe('Vega-Lite Range Area chart', () => {
  const cases = genRangeAreaTests();
  const basic = byTitle(cases, BASIC);
  const spec = assembleVegaLite(toInput(basic)) as any;

  it('uses an area mark with a translucent, non-zero-baseline fill', () => {
    expect(spec.mark.type).toBe('area');
    expect(spec.mark.opacity).toBeGreaterThan(0);
    expect(spec.mark.opacity).toBeLessThan(1);
    // The band spans y..y2 — never anchored at zero.
    expect(spec.encoding.y.scale.zero).toBe(false);
  });

  it('draws the band between BOTH bounds via y (lower) and y2 (upper)', () => {
    expect(spec.encoding.y.field).toBe('Min °C');
    expect(spec.encoding.y.type).toBe('quantitative');
    expect(spec.encoding.y2.field).toBe('Max °C');
    // y2 only carries the field reference (shares y's scale).
    expect(spec.encoding.y2.type).toBeUndefined();
    expect(spec.encoding.y2.scale).toBeUndefined();
  });

  it('places a temporal x on a time axis', () => {
    expect(spec.encoding.x.type).toBe('temporal');
  });

  it('overlaps (does not stack) multiple bands when color is present', () => {
    const adv = assembleVegaLite(toInput(byTitle(cases, ADVANCED))) as any;
    expect(adv.encoding.color.field).toBe('City');
    expect(adv.encoding.y2.field).toBe('High °C');
    // Ranged areas cannot be stacked — stacking is explicitly disabled.
    expect(adv.encoding.y.stack).toBeNull();
  });

  it('lets the band span negatives for zero-crossing data', () => {
    const neg = assembleVegaLite(toInput(byTitle(cases, ZERO_CROSS))) as any;
    expect(neg.encoding.y.type).toBe('quantitative');
    expect(neg.encoding.y.scale.zero).toBe(false);
    expect(neg.encoding.y2.field).toBe('Anomaly High');
  });

  it('handles numeric x as a quantitative axis with both bounds', () => {
    const num = assembleVegaLite(
      toInput(byTitle(cases, 'Predicted yield confidence band (numeric x)')),
    ) as any;
    expect(num.encoding.x.type).toBe('quantitative');
    expect(num.encoding.y.field).toBe('Yield Low');
    expect(num.encoding.y2.field).toBe('Yield High');
  });

  it('facets into small multiples with a column encoding', () => {
    const facet = assembleVegaLite(
      toInput(byTitle(cases, 'Daily temperature range, faceted by city')),
    ) as any;
    const hasFacet =
      !!facet.encoding?.facet ||
      !!facet.encoding?.column ||
      !!facet.facet ||
      !!facet.spec?.encoding;
    expect(hasFacet).toBe(true);
    const mark = facet.mark ?? facet.spec?.mark;
    expect(mark?.type ?? mark).toBe('area');
  });
});

describe('ECharts Range Area chart', () => {
  const cases = genEChartsRangeAreaTests();
  const basic = byTitle(cases, BASIC);
  const option = assembleECharts(toInput(basic)) as any;

  it('builds a transparent base + a translucent stacked delta (one band)', () => {
    // 2 series per band: a transparent base + a translucent delta on the same stack.
    expect(option.series.length).toBe(2);
    const [base, delta] = option.series;
    // Base: invisible line, no area fill, shares the band's stack.
    expect(base.stack).toBe(delta.stack);
    expect(base.lineStyle.opacity).toBe(0);
    expect(base.areaStyle).toBeUndefined();
    // Base carries an explicit (transparent) color so it does not consume a band color.
    expect(base.itemStyle.color).toBe('transparent');
    // Delta: translucent area fill (the visible ribbon).
    expect(delta.areaStyle).toBeDefined();
    expect(delta.areaStyle.opacity).toBeGreaterThan(0);
    expect(delta.areaStyle.opacity).toBeLessThan(1);
  });

  it('stacks the delta on the base so the band sits BETWEEN the bounds, not at zero', () => {
    const [base, delta] = option.series;
    // Both series share a stack id → the delta fills from the lower bound up.
    expect(base.stack).toBeTruthy();
    expect(delta.stack).toBe(base.stack);
    // Cumulative stacking regardless of sign so a negative lower bound is not
    // routed into a separate negative stack (which would collapse the band to 0).
    expect(base.stackStrategy).toBe('all');
    expect(delta.stackStrategy).toBe('all');
    // The value axis fits the band (scale: true), never forcing a zero baseline.
    expect(option.yAxis.scale).toBe(true);
    expect(option.yAxis.type).toBe('value');
    expect(option.xAxis.type).toBe('category');
  });

  it('fits the value-axis domain to the UPPER bound (band not clipped)', () => {
    // The domain-padding pass must include y2 — otherwise the band's upper edge
    // is clipped to the lower bound's extent.
    const [, delta] = option.series;
    const maxHigh = Math.max(...delta.data.map((d: any) => d._high));
    if (option.yAxis.max != null) {
      expect(option.yAxis.max).toBeGreaterThanOrEqual(maxHigh);
    }
  });

  it('keeps the band between negative and positive bounds for zero-crossing data', () => {
    const neg = assembleECharts(toInput(byTitle(cases, ZERO_CROSS))) as any;
    const [base, delta] = neg.series;
    // Cumulative stacking is what makes the negative-lower band render correctly.
    expect(base.stackStrategy).toBe('all');
    expect(delta.stackStrategy).toBe('all');
    // The data genuinely crosses zero: some lower bounds are negative.
    expect(Math.min(...delta.data.map((d: any) => d._low))).toBeLessThan(0);
    // The fitted axis spans the negatives (no forced zero floor).
    if (neg.yAxis.min != null) {
      expect(neg.yAxis.min).toBeLessThan(0);
    }
  });

  it('reconstructs the band: delta = upper − lower at each x', () => {
    const [base, delta] = option.series;
    for (let i = 0; i < base.data.length; i++) {
      const lo = base.data[i];
      const d = delta.data[i];
      if (lo == null || d == null || d.value == null) continue;
      expect(d._low).toBeCloseTo(lo, 6);
      expect(d.value).toBeCloseTo(d._high - d._low, 6);
      expect(d._high).toBeGreaterThanOrEqual(d._low);
    }
  });

  it('produces one band (base+delta pair) per color series with its own stack', () => {
    const adv = assembleECharts(toInput(byTitle(cases, ADVANCED))) as any;
    // 2 cities → 2 bands → 4 series.
    expect(adv.series.length).toBe(4);
    expect(adv.legend.data).toEqual(['Seattle', 'Phoenix']);
    const deltas = adv.series.filter((s: any) => s.areaStyle);
    expect(deltas.length).toBe(2);
    // Each band has a distinct stack id.
    const stacks = new Set(adv.series.map((s: any) => s.stack));
    expect(stacks.size).toBe(2);
    // The two visible deltas get distinct palette colors.
    expect(deltas[0].itemStyle?.color).not.toBe(deltas[1].itemStyle?.color);
  });
});

describe('Chart.js Range Area chart', () => {
  const cases = genChartJsRangeAreaTests();
  const basic = byTitle(cases, BASIC);
  const config = assembleChartjs(toInput(basic)) as any;

  it('builds a lower-bound and an upper-bound line dataset', () => {
    expect(config.type).toBe('line');
    expect(config.data.datasets.length).toBe(2);
    const [lower, upper] = config.data.datasets;
    expect(lower._rangeBound).toBe('lower');
    expect(upper._rangeBound).toBe('upper');
  });

  it('fills the upper dataset DOWN to the lower dataset (a band, not to zero)', () => {
    const [lower, upper] = config.data.datasets;
    expect(lower.fill).toBe(false);
    // Upper fills to the lower dataset's index → the ribbon between the bounds.
    expect(upper.fill).toEqual({ target: 0 });
    // Translucent fill.
    expect(String(upper.backgroundColor)).toMatch(/rgba\(.*0?\.\d+\)/);
  });

  it('uses a linear value axis (no forced zero baseline)', () => {
    expect(config.options.scales.y.type).toBe('linear');
    expect(config.options.scales.y.beginAtZero).toBeUndefined();
  });

  it('produces one band per color series, each upper filling to its own lower', () => {
    const adv = assembleChartjs(toInput(byTitle(cases, ADVANCED))) as any;
    // 2 cities → 4 datasets.
    expect(adv.data.datasets.length).toBe(4);
    const uppers = adv.data.datasets.filter((d: any) => d._rangeBound === 'upper');
    expect(uppers.length).toBe(2);
    // Each upper fills to ITS OWN lower (index 0 and index 2), never across bands.
    expect(uppers[0].fill).toEqual({ target: 0 });
    expect(uppers[1].fill).toEqual({ target: 2 });
    // Legend is shown; the lower datasets are filtered out so each band has one entry.
    expect(adv.options.plugins.legend.display).toBe(true);
    expect(typeof adv.options.plugins.legend.labels.filter).toBe('function');
  });
});

describe('Range Area gallery examples compile', () => {
  for (const tc of genRangeAreaTests()) {
    it(`Vega-Lite: ${tc.title}`, () => {
      const spec = assembleVegaLite(toInput(tc)) as any;
      const ok = !!spec.mark || !!spec.facet || !!spec.spec;
      expect(ok).toBe(true);
    });
  }
  for (const tc of genEChartsRangeAreaTests()) {
    it(`ECharts: ${tc.title}`, () => {
      const option = assembleECharts(toInput(tc)) as any;
      expect(option.series?.length).toBeGreaterThanOrEqual(2);
      // Every band has a transparent base and a translucent delta.
      expect(option.series.some((s: any) => s.areaStyle)).toBe(true);
      expect(option.series.some((s: any) => s.itemStyle?.color === 'transparent')).toBe(true);
    });
  }
  for (const tc of genChartJsRangeAreaTests()) {
    it(`Chart.js: ${tc.title}`, () => {
      const config = assembleChartjs(toInput(tc)) as any;
      expect(config.type).toBe('line');
      expect(config.data?.datasets?.length).toBeGreaterThanOrEqual(2);
      // At least one dataset fills to another dataset (the band).
      expect(
        config.data.datasets.some(
          (d: any) => d.fill && typeof d.fill === 'object' && 'target' in d.fill,
        ),
      ).toBe(true);
    });
  }
});
