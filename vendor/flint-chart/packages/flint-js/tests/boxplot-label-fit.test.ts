// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';

/**
 * Regression: horizontal categorical x-axis labels must not overlap when the
 * per-band step is narrower than the widest label.
 *
 * Box marks declare a small defaultBandSize (28px), so a few short string
 * categories like "regular / midgrade / premium" used to be forced horizontal
 * regardless of fit and ran together ("regularidgradepremium"). The layout
 * engine now widens the band within the stretch budget to keep labels
 * horizontal, or angles them (-45°) when even the budget can't fit.
 */

// Mirror the layout engine's label-width heuristic (compute-layout.ts).
const APPROX_CHAR_WIDTH_RATIO = 0.62;

function makeBoxplotInput(grades: string[], width: number) {
  let seed = 1;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const data: any[] = [];
  for (const g of grades) for (let i = 0; i < 20; i++) {
    data.push({ Grade: g, Price: Math.round(rnd() * 100) });
  }
  return {
    data: { values: data },
    semantic_types: { Grade: 'Category', Price: 'Quantity' },
    chart_spec: {
      chartType: 'Boxplot',
      encodings: { x: { field: 'Grade' }, y: { field: 'Price' } },
      baseSize: { width, height: 300 },
    },
  };
}

function xAxisLayout(input: unknown) {
  const spec = assembleVegaLite(input as any) as any;
  const axisX = spec.config?.axisX ?? {};
  const step = typeof spec.width === 'object' ? spec.width.step : undefined;
  return { step, labelAngle: axisX.labelAngle, fontSize: axisX.labelFontSize };
}

/** Labels are non-overlapping iff they fit the band horizontally, or are angled. */
function assertNonOverlapping(grades: string[], step: number | undefined, labelAngle: number, fontSize: number) {
  const maxLen = Math.max(...grades.map((g) => g.length));
  const labelPx = maxLen * fontSize * APPROX_CHAR_WIDTH_RATIO;
  const horizontalFits = labelAngle === 0 && step !== undefined && step >= labelPx;
  const angled = labelAngle === -45;
  expect(horizontalFits || angled).toBe(true);
}

describe('boxplot categorical x-axis label fitting', () => {
  it('widens the band so 3 wide labels stay horizontal and do not overlap', () => {
    const grades = ['regular', 'midgrade', 'premium']; // longest 8 chars > 28px band
    const { step, labelAngle, fontSize } = xAxisLayout(makeBoxplotInput(grades, 300));
    // Widened beyond the 28px box defaultBandSize to fit "midgrade".
    expect(step).toBeGreaterThan(28);
    expect(labelAngle).toBe(0);
    assertNonOverlapping(grades, step, labelAngle, fontSize);
  });

  it('angles labels when the stretch budget cannot fit a wide-enough band', () => {
    const grades = ['regular_', 'midgrade', 'premium_', 'superpr_'];
    // Tiny canvas → tight per-band budget that cannot grow to ~56px.
    const { step, labelAngle, fontSize } = xAxisLayout(makeBoxplotInput(grades, 60));
    expect(labelAngle).toBe(-45);
    assertNonOverlapping(grades, step, labelAngle, fontSize);
  });

  it('leaves the band unchanged when short labels already fit horizontally', () => {
    const grades = ['A', 'B', 'C'];
    const { step, labelAngle, fontSize } = xAxisLayout(makeBoxplotInput(grades, 300));
    expect(step).toBe(28); // box defaultBandSize, no widening needed
    expect(labelAngle).toBe(0);
    assertNonOverlapping(grades, step, labelAngle, fontSize);
  });
});
