export function assertKitRepoInventoryGuards(context) {
  const { assert, exists, text } = context;

  assert(!exists("domains"), "top-level domains/ must not exist.");
  assert(exists("examples/import-review"), "examples/import-review must exist.");
  assert(exists("examples/json-records"), "examples/json-records must exist.");
  assert(
    exists("examples/organization-access/src/index.ts") &&
      exists("examples/organization-access/migrations/0001_organization_access.sql"),
    "optional organization access must ship as an executable, copyable example.",
  );
  assert(exists("templates/app"), "templates/app must exist.");
  assert(exists("templates/app/manifest.json"), "templates/app/manifest.json must exist.");
  assert(exists("templates/feature"), "templates/feature must exist.");
  assert(exists("templates/feature/package.json"), "templates/feature/package.json must exist.");
  assert(exists("templates/feature/tsconfig.json"), "templates/feature/tsconfig.json must exist.");
  assert(
    exists("templates/feature/migrations/0001_template_feature.sql"),
    "templates/feature must include a feature-owned migration slot.",
  );
  const featureMigration = text("templates/feature/migrations/0001_template_feature.sql");
  assert(
    featureMigration.includes("source_file_id") &&
      featureMigration.includes("staged_record_key") &&
      featureMigration.includes("committed_record_id") &&
      featureMigration.includes("updated_at") &&
      featureMigration.includes("template_feature_committed_records_job_key_idx"),
    "the feature migration slot must support the WorkerReviewStore staging and commit contract.",
  );
  assert(
    exists("templates/feature/src/import-feature.ts"),
    "templates/feature must expose a real TypeScript adapter starter.",
  );
  assert(
    exists("templates/feature/src/registry.ts"),
    "templates/feature must expose an app-owned registry starter.",
  );
  assert(
    exists("templates/feature/src/fixtures.ts") && exists("templates/feature/src/web-surface.ts"),
    "templates/feature must expose integration fixtures and a web surface descriptor.",
  );
  assert(
    exists("templates/feature/derived-artifact-recipe.md"),
    "templates/feature must include the optional versioned derived-artifact recipe.",
  );
  assert(
    !exists("templates/feature/src/import-feature.ts.txt"),
    "templates/feature must not regress to an unchecked .ts.txt adapter.",
  );
  assert(exists(".github/workflows/verify.yml"), "GitHub verify workflow must exist.");
  assert(exists("AGENTS.md"), "AGENTS.md must exist.");
  assert(exists("CLAUDE.md"), "CLAUDE.md must exist.");
  assert(exists("PI.md"), "PI.md must exist.");
  assert(exists(".env.example"), ".env.example must exist.");
  assert(exists("apps/worker/.dev.vars.example"), "apps/worker/.dev.vars.example must exist.");
  assert(
    exists("docs/guides/optional-organization-access.md") &&
      exists("docs/guides/versioned-derived-artifacts.md") &&
      exists("docs/templates/organization-migration-runbook.md") &&
      exists("docs/operations/source-lifecycle.md"),
    "organization, derived-artifact, and source-lifecycle adoption guidance must remain copyable.",
  );
}
