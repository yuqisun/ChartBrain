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

## Templates (5)

| Category | Charts |
|----------|--------|
| Scatter & Point | Scatter Plot |
| Bar | Bar Chart (horizontal when the category channel is `y`) |
| Line & Area | Line Chart, Area Chart |
| Part-to-Whole | Pie Chart |

These cover exactly the ChartBrain neutral-spec whitelist, so the
`bar / line / pie / scatter / area` spec compiles identically on both the
ECharts and Highcharts paths.

## Known limitations (v1)

- **No faceting.** Highcharts has no native facet grid; `column` / `row`
  channels are not supported by this backend.
- **No chart-type transforms.** `chartProperties.chartType` / `arrange`
  (Flint's two-control transform model) is not wired up.
- **Temporal axes are `category`**, not `datetime`. Labels are sorted
  chronologically; a native datetime axis is a follow-up.
- **`resolvedEncodings` is empty**, so sort overrides fall back to
  `channelSemantics.ordinalSortOrder` / `encodings.sortBy`.
- **Size channel is ignored** on scatter (no `marker.radius` mapping yet).
- **Quantitative color is treated as categorical** (one series per distinct
  value) instead of a continuous `colorAxis` ramp. ChartBrain's neutral spec
  uses `series` for categorical grouping, so this only shows up if a measure is
  bound to `series`.
- **Duplicate x values are summed** on line/area, in both the category and the
  time-axis branches. Upstream's ECharts line template instead emits raw points
  for a time axis and keeps the first value on a category axis (its *bar*
  template sums). ChartBrain's `transform_plan` pre-aggregates, so real inputs
  have one row per (x, series) and the two backends agree point-for-point —
  verified by a 300-trial randomized differential test.

## Shared helpers

Discrete-axis helpers (`extractCategories`, `groupBy`, `detectAxes`,
`getCategoryOrder`) are imported from `echarts/templates/utils.ts` — upstream
keeps them there, and they are backend-agnostic in practice. Palettes are
Highcharts-native (`colormap.ts`).
