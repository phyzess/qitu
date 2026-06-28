# UI and Design System

Status: accepted baseline  
Date: 2026-06-28

## 1. Purpose

`qitu` should ship with a serious internal-app visual baseline, not a generic admin template.

The design entry point is `DESIGN.md`. This architecture document explains package boundaries and reusable implementation requirements.

The UI should feel:

1. Quiet.
2. Dense but readable.
3. Fast.
4. Auditable.
5. Built for repeated work.
6. Modern without decorative noise.

## 2. Technology Baseline

```text
React
shadcn/ui Base UI
Tailwind
Extend UI inspiration for file/import/review surfaces
visx-only chart primitives
```

## 3. Package Split

```text
packages/ui
packages/design-system
packages/charts
```

`packages/ui` owns:

1. App shell.
2. Rail navigation.
3. Topbar and command/search affordance.
4. Layout and surfaces.
5. Forms.
6. Tables.
7. Modals.
8. Review surfaces.
9. Timeline components.
10. Data-state components.

`packages/design-system` owns:

1. Color tokens.
2. Typography tokens.
3. Spacing.
4. Shadows.
5. Motion.
6. Radius.
7. Theme variables.

`packages/charts` owns:

1. Time series.
2. Bar chart.
3. Donut chart.
4. Scatter/compare chart.
5. Tooltip, legend, crosshair.

## 4. Workbench Model

The default qitu application surface is:

```text
rail | topbar
     | main work surface + contextual inspector
     | event/import stream when needed
```

Reusable pages should start from this workbench model. A concrete app may reorder regions for its domain, but should not rebuild the app shell from scratch.

Responsive rules:

1. Below `1180px`, inspector/context panels can move below the primary surface.
2. Below `780px`, stack content in workflow order.
3. Avoid horizontal page scroll. Tables may scroll in bounded containers.
4. Use `min-width: 0`, truncation, wrapping, and fixed shell dimensions deliberately.

## 5. Design Rules

1. Do not create a landing page for internal tools.
2. Start with the actual working interface.
3. Use compact page headers.
4. Prefer tonal separation and shadow over excessive borders.
5. Keep cards shallow and purposeful.
6. Do not nest cards inside cards.
7. Use fixed dimensions for toolbars, grids, counters, tiles, and chart shells.
8. Do not scale type with viewport width.
9. Use tabular numbers for metrics.
10. Keep chart APIs internal; app pages should not import chart engine packages directly.
11. Use semantic color only for state, risk, status, and charts.
12. Loading, empty, error, and partial states are part of the component contract.

## 6. Font Direction

Default font tokens:

```text
--font-ui
--font-doc
--font-reading
--font-number
--font-mono
```

Recommended defaults:

1. UI: MiSans or system CJK sans fallback.
2. Documents: Noto Serif SC.
3. Reading template: optional LXGW WenKai Screen.
4. Numbers: UI font + Fira Code fallback.
5. Mono: Fira Code.

## 7. Chart Contract

`packages/charts` is a maintained visx-only layer. App-owned pages must use qitu chart components and must not import `@visx/*` directly.

Baseline exported chart components:

1. `TimeSeriesChart`
2. `DrawdownChart`
3. `PerformancePanelChart`
4. `BarChart`
5. `DonutChart`
6. `ComparisonScatterChart`

Each chart must support:

1. Empty state.
2. Loading state.
3. Error state.
4. Partial-data state.
5. Dark token-driven colors.
6. Tabular number formatting.

## 8. Review Surface Pattern

Every review page should include:

1. Source summary.
2. Parser/rule version.
3. Timeline.
4. Staged data summary.
5. Issues and conflicts.
6. Primary decision actions.
7. Audit preview.
8. Raw file access if permitted.

Viewer projection:

1. Status summary.
2. Timeline summary.
3. No raw file.
4. No review detail.
5. No sensitive parsed rows.

## 9. Starter Component Coverage

The starter shell should include reusable components for:

1. Workbench shell.
2. Status and risk badges.
3. File upload/drop zone.
4. Import job list/table.
5. Review action bar.
6. Staged data table.
7. Metric strip.
8. Context inspector.
9. Timeline/event stream.
10. Data state wrapper.
