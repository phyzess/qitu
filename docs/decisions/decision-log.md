# Decision Log

This file records accepted decisions for `qitu`.

Use short entries here. When a decision needs more detail, create a dedicated record from `docs/templates/decision-record.md` and link it from this log.

## Accepted

### 2026-06-26: Canonical Name

Decision:

```text
qitu
```

Rules:

1. Use lowercase everywhere.
2. Do not append `kit`, `framework`, or `starter` to the canonical name.
3. Use `@qitu/*` as the future package namespace.

Reason:

`qitu` comes from 鵸鵌, a multi-headed bird from Shan Hai Jing. The image fits a fullstack starter made of coordinated modules such as auth, data, jobs, review, email, AI advisory, UI, and operations.

The ASCII name is short, pronounceable, repo-friendly, and not tied to a specific business domain. The Chinese homophone with 歧途 is acceptable as an inside joke rather than a naming blocker.

### 2026-06-26: Business-Neutral Core

Decision:

`qitu` provides reusable application capabilities. Business meaning belongs in app-owned feature code, examples, or templates.

Core may own:

1. Auth.
2. RBAC.
3. Files.
4. Jobs.
5. Import pipeline.
6. Review workflow.
7. Audit events.
8. Email.
9. AI advisory records.
10. App shell.

Core must not own:

1. Business metrics.
2. Business calculations.
3. Business parser fields.
4. Business reports.
5. Feature commit logic.

Reason:

The first version must stay reusable. A reusable core is proven by adding a second feature without changing core semantics.

### 2026-06-27: Examples and Features Instead of Top-Level Domains

Decision:

Do not require a top-level `domains/*` directory in the reusable starter. Keep examples under `examples/*`, templates under `templates/*`, and let concrete apps organize business code by feature, workflow, bounded context, or vertical slice.

Reason:

Different apps may need different shapes across web, API, database, jobs, and AI code. A mandatory `domains/*` folder is too narrow for a general-purpose starter.

### 2026-06-26: Cloudflare-First Runtime

Decision:

Target Cloudflare as the default deployment platform:

1. Workers for HTTP APIs.
2. Pages or Workers static assets for the React app.
3. D1 for relational state.
4. R2 for source files.
5. Queues for asynchronous work.
6. Email Sending and Email Routing for transactional and inbound email.
7. Workers AI or external model providers only as advisory services.

Reason:

This keeps the deploy surface small, close to the edge runtime, and easy to operate for internal tools.

### 2026-06-26: Human Confirmation for AI

Decision:

AI output is advisory by default. It may suggest, classify, extract, summarize, or explain. It must not silently commit business-owned records.

Reason:

Reviewable provenance matters more than automation speed in early versions.

### 2026-06-26: Agent Entry Points

Decision:

Provide first-class guidance for:

1. Codex and agentic coding tools through `AGENTS.md`.
2. Claude Code through `CLAUDE.md`.
3. Pi-style planning agents through `PI.md`.

Reason:

Different agents need different levels of detail. The repo should make those boundaries explicit instead of relying on conversation memory.

### 2026-06-26: Initial Toolchain Baseline

Decision:

Use exact dependency versions recorded in `docs/architecture/dependencies.md`.

Key choices:

1. React for the web app.
2. Vite+ as the root toolchain surface.
3. `vp` and `vp run` as the command surface.
4. Official TypeScript 7 RC through `typescript@rc`, pinned as `typescript@7.0.1-rc`, with `tsc`.
5. Valibot for runtime validation.
6. Hono for Worker routing.
7. shadcn/Base UI direction for UI primitives.
8. visx as the preferred chart primitive layer.
9. `vite` remains in the web app only as a plugin peer and client type provider.

Reason:

The project needs a reproducible baseline without depending on conversation memory or floating latest versions.

### 2026-06-26: Vite+ Command Surface

Decision:

Use Vite+ commands wherever they own the workflow:

1. `vp dev apps/web` for the web app.
2. `vp build` for the web build.
3. `vp check` for format, lint, and type-aware checks.
4. `vp run` for workspace task orchestration.
5. `tsc` from `typescript@7.0.1-rc` for package-level type checks.

Exception:

`apps/web/vite.config.ts` imports `defineConfig` from `vite` because current Vite plugins such as `@tailwindcss/vite` expose peer types from `vite`, not the Vite+ fork types. This avoids casts and `ts-ignore` while keeping execution under Vite+.

Install note:

`typescript@7.0.1-rc` resolves to the official `typescript@rc` package and requires a platform optional package such as `@typescript/typescript-darwin-arm64@7.0.1-rc`. Local install verification can be blocked if the configured npm registry times out while serving that tarball.

Worker note:

`apps/worker/wrangler.jsonc` uses `compatibility_date = "2026-06-24"` because `wrangler@4.103.0` local dev rejects newer dates in this baseline. Bump the date only with a Wrangler upgrade and a verified `vp run dev:all`.

Reason:

The scaffold should follow Vite+ without hiding current plugin ecosystem constraints behind unsafe typing.

### 2026-06-27: Manual DLQ Recovery In Baseline

Decision:

Keep the starter baseline on manual DLQ and failed-job remediation. Provide:

1. Queue DLQ configuration in `apps/worker/wrangler.jsonc`.
2. `docs/operations/dlq-remediation.md` for triage and retry rules.
3. `vp run ops:failed-jobs` for a read-only D1 snapshot.
4. Existing app/API retry routes for audited requeue.

Do not attach an automatic DLQ consumer or blind replay workflow in the baseline.

Reason:

Automatic DLQ replay can recreate retry loops and bypass human classification. The reusable kit should prove a safe operational path first; automatic replay belongs in a production app only after real queue operations show the manual path is insufficient.

### 2026-06-28: App-Local Worker Runner Modules

Decision:

Keep Cloudflare binding adapters and starter feature registration in app-owned Worker modules:

1. `apps/worker/src/auth-routes.ts` composes auth, session, invitation, password-reset, RBAC denial, audit, and email delivery routes around reusable auth/email/RBAC package rules.
2. `apps/worker/src/import-adapters.ts` registers app-owned starter import adapters.
3. `apps/worker/src/import-job-runner.ts` binds generic import lifecycle rules to D1, R2, Queue, audit, and app-owned staging tables.
4. `apps/worker/src/import-review-routes.ts` owns starter review/decision/commit route persistence for app-owned staging and committed tables.
5. `apps/worker/src/audit-store.ts` and `apps/worker/src/email-delivery.ts` adapt audit and email package concepts to D1 and Cloudflare Email.
6. `apps/worker/src/http-utils.ts` owns shared route parsing and error response helpers.
7. `packages/import-pipeline` owns generic review status helpers, staging key conventions, and adapter contracts.

Do not move Cloudflare binding details or starter table writes into reusable core packages.

Reason:

This keeps `apps/worker/src/index.ts` as HTTP/handler wiring while preserving business-neutral core packages. The seam gives locality for Worker persistence and queue behavior without pretending that a reusable storage adapter exists before a second real app proves it.

### 2026-06-28: Full-Stack Local Dev Default

Decision:

`vp run dev` starts both the web app and Worker API. The previous web-only command remains available as `vp run dev:web`, and `vp run dev:all` remains an explicit alias for the same full-stack wrapper.

Local development also exposes a local-only demo reviewer bootstrap:

```text
email: reviewer@example.com
password: correct horse battery staple
```

The bootstrap route creates or resets that reviewer only when `APP_ENV=local`; invitation-only onboarding remains the non-local default.

Reason:

The React app proxies `/api` and `/health` to the Worker, so a web-only default produces a half-running app with proxy failures. A full-stack default gives cloned checkouts a runnable first impression while keeping local demo identity out of reusable packages and deployed environments.

### 2026-06-28: Workbench UI Baseline

Decision:

Adopt the FOF-derived workbench UI baseline as qitu's business-neutral design system contract.

Reusable UI packages must provide:

1. A dark tonal workbench shell with rail navigation, topbar, main surface, contextual inspector, and event stream patterns.
2. Scenario-based font tokens, compact type scale, semantic color, radius, spacing, and surface shadows in `packages/design-system`.
3. Business-neutral UI primitives for surfaces, data states, metric strips, file/import/review actions, and timelines in `packages/ui`.
4. A visx-only `packages/charts` layer with app pages importing chart components only, never `@visx/*`.

Reason:

The starter came from FOF planning, where the final accepted UI direction was a Vercel-inspired analytical workbench rather than a light generic admin shell. qitu should preserve that reusable design knowledge without importing FOF-specific vocabulary or financial business meaning.

### 2026-06-28: Event Foundation Tables

Decision:

Add generic runtime event foundations to the starter baseline:

1. `login_attempts` for hashed auth attempt diagnostics.
2. `import_job_events` for job-local upload, queue, process, review, retry, advisory, and commit timelines.
3. `security_events` for auth/RBAC signals.
4. `alert_events` for operational follow-up on failed jobs and other reusable kit alerts.

Keep these tables business-neutral. App-owned feature code may attach metadata through opaque JSON, but core packages and docs must not define business metrics, parser fields, or workflow-specific meanings.

Reason:

The FOF-derived startup kit needs reusable operational visibility, not only final audit rows. Separate event streams let the UI show source/import/review provenance while preserving `audit_events` as the compliance trail and keeping alerts/security signals queryable without turning qitu into a business app.

## Pending

1. Whether code generation belongs in core or a separate CLI.
2. Whether React Fast Refresh should be restored through a Vite+ compatible React plugin path.
