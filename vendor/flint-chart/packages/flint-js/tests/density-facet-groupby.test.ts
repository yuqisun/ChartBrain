// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';

/**
 * Regression: a faceted density plot must include the facet field (column/row)
 * in the density transform's `groupby`. The transform only emits its
 * value/density columns plus the grouped fields, so omitting the facet field
 * dropped it from the transformed data — the column facet then collapsed to a
 * single "undefined" panel with every facet pooled together.
 */

function makeDensityInput(opts: { color?: boolean; column?: boolean; row?: boolean }) {
  let seed = 13;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const sites = ['Lab A', 'Lab B'];
  const batches = ['Morning', 'Evening'];
  const data: any[] = [];
  for (const site of sites) {
    for (const batch of batches) {
      for (let i = 0; i < 60; i++) {
        data.push({ Reading: Math.round(rnd() * 90), Batch: batch, Site: site });
      }
    }
  }
  const encodings: Record<string, any> = { x: { field: 'Reading' } };
  if (opts.color) encodings.color = { field: 'Batch' };
  if (opts.column) encodings.column = { field: 'Site' };
  if (opts.row) encodings.row = { field: 'Site' };
  return {
    data: { values: data },
    semantic_types: { Reading: 'Quantity', Batch: 'Category', Site: 'Category' },
    chart_spec: { chartType: 'Density Plot', encodings, baseSize: { width: 560, height: 320 } },
  };
}

const densityGroupby = (spec: any): string[] =>
  (spec.transform ?? []).find((t: any) => t.density)?.groupby ?? [];

describe('faceted density plot groupby', () => {
  it('keeps the column facet field in the density transform groupby', () => {
    const spec = assembleVegaLite(makeDensityInput({ color: true, column: true })) as any;
    const groupby = densityGroupby(spec);
    expect(groupby).toContain('Site');
    expect(groupby).toContain('Batch');
    expect(spec.encoding?.facet?.field).toBe('Site');
  });

  it('keeps the row facet field in the density transform groupby', () => {
    const spec = assembleVegaLite(makeDensityInput({ color: true, row: true })) as any;
    expect(densityGroupby(spec)).toContain('Site');
  });

  it('groups a facet-only density (no color) by the facet field', () => {
    const spec = assembleVegaLite(makeDensityInput({ column: true })) as any;
    expect(densityGroupby(spec)).toContain('Site');
  });

  it('leaves an ungrouped single-distribution density without groupby', () => {
    const spec = assembleVegaLite(makeDensityInput({})) as any;
    expect(densityGroupby(spec)).toHaveLength(0);
  });
});

/**
 * Regression: the `bandwidth` property is a *relative* smoothing multiplier, not
 * an absolute width in data units. A literal 0.05 on a 0–90 `Reading` scale used
 * to be passed straight through, producing a spiky near-zero-smoothing curve.
 * It must instead scale the data-derived Silverman base.
 */
const densityBandwidth = (spec: any): number | undefined =>
  (spec.transform ?? []).find((t: any) => t.density)?.bandwidth;

describe('density plot bandwidth (relative multiplier)', () => {
  it('omits the transform bandwidth at the auto (0) default', () => {
    const spec = assembleVegaLite(makeDensityInput({})) as any;
    expect(densityBandwidth(spec)).toBeUndefined();
  });

  it('scales the data-derived base rather than passing the raw slider value', () => {
    const input = makeDensityInput({});
    input.chart_spec.encodings = { ...input.chart_spec.encodings };
    (input.chart_spec as any).chartProperties = { bandwidth: 1 };
    const spec = assembleVegaLite(input) as any;
    const bw = densityBandwidth(spec);
    // A 0–90 Reading scale yields a Silverman base of order ~10, so a 1× factor
    // is far larger than the raw slider value (which would be a spiky 1.0).
    expect(bw).toBeGreaterThan(3);
  });

  it('keeps the multiplier proportional (2× is twice 1×)', () => {
    const mk = (b: number) => {
      const input = makeDensityInput({});
      (input.chart_spec as any).chartProperties = { bandwidth: b };
      return densityBandwidth(assembleVegaLite(input) as any)!;
    };
    expect(mk(2)).toBeCloseTo(mk(1) * 2, 6);
  });
});

