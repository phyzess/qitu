export function assertUiPrimitiveCompositionGuards(context) {
  const { assert, exists, text, uiSources, uiStyles } = context;

  assert(
    text("packages/ui/src/segmented-control.tsx").includes("TabsTrigger") &&
      text("packages/ui/src/confirm-dialog.tsx").includes("AlertDialog") &&
      text("packages/ui/src/status-badge.tsx").includes("Badge") &&
      text("packages/ui/src/date-field.tsx").includes("Calendar") &&
      text("packages/ui/src/date-field.tsx").includes('captionLayout="dropdown"') &&
      text("packages/ui/src/date-field.tsx").includes("startMonth") &&
      text("packages/ui/src/date-field.tsx").includes("endMonth") &&
      text("packages/ui/src/date-field.tsx").includes("labelDayButton") &&
      text("packages/ui/src/date-field.tsx").includes("labelMonthDropdown") &&
      text("packages/ui/src/date-field.tsx").includes("labelYearDropdown") &&
      text("packages/ui/src/date-field.tsx").includes("localeCode={props.locale}") &&
      !text("packages/ui/src/date-field.tsx").includes("qitu-calendar-grid") &&
      !text("packages/ui/src/form.tsx").includes("@base-ui/react/input") &&
      !text("packages/ui/src/form.tsx").includes("@base-ui/react/select") &&
      !text("packages/ui/src/list-frame.tsx").includes("@base-ui/react/button") &&
      !text("packages/ui/src/shell.tsx").includes("<button") &&
      text("packages/ui/src/styles.css").includes('@import "./styles/theme.css";') &&
      text("packages/ui/src/styles.css").includes('@import "./styles/responsive.css";') &&
      exists("packages/ui/src/shell-app.tsx") &&
      exists("packages/ui/src/shell-navigation.tsx") &&
      exists("packages/ui/src/shell-types.ts") &&
      exists("packages/ui/src/shell-icons.tsx") &&
      exists("packages/ui/src/surface.tsx") &&
      exists("packages/ui/src/section-header.tsx") &&
      exists("packages/ui/src/data-state.tsx") &&
      exists("packages/ui/src/metric-strip.tsx") &&
      exists("packages/ui/src/timeline.tsx") &&
      exists("packages/ui/src/panel-action-button.tsx") &&
      exists("packages/ui/src/animated-icon-registry.tsx") &&
      exists("packages/ui/src/animated-icon-registry-shell.tsx") &&
      exists("packages/ui/src/animated-icon-registry-workflow.tsx") &&
      exists("packages/ui/src/animated-icon-registry-types.ts") &&
      exists("packages/ui/src/animated-icon-types.ts") &&
      exists("packages/ui/src/styles/animated-icon.css") &&
      exists("packages/ui/src/styles/surfaces.css") &&
      uiSources.includes("export const iconRegistry") &&
      uiSources.includes("export const shellIconRegistry") &&
      uiSources.includes("export const workflowIconRegistry") &&
      uiSources.includes("export type IconDefinition") &&
      uiStyles.includes("--qitu-icon-primary-transform") &&
      uiStyles.includes("--qitu-icon-box-left-transform") &&
      uiStyles.includes(".qitu-animated-icon .qitu-icon-primary") &&
      uiStyles.includes("@media (prefers-reduced-motion: reduce)") &&
      uiStyles.includes("@theme inline") &&
      uiStyles.includes("--color-popover: var(--qitu-color-popover);") &&
      uiSources.includes("function Table") &&
      uiSources.includes("function TableCell") &&
      uiSources.includes("function TableScrollArea") &&
      uiSources.includes("qitu-table-scroll-area") &&
      uiSources.includes("function Calendar") &&
      uiSources.includes("function CalendarDayButton") &&
      uiSources.includes("export function DateField") &&
      uiSources.includes("export function SegmentedControl") &&
      uiSources.includes("export function ConfirmDialog") &&
      uiSources.includes("export function CommandSearchFixture") &&
      uiSources.includes("export function BatchActionBar") &&
      uiSources.includes("export function DataToolbar") &&
      uiSources.includes("export function DetailDrawer") &&
      uiSources.includes("export function FilterBar") &&
      uiSources.includes("export function ListFrame") &&
      uiSources.includes("export function ListActionRow") &&
      uiSources.includes("export function UploadQueue") &&
      uiSources.includes("qitu-command-search-fixture") &&
      uiSources.includes("qitu-data-toolbar") &&
      uiSources.includes("qitu-filter-bar") &&
      uiSources.includes("qitu-list-frame") &&
      uiSources.includes("qitu-list-state-row") &&
      uiSources.includes("qitu-upload-compact"),
    "@qitu/ui must expose qitu-composed primitives, shell pieces, icons, and token-backed styles.",
  );

  const calendarClasses = text("packages/ui/src/calendar-class-names.ts");
  const dateField = text("packages/ui/src/date-field.tsx");
  assert(
    calendarClasses.includes("pointer-events-none absolute inset-x-0 top-0") &&
      calendarClasses.includes("pointer-events-auto size-(--cell-size)") &&
      dateField.includes("selectedDate ? `${props.label}: ${displayValue}` : props.label"),
    "calendar navigation must not cover dropdown hit targets and DateField must expose its selected value in the trigger name.",
  );

  const shellApp = text("packages/ui/src/shell-app.tsx");
  const shellNavigation = text("packages/ui/src/shell-navigation.tsx");
  assert(
    shellApp.includes("qitu-skip-link") &&
      shellApp.includes('id="qitu-main-content"') &&
      shellApp.includes("document.title = documentTitle") &&
      shellApp.includes("previousContentKeyRef.current === undefined") &&
      shellApp.includes("focus({ preventScroll: true })") &&
      shellApp.includes("qitu-route-title") &&
      shellNavigation.includes("event.button !== 0") &&
      shellNavigation.includes("event.metaKey") &&
      shellNavigation.includes('anchor.hasAttribute("download")'),
    "AppShell must preserve native modified-link behavior and own skip-link, localized title, route heading, and focus lifecycle semantics.",
  );

  assert(
    exists("packages/ui/src/workbench-layout.tsx") &&
      uiSources.includes("export function WorkbenchGrid") &&
      uiSources.includes('"context-wide"') &&
      uiSources.includes('"data"') &&
      uiSources.includes('"split"') &&
      uiStyles.includes('.qitu-workbench-grid[data-layout="context-wide"]') &&
      uiStyles.includes("@media (max-width: 1180px)") &&
      uiStyles.includes("@keyframes qitu-route-enter") &&
      uiStyles.includes("transform: none;") &&
      uiStyles.includes('[data-slot="dropdown-menu-content"]') &&
      !uiSources.includes("transition-all"),
    "workbench layouts and route/overlay motion must stay responsive, compositor-safe, and reduced-motion aware.",
  );

  const chartIndex = text("packages/charts/src/index.tsx");
  const chartInteraction = text("packages/charts/src/chart-interaction.tsx");
  assert(
    chartIndex.includes('import "./styles.css"') &&
      chartInteraction.includes('className="qitu-chart-legend-entry"') &&
      chartInteraction.includes('role="listitem">\n            <button'),
    "@qitu/charts must load its interaction styles and preserve a native button inside each legend list item.",
  );
}
