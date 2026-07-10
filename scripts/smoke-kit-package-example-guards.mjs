export function assertKitPackageExampleGuards(context) {
  const {
    assert,
    chartsPackage,
    dbPackage,
    exists,
    exampleImportReview,
    exampleJsonRecords,
    importPipeline,
    legacyImportAdapterName,
  } = context;

  assert(
    importPipeline.includes("ImportFeatureAdapter"),
    "import pipeline must expose ImportFeatureAdapter.",
  );
  assert(
    importPipeline.includes("commitApproved") && importPipeline.includes("CommitApprovedContext"),
    "import pipeline commit contract must require approved records and reviewer context.",
  );
  assert(
    importPipeline.includes("ConfirmationRecordDecisionActionSchema") &&
      importPipeline.includes("reviewActionForConfirmationAction") &&
      importPipeline.includes("confirmationStatusForStagedStatus"),
    "import pipeline must expose confirmation-language aliases over stable review actions.",
  );
  assert(
    exampleImportReview.includes("commitApproved"),
    "example import-review adapter must implement commitApproved.",
  );
  assert(
    exampleImportReview.includes("parseExampleStagedRecord") &&
      exists("examples/import-review/src/adapter.ts") &&
      exists("examples/import-review/src/source.ts") &&
      exists("examples/import-review/src/staged-record.ts") &&
      exampleImportReview.includes('line.toLowerCase() !== "label,value"'),
    "example import-review adapter must keep parsing, staging shape, and adapter logic in focused modules.",
  );
  assert(
    exampleJsonRecords.includes("jsonRecordsAdapter") &&
      exists("examples/json-records/src/adapter.ts") &&
      exists("examples/json-records/src/source.ts") &&
      exists("examples/json-records/src/records.ts") &&
      exampleJsonRecords.includes("parseJsonStagedRecord") &&
      exampleJsonRecords.includes("commitKey"),
    "example json-records adapter must keep JSON parsing, staged-record parsing, and commit output in focused modules.",
  );
  assert(
    !importPipeline.includes(legacyImportAdapterName),
    "import pipeline must not expose the legacy adapter name.",
  );
  assert(
    !dbPackage.includes("example_staged_records") &&
      !dbPackage.includes("example_committed_records") &&
      exists("packages/db/src/auth-tables.ts") &&
      exists("packages/db/src/source-import-tables.ts") &&
      exists("packages/db/src/review-tables.ts") &&
      exists("packages/db/src/email-tables.ts") &&
      exists("packages/db/src/event-tables.ts") &&
      dbPackage.includes("source_files_active_workspace_content_hash_idx") &&
      dbPackage.includes("source_files_deletion_started_at_idx") &&
      dbPackage.includes("import_jobs_mutation_started_at_idx") &&
      dbPackage.includes("import_jobs_processing_lease_idx") &&
      !dbPackage.includes('uniqueIndex("source_files_workspace_content_hash_idx")'),
    "core db package must keep example-owned tables out and split generic tables by capability.",
  );
  assert(
    chartsPackage.includes("TimeSeriesChart") &&
      exists("packages/charts/src/time-series-chart.tsx") &&
      exists("packages/charts/src/time-series-interaction.ts") &&
      exists("packages/charts/src/category-chart-utils.ts") &&
      exists("packages/charts/src/chart-interaction.tsx") &&
      exists("packages/charts/src/chart-grid.tsx") &&
      exists("packages/charts/src/chart-utils.ts") &&
      chartsPackage.includes("@visx/scale") &&
      chartsPackage.includes("@visx/shape") &&
      chartsPackage.includes("timeSeriesNavigation") &&
      chartsPackage.includes('aria-live="polite"') &&
      chartsPackage.includes("CategoryLegend") &&
      chartsPackage.includes("ChartTooltip") &&
      chartsPackage.includes("fitTextFontSize") &&
      chartsPackage.includes("shareLabel: string") &&
      chartsPackage.includes("valueLabel: string"),
    "charts package must expose focused visx primitives with caller-owned labels, keyboard inspection, tooltips, legends, and safe center text.",
  );
}
