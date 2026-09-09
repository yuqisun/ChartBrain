# Vendored Flint (`flint-chart`)

This directory contains a **vendored copy** of Microsoft's
[flint-chart](https://github.com/microsoft/flint-chart), restricted to
`packages/flint-js`. It is not a git fork and is not tracked against upstream.

## Provenance

| | |
|---|---|
| Upstream | https://github.com/microsoft/flint-chart |
| Package | `flint-chart` (npm) |
| Version | **0.5.1** |
| Commit | `34ef451` (`[deploy] Merge pull request #96 from microsoft/dev`, 2026-08-13) |
| License | MIT, © Microsoft Corporation — see `LICENSE` (kept verbatim) |
| Vendored | 2026-09, by the ChartBrain project |

## Why vendor instead of depending on npm

ChartBrain's Highcharts backend needs the **compiler pipeline itself**, not just
the public `assemble*()` entry points. Several pipeline functions the backends
use internally (`applyAggregation`, `decideColorMaps`,
`normalizeChartProperties`, `deriveStretchCaps`, `resolveBaseSize`,
`resolveFacetColumnsOption`, `resolveChartDefaults`, `resolveCompileDefaults`)
are **not exported** from the `flint-chart/core` barrel, and
`packages/flint-js/package.json#exports` has no wildcard, so deep imports into
an npm-installed copy are blocked.

Vendoring keeps those internals available (`import '../core/...'`) without
maintaining a separate GitHub fork.

## Divergence from upstream

Everything below is additive, with **one** exception: the only upstream *logic*
that was touched is an additive branch inside `src/echarts/instantiate-spec.ts`
(see that row below). Every other upstream file is either brand new or extended
without altering existing behavior — existing templates, registrations and
exports are left intact.

| File | Change |
|---|---|
| `src/highcharts/**` | **New backend**: `assemble.ts`, `instantiate-spec.ts`, `colormap.ts`, `templates/{area,bar,connected-scatter,donut,index,line,pie,scatter,slope,strip,utils}.ts`, `README.md` |
| `src/index.ts` | `+ export * from './highcharts';` |
| `tsup.config.ts` | `+ 'highcharts/index': 'src/highcharts/index.ts'` |
| `package.json` | `+ "./highcharts"` export, `+ highcharts` optional peerDependency, `+ highcharts` keyword, `+ vega` and `+ vega-lite` devDependencies |
| `.npmrc` | `+ legacy-peer-deps=true` (npm 10.x crashes in `#loadPeerSet` on this vitest 4.x peer graph) |
| `src/echarts/instantiate-spec.ts` | **The only upstream *logic* edit** (`ecApplyLayoutToSpec`): `colorByDataItem` now also includes `'Donut Chart'`, so donut slices get the same per-data-item coloring as pie/rose instead of a single series color. Additive — an `||` branch was appended, nothing rewritten. |
| `src/echarts/templates/pie.ts` | Appends `ecDonutChartDef` after the untouched upstream `ecPieChartDef`: a donut is a pie whose non-zero `innerRadius` default is injected at instantiate time (property defaults are not merged by the compiler). |
| `src/echarts/templates/index.ts` | `+ import` and registration of `ecDonutChartDef` under `'Part-to-Whole'` |
| `tests/highcharts.test.ts` | **New**: backend smoke tests (later extended from five to the eleven chart types) |
| `tests/donut.test.ts` | **New**: donut default-hole and explicit-`innerRadius` coverage on both the Highcharts and ECharts paths |

## Upstream tracking policy

**Not tracked.** ChartBrain froze upstream at 0.5.1 and does not plan to merge
upstream changes. Consequences accepted deliberately:

- no upstream bug fixes, new semantic types or new templates;
- no upstream CodeQL / dependency updates;
- `flint-py`, `flint-mcp`, `site/`, `shared/test-data/` and `test-harness/` are
  intentionally **not** vendored.

If upstream changes are ever wanted, the diff surface is the table above, so a
manual re-vendor is straightforward.

## Build

`dist/` is **not** committed (root `.gitignore` ignores it). Build before use:

```bash
cd vendor/flint-chart/packages/flint-js
npm install     # legacy-peer-deps comes from .npmrc
npm run build   # tsup → dist/
npm test        # vitest
```

`vega-lite` **and** `vega` are pinned as **devDependencies** because upstream's
`tests/heatmap-colors.test.ts` imports `compile` from `vega-lite`, and
`vega-lite`'s own build imports `vega` at runtime. Upstream resolves both
transitively through the `site` workspace (which is not vendored), so without
these entries a standalone `npm test` fails on that one file with
`Cannot find package 'vega'`.

This directory's `package-lock.json` is **not committed** (see `.gitignore`).
Upstream has no lock here, and a committed lock would pin whichever registry it
was generated against — the local install used `registry.npmmirror.com`, while
this repo's other lockfiles use `registry.npmjs.org`. CI runs `npm install`, so
each environment resolves through its own configured registry.

`ChartBrain/sdk` depends on this directory via
`"flint-chart": "file:../vendor/flint-chart/packages/flint-js"`, so the SDK
resolves the vendored build through a symlink. **Rebuild after changing this
directory**, then re-run the SDK tests.

## Highcharts backend scope (v1)

Supported (eleven types, B1): Bar, Line, Pie, Scatter, Area, Grouped Bar,
Stacked Bar, Donut, Slope, Connected Scatter, Strip — exactly ChartBrain's
11-type neutral-spec whitelist. Temporal x on the line/area family compiles to a
native `datetime` axis (`[epochMs, y]` pairs); a temporal *category* on the
bar-family charts stays a chronologically sorted `category` axis. Not supported:
faceting, chart-type transforms, size channel on scatter. See
`src/highcharts/README.md` for details.
