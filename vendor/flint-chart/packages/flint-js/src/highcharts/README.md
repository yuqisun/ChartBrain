# Highcharts Backend

Compiles the core semantic layer into [Highcharts](https://www.highcharts.com/)
options objects. Added by the ChartBrain fork; not part of upstream Flint.

## Output Format

```jsonc
{
  "chart": { "type": "column", "width": 640, "height": 400 },
  "title": { "text": "..." },
  "xAxis": { "type": "category", "categories": [...] },
  "yAxis": { "type": "linear", "min": 0 },
  "series": [{ "type": "column", "name": "...", "data": [...], "pointWidth": 42 }],
  "tooltip": { "shared": true },
  "legend": { "enabled": true },
  "colors": [...]
}
```

A plain options object, plus `_width` / `_height` / `_warnings` / `_dataLength`
hints. Consumed by `Highcharts.chart(container, option)`.

## Assembly Pipeline

| Phase | Step | Notes |
|-------|------|-------|
| PRE | `normalizeStaticSeries` → `applyEncodingOverrides` → `applyAggregation` | shared |
| **0** | `resolveChannelSemantics` + `computeZeroDecision` | shared |
| 0a | `declareLayoutMode` | template layout declaration |
| 0b | `convertTemporalData` + `filterOverflow` | shared |
| **1** | `computeLayout` | shared |
| **2** | `template.instantiate` → `hcApplyLayoutToSpec` → `hcApplyTooltips` | Highcharts-specific |

## LayoutResult → Highcharts mapping

| LayoutResult | Highcharts |
|---|---|
| `subplotWidth` / `subplotHeight` | `chart.width` / `chart.height` (+ chrome margins) |
| `xStep` / `yStep` + `stepPadding` | `series[].pointWidth` on column/bar series |
| `xLabel.labelAngle` | `xAxis.labels.rotation` |
| `xLabel/yLabel.fontSize` | axis label font sizes |
| `titleFontSize` / `legendFontSize` | title / legend / axis-title font sizes |
| `channelSemantics.y.zero` | `yAxis.min = 0` (or a padded domain when zero is excluded; left to Highcharts when negatives are present) |
| `truncations` | already reported by `filterOverflow` → `_warnings` |

## Templates (11)

All registered in `templates/index.ts` (`hcTemplateDefs`):

| Category | Charts |
|----------|--------|
| Scatter & Point | Scatter Plot, Connected Scatter Plot, Strip Plot |
| Bar | Bar Chart, Grouped Bar Chart, Stacked Bar Chart |
| Line & Area | Line Chart, Area Chart, Slope Chart |
| Part-to-Whole | Pie Chart, Donut Chart |

Backend series types (no extra Highcharts modules needed): the Bar family emits
`column` (`bar` when the category channel sits on `y`), Line Chart / Slope Chart
/ Connected Scatter Plot emit `line`, Area Chart emits `area`, Scatter Plot /
Strip Plot emit `scatter`, and Pie Chart / Donut Chart emit `pie` (Donut adds
`series[].innerSize`).

These cover exactly ChartBrain's 11-type neutral-spec whitelist
(`bar line pie scatter area groupedBar stackedBar donut slope connectedScatter
strip`), so every whitelisted spec compiles on both the ECharts and the
Highcharts paths.

## Known limitations (v1)

- **No faceting.** Highcharts has no native facet grid; `column` / `row`
  channels are not supported by this backend.
- **No chart-type transforms.** `chartProperties.chartType` / `arrange`
  (Flint's two-control transform model) is not wired up.
- **Temporal x on the line/area family is a native `datetime` axis** (not
  `category`): series data become `[epochMs, y]` pairs (see
  `tests/highcharts.test.ts` and `docs/INTEGRATION.md`). A temporal *category*
  on the bar-family charts stays a chronologically sorted `category` axis.
- **`resolvedEncodings` is empty**, so sort overrides fall back to
  `channelSemantics.ordinalSortOrder` / `encodings.sortBy`.
- **Size channel is ignored** on scatter (no `marker.radius` mapping yet).
- **Quantitative color is treated as categorical** (one series per distinct
  value) instead of a continuous `colorAxis` ramp. ChartBrain's neutral spec
  uses `series` for categorical grouping, so this only shows up if a measure is
  bound to `series`.
- **Duplicate `(x, series)` rows are out of contract.** The Highcharts
  line/area family *sums* rows sharing an x value, on both the category and the
  time-axis branches; Connected Scatter deliberately *keeps* duplicates (path
  semantics, `tests/highcharts.test.ts`). Upstream's ECharts category-axis
  alignment (line/slope) is *last-wins* (`map.set` overwrite in
  `src/echarts/templates/line.ts` / `slope.ts`), while its time/value axes keep
  raw points. ChartBrain's SDK transform runtime pre-aggregates in
  `transform_plan` (`aggregate` step), so real inputs have one row per
  `(x, series)` and the two backends agree point-for-point. That agreement is
  exercised deterministically by the committed dual-backend gate
  `scripts/chart-parity.mjs` (11 chart types, deduped fixtures; run
  `node scripts/chart-parity.mjs`).

## Shared helpers

Discrete-axis helpers (`extractCategories`, `groupBy`, `detectAxes`,
`getCategoryOrder`) are imported from `echarts/templates/utils.ts` — upstream
keeps them there, and they are backend-agnostic in practice. Palettes are
Highcharts-native (`colormap.ts`).
