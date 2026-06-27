# UI and Design System

Status: draft  
Date: 2026-06-26

## 1. Purpose

`qitu` should ship with a serious internal-app visual baseline, not a generic admin template.

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
Extend UI for file/import/review surfaces
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
2. Navigation.
3. Layout.
4. Forms.
5. Tables.
6. Modals.
7. Review surfaces.
8. Timeline components.

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

## 4. Design Rules

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

## 5. Font Direction

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

## 6. Review Surface Pattern

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
