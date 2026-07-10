# Upgrade Notes

Status: draft  
Date: 2026-07-10

Use this document when upgrading a cloned `qitu` project or when applying future `qitu` changes to an app that already has business features.

## Upgrade Rule

Upgrade reusable infrastructure without moving business meaning into core packages.

Core packages may evolve contracts for:

1. Auth and sessions.
2. RBAC permissions.
3. Files and object metadata.
4. Jobs and queues.
5. Import/review/commit interfaces.
6. Audit events.
7. Email messages.
8. AI advisory artifacts.
9. UI primitives and design tokens.

Business apps own:

1. Feature adapters.
2. Staging tables.
3. Committed business tables.
4. Product-specific screens.
5. Product-specific calculations.
6. Product-specific chart semantics.

## Safe Upgrade Checklist

Before applying an upgrade:

1. Run `vp run verify:kit` on the source baseline.
2. Read `docs/release-notes.md` and `docs/decisions/decision-log.md`.
3. Identify migrations that affect reusable tables.
4. Identify package API changes in `packages/*`.
5. Confirm app-owned feature code still implements `ImportFeatureAdapter`.
6. Confirm no reusable package imports from `apps/*` or `examples/*`.

After applying an upgrade:

1. Run `vp install`.
2. Run `vp check --fix`.
3. Run `vp run smoke`.
4. Run `vp run verify:kit`.
5. Run the app's business-specific tests.
6. Run the relevant deployment dry-run before remote migration or deployment.

## 2026-07-10 Adoption Sequence

Apply this baseline in the following order:

1. Back up D1 and confirm the target Worker/environment.
2. Apply every new migration in filename order. The current additions introduce source
   tombstones, a source-deletion claim, and import processing/mutation leases including the
   recoverable `committing` state.
3. Implement and test every adopted adapter's source cleanup hook before enabling source deletion.
4. Make `commitApproved` idempotent for the stable `context.idempotencyKey` described below.
5. Deploy the Worker before exposing new raw-source, reparse, redispatch, void, adjustment, or
   deletion controls in a product UI.
6. Update product status projections to recognize `committing` as an in-progress, non-editable job.
7. Run local migrations, Worker integration/runtime tests, unit tests, and browser smoke against an
   isolated persistence directory before the remote migration.

Do not backport only the routes. The migrations, claims, event/audit evidence, retry semantics, and
integration checks form one recovery contract.

Current migration purposes:

| Migration                        | Purpose                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `0009_source_lifecycle.sql`      | Active-source uniqueness plus soft tombstones.                                                                    |
| `0010_source_deletion_claim.sql` | Exclusive deletion ownership, retry-stage evidence, and a guard against attaching new jobs after deletion starts. |
| `0011_import_commit_claim.sql`   | Business-neutral import processing ownership, review/commit mutation leases, and the recoverable previous status. |

## Database Migrations

Migrations are append-only.

Do:

1. Add new migration files under `apps/worker/migrations`.
2. Keep local, preview, and production migration commands explicit.
3. Prefer additive columns and indexes for starter upgrades.
4. Document data backfills before production use.

Do not:

1. Edit applied migration files in a cloned app.
2. Put business-specific tables into generic docs as required core tables.
3. Store plaintext tokens, passwords, raw email bodies, or raw source files in D1.

The source lifecycle migrations deliberately keep tombstoned source metadata and historical
audit/job events as report-only evidence. A cloned app must define retention/compliance policy before
adding a destructive purge.

## RBAC Changes

The starter baseline uses:

```text
owner
admin
reviewer
viewer
```

When adding permissions:

1. Add the permission to `packages/rbac`.
2. Guard the Worker write route with `requirePermission`.
3. Add an integration test for at least one allowed and one denied path.
4. Ensure denials write `rbac.denied`.
5. Update `docs/architecture/auth-security.md`.

Tenant-aware scopes should be added as a deliberate app or platform decision, not as a hidden change to the starter role table.

## Feature Adapter Changes

The core import pipeline should remain stable around:

```text
canHandle -> parse -> stage -> validate -> commitApproved
```

If a feature needs richer behavior:

1. Add it first to app-owned feature code.
2. Prove it through a vertical slice.
3. Extract only the reusable contract that at least two features need.
4. Keep example packages optional.

The current adapter contract also includes these adoption rules:

1. `commitPolicy` defaults to `"manual"`. Use `"auto_when_clean"` only for deterministic adapters
   whose clean results may be committed without an additional product-specific decision. The
   `autoCommitCleanImports` flag is a compatibility alias; new code should use `commitPolicy`.
2. Open errors still block the automatic path. AI advisory confirmation is separate and never turns
   an adapter into an automatic committer.
3. `commitApproved` receives a stable `context.idempotencyKey` of `commit:${jobId}`. Any external,
   remote, or business-owned write performed by the adapter must use that key (or a deterministic
   child key) to make repeated execution idempotent.
4. A stale `committing` lease is resumed by replaying the adapter with the same
   `commit:${jobId}` key. An adapter that ignores the key can duplicate side effects even if qitu's
   D1 persistence remains guarded.
5. Source delete and job void must never bypass a fresh or stale `committing` claim. Resume or
   recover commit first; only a non-committing terminal/review state may proceed to void or source
   cleanup.
6. An adapter that participates in source deletion implements
   `WorkerReviewStore.prepareDeleteSourceRecords` and makes its cleanup idempotent. The hook owns
   staged, committed, derived, and report data contributed by the source; core cannot infer those
   tables.

## Queue and Runtime Changes

1. Queue consumers use a one-second maximum batch timeout in the starter config to reduce fallback
   latency. Preserve the binding name and dead-letter queue when merging environment-specific
   `wrangler.jsonc` changes.
2. Merge the `*/5 * * * *` Cron trigger for local, preview, and production together with the
   Worker's `scheduled` handler. Wrangler registers the trigger; it is the durable recovery path for
   expired or failed source-deletion claims and does not require a separately created resource.
3. The `ctx.waitUntil` fast path is optional latency work, not durable delivery. Do not delete or
   acknowledge Queue messages from that path.
4. Use the failed-job retry route when the initial Queue send fails after source persistence. Keep
   the audited queued-job redispatch route for jobs whose send succeeded but which remain queued
   without processing evidence.
5. Keep `apps/worker/wrangler.test.jsonc` isolated from deploy configuration. Root unit tests and
   Worker runtime tests have separate Vitest collection paths, and browser smoke uses a per-process
   persistence directory. The Workers-pool runtime suite allows a 30-second cold-start budget so
   concurrent local builds do not trip Vitest's five-second unit-test default.
6. Keep local migration discovery dynamic. Do not reintroduce a hard-coded "latest migration" marker
   when adding source, import, or feature migrations.

## UI and Chart Changes

1. `AppShell` accepts `contentKey`, `contentTitle`, `documentTitle`, and localized skip/navigation
   labels. A route change focuses main content; initial mount does not. Provide one meaningful `h1`
   either through `contentTitle` or in page content.
2. Link navigation items may carry `target` and `download`; do not replace their native modified-link
   behavior with unconditional router interception.
3. Prefer `WorkbenchPage`, `WorkbenchGrid`, and `ContextPanel` over page-local two-column recipes.
4. `DateField` locale dictionaries should provide month/year dropdown labels in addition to
   previous/next-month copy.
5. `@qitu/charts` now owns its stylesheet. Keep labels and tooltip terminology app-owned, and provide
   a textual announcement callback when rich tooltip React content cannot be reduced to meaningful
   text.

## Optional Examples

`examples/organization-access` and the versioned-derived-artifact recipe are opt-in material. Do not
apply the organization migration, tenant ownership, support-access policy, artifact schema, or
formula-version rules merely because they exist in the starter. Adopt them only through a reviewed
app-owned migration and use the corresponding runbook/guide.
