# Cloudflare Deployment Preparation

Status: draft  
Date: 2026-06-27

This runbook prepares a real Cloudflare account for `qitu`. It does not deploy automatically because account IDs, resource IDs, verified senders, and final hostnames are environment-specific.

## 1. Dry Run

Run a Worker bundle dry-run before touching remote resources:

```sh
vp run deploy:dry-run
```

The dry-run output is written under `.tmp/worker-dry-run`, which is ignored by git.

Preview and production dry-runs build the web app first, then verify the Worker + Static Assets bundle:

```sh
vp run deploy:preview:dry-run
vp run deploy:production:dry-run
```

`apps/worker/wrangler.jsonc` serves the built React app as same-origin Worker Static Assets for preview and production. API routes still run through the Worker first for `/api/*` and `/health`, so the web app can keep relative API URLs and HttpOnly cookies without adding CORS.

## 2. Required Resources

The Worker expects:

| Binding        | Product | Local name                 | Preview name                   | Production name                   |
| -------------- | ------- | -------------------------- | ------------------------------ | --------------------------------- |
| `DB`           | D1      | `qitu-dev`                 | `qitu-preview`                 | `qitu-production`                 |
| `SOURCE_FILES` | R2      | `qitu-source-files-dev`    | `qitu-source-files-preview`    | `qitu-source-files-production`    |
| `IMPORT_JOBS`  | Queues  | `qitu-import-jobs-dev`     | `qitu-import-jobs-preview`     | `qitu-import-jobs-production`     |
| DLQ            | Queues  | `qitu-import-jobs-dev-dlq` | `qitu-import-jobs-preview-dlq` | `qitu-import-jobs-production-dlq` |
| `EMAIL`        | Email   | local metadata only        | Cloudflare Email Sending       | Cloudflare Email Sending          |

Create remote resources with account-specific names:

```sh
wrangler d1 create qitu-preview
wrangler r2 bucket create qitu-source-files-preview
wrangler queues create qitu-import-jobs-preview
wrangler queues create qitu-import-jobs-preview-dlq
wrangler d1 create qitu-production
wrangler r2 bucket create qitu-source-files-production
wrangler queues create qitu-import-jobs-production
wrangler queues create qitu-import-jobs-production-dlq
```

Then replace `REPLACE_WITH_PREVIEW_D1_DATABASE_ID` and `REPLACE_WITH_PRODUCTION_D1_DATABASE_ID` in `apps/worker/wrangler.jsonc` before remote migration or deployment.

Cloudflare Email Service must be configured with a verified sender before invitation or password reset email can be sent outside local mode. Set `MAIL_FROM` to a verified address for the target environment and keep `PUBLIC_APP_URL` aligned with the deployed web origin.

## 3. Secrets

The current kit baseline uses deterministic local AI advisory generation and does not require model-provider secrets. Future provider adapters should set secrets through Wrangler or the Cloudflare dashboard:

```sh
wrangler secret put PROVIDER_API_KEY --env preview
wrangler secret put PROVIDER_API_KEY --env production
```

Do not commit secret values into `.env`, `.dev.vars`, docs, or `wrangler.jsonc`.

`MAIL_FROM`, `PUBLIC_APP_NAME`, and `PUBLIC_APP_URL` are configuration values, not secrets. They still need environment-specific review before deployment.

## 4. Remote Migration

After resource IDs are set:

```sh
vp run db:migrate:preview
vp run db:migrate:production
```

Remote migration should be explicit and reviewed. Do not hide it behind the default local setup command.

After each remote migration, inspect the migration list and at least one expected table:

```sh
wrangler d1 migrations list qitu-preview --env preview --remote
wrangler d1 execute qitu-preview --env preview --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

## 5. Deployment Gate

Before a real deployment:

1. Run `vp run verify:kit`.
2. Run `vp run deploy:dry-run`.
3. Run the target env dry-run: `vp run deploy:preview:dry-run` or `vp run deploy:production:dry-run`.
4. Confirm remote resource IDs are not placeholders.
5. Confirm `PUBLIC_APP_URL` matches the deployed web origin.
6. Confirm provider secrets exist if optional real AI providers are enabled.
7. Confirm `MAIL_FROM` uses a verified Cloudflare Email sender.
8. Confirm invitation bootstrap routes are disabled outside `APP_ENV=local`.
9. Confirm the target queue has a dead-letter queue.
10. Run the failed-job snapshot for the target environment.

```sh
vp run ops:failed-jobs -- preview --limit 50
vp run ops:failed-jobs -- production --limit 50
```

## 6. DLQ And Failed Job Recovery

Use `docs/operations/dlq-remediation.md` when Queue messages reach a dead-letter queue or import jobs appear stuck. The baseline recovery path is deliberately manual:

1. Inspect failed or suspicious jobs with `vp run ops:failed-jobs`.
2. Restore missing R2 source objects or deploy missing adapters before retrying.
3. Retry through the app/API so RBAC, audit, idempotency, and Queue dispatch stay intact.
4. Escalate repeated failures instead of blind replaying DLQ messages.

The starter does not attach an automatic DLQ consumer. Add one only after a real production queue proves that manual recovery is insufficient.

## 7. Known Gaps

Before production use, add:

1. Runtime integration tests for auth, email, upload, queue, D1, R2, and audit.
2. A deployment automation or infrastructure-as-code path.
