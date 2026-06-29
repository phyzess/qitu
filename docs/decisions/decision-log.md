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

Local development also exposes local-only demo user bootstraps:

```text
email: reviewer@example.com
email: admin@example.com
password: correct horse battery staple
```

The bootstrap routes create or reset those users only when `APP_ENV=local`; invitation-only onboarding remains the non-local default. The reviewer account exercises review workflows, and the admin account exercises user and invitation management.

Reason:

The React app proxies `/api` and `/health` to the Worker, so a web-only default produces a half-running app with proxy failures. A full-stack default gives cloned checkouts a runnable first impression while keeping local demo identities out of reusable packages and deployed environments.

### 2026-06-28: Workbench UI Baseline

Decision:

Adopt the qitu workbench UI baseline as the business-neutral design system contract.

Reusable UI packages must provide:

1. A dark tonal workbench shell with topbar primary navigation, secondary route tabs, main surface, contextual inspector, and event stream patterns.
2. Scenario-based font tokens, compact type scale, semantic color, radius, spacing, and surface shadows in `packages/design-system`.
3. Business-neutral UI primitives for surfaces, data states, metric strips, file/import/review actions, and timelines in `packages/ui`.
4. A visx-only `packages/charts` layer with app pages importing chart components only, never `@visx/*`.

Reason:

The starter needs a durable analytical workbench rather than a light generic admin shell. qitu should preserve reusable internal-tool design knowledge without importing domain-specific vocabulary or business meaning.

### 2026-06-28: Event Foundation Tables

Decision:

Add generic runtime event foundations to the starter baseline:

1. `login_attempts` for hashed auth attempt diagnostics.
2. `import_job_events` for job-local upload, queue, process, review, retry, advisory, and commit timelines.
3. `security_events` for auth/RBAC signals.
4. `alert_events` for operational follow-up on failed jobs and other reusable kit alerts.

Keep these tables business-neutral. App-owned feature code may attach metadata through opaque JSON, but core packages and docs must not define business metrics, parser fields, or workflow-specific meanings.

Reason:

The qitu startup kit needs reusable operational visibility, not only final audit rows. Separate event streams let the UI show source/import/review provenance while preserving `audit_events` as the compliance trail and keeping alerts/security signals queryable without turning qitu into a business app.

### 2026-06-28: Authenticated App Routes Baseline

Decision:

The React starter shell must model authenticated application routing, not only a single review-console demo state.

Baseline routes:

```text
/login
/overview
/sources
/imports
/reviews
/audit
/users
/account
```

Rules:

1. Protected routes require a current session and redirect signed-out users to `/login`.
2. Login, invite acceptance, and local reviewer bootstrap land in the authenticated workbench.
3. The account entry is visible in the authenticated topbar and exposes logout through its user panel.
4. User and invitation management are real app routes backed by Worker APIs and RBAC, not hidden test-only capabilities.
5. The route shell stays business-neutral; app-owned feature routes may add business meaning outside reusable packages.

Reason:

A startup kit for logged-in internal applications needs a credible post-login shell before business features are added. This preserves the qitu workbench UI baseline while keeping user management in auth/RBAC infrastructure instead of smuggling business workflow into core packages.

### 2026-06-28: Qitu Shell Interaction Contract

Decision:

Define qitu's shell interaction structure without migrating app-owned router, query, state, or animation stack into reusable packages.

Extracted rules:

1. Keep primary navigation to a few business-neutral sections.
2. Show the active section's existing routes as secondary navigation.
3. Provide a real command search entry with `Cmd/Ctrl+K`.
4. Put profile, RBAC role, permitted user management, theme switching, and logout in an authenticated user panel.
5. Support light, dark, and system theme preferences through design tokens.
6. Keep route memory session-local and route-id-only.
7. Do not use a desktop side rail for route navigation.
8. Use qitu icon-only main route buttons with an adjacent live label on desktop, text-only subroute tabs, pure icon compact search/theme controls, wide search as icon + text + shortcut, and avatar/initial + chevron for the user trigger.

Reason:

qitu needs refined app-shell behavior without inheriting product vocabulary or adding framework weight before the starter proves it needs those dependencies.

### 2026-06-28: Qitu Visual Style Contract

Decision:

Define qitu's non-business visual layer through semantic token names and reusable package boundaries.

Extracted style rules:

1. Use OKLCH purple-gray neutrals for background, surfaces, lines, and text.
2. Prefer `--qitu-surface`, `--qitu-surface-glass`, and `--qitu-surface-elevated` over page-local RGB colors.
3. Keep controls compact on a 28/32/36px scale with shared radius, focus, and motion tokens.
4. Use soft chroma lime/lilac/pink status colors rather than saturated one-off greens, blues, and ambers.
5. Reserve meaningful shadow for overlays and active affordances; most panels rely on tone, fine lines, and subtle inset highlights.
6. Centralize recurring field, list action, icon chip, avatar trigger, overlay, and table-cell styling in `packages/ui`.

Reason:

qitu should keep visual craft centralized without copying business meaning or fragmenting style decisions across app pages. Stable qitu token names let future app-owned features reuse the same visual system without depending on unrelated implementation internals.

### 2026-06-28: Shared Control Refinement Contract

Decision:

Move topbar action, keyboard shortcut, form field, avatar trigger, and read-only label/value row refinements into shared UI utilities instead of page-local Tailwind recipes.

Rules:

1. Topbar actions share a 36px track; compact tools are icon-only, and wide search is icon + label + shortcut.
2. Keyboard shortcuts use a shared 20px kbd primitive.
3. Form inputs and selects use the 32px control height, shared radius, input tokens, and focus ring.
4. Account/runtime fields use a shared read-only label/value grid with stable truncation and tabular value styling.
5. User identity triggers use a 36px button with a 32px avatar/initial plus chevron; logout and other account actions remain inside the user panel.

Reason:

The first qitu shell pass exposed visual drift in alignment, proportions, shadows, and form rows when shared shell patterns were reimplemented ad hoc. Capturing the refined control contract in `packages/ui` keeps the starter reusable and prevents each app page from independently approximating the same primitives.

### 2026-06-28: Qitu Design System Canonicalization

Decision:

Treat qitu's design system as the canonical source for the non-business UI layer instead of partially reinterpreting visual rules per page.

Rules:

1. Use the qitu semantic color tree in `packages/design-system`; do not keep non-qitu variable aliases.
2. Keep desktop topbar primary navigation as icon-only route buttons with a divider and adjacent live label.
3. Use `--qitu-chroma-active` for topbar primary and secondary tabs.
4. Do not draw a topbar bottom separator line; use spacing and surface tone for separation.
5. Use card and surface tone to express ordinary panel hierarchy. Avoid extra local panel borders or shadows unless a component is an overlay or active affordance.
6. Keep all design-system rules business-neutral; do not import product vocabulary, router, data fetching, or animation stack into reusable packages.

Reason:

Earlier implementation still allowed qitu color, line, shadow, and tab alignment decisions to drift. A startup kit should preserve one proven visual system through canonical tokens, shared utilities, and business-neutral component contracts.

### 2026-06-28: Surface Hierarchy Contract

Decision:

Centralize qitu's surface, shadow, and layer hierarchy in `packages/design-system` tokens and `packages/ui` utilities.

Rules:

1. Ordinary page panels use `.qitu-surface` with `--qitu-surface-panel`, `--qitu-surface-panel-border`, and a subtle inset highlight.
2. Nested rows, metrics, guardrails, timelines, and empty/data states use `.qitu-surface-subtle` with `--qitu-surface-row` and `--qitu-surface-row-border`.
3. Hover and selected states use `--qitu-surface-row-hover`, `--qitu-surface-row-active`, and `--qitu-shadow-active-ring`; page code should not invent active row shadows.
4. Forms, read-only rows, table cells, icon chips, badges, segment tabs, skeletons, and buttons consume shared row/control tokens rather than hard-coded `surface-glass` or `surface-elevated` choices.
5. Search dialogs, popovers, and user panels add `.qitu-overlay-surface` with `--qitu-color-popover` and `--qitu-shadow-overlay`; ordinary panels must not use overlay shadows.
6. Shell and overlay layering uses `--qitu-z-shell`, `--qitu-z-shell-front`, `--qitu-z-overlay-backdrop`, and `--qitu-z-overlay` instead of page-local z-index values.

Reason:

The first visual-parity pass aligned topbar structure but still left visual drift across cards, rows, fields, shadows, and overlays. A startup kit needs reusable UI semantics that can be scanned and enforced across pages, not page-by-page visual approximations.

### 2026-06-29: Tonal-First Surface Flattening

Decision:

Refine the qitu surface contract so ordinary page hierarchy is expressed through tonal fill, not visible borders.

Rules:

1. Light mode uses one unified purple-gray background family across app background, topbar, panels, and rows; avoid white-to-background page gradients.
2. `.qitu-surface` and `.qitu-surface-subtle` keep structural borders for stable sizing, but those borders are transparent by default.
3. Visible lines are reserved for inputs, focus states, overlays, and table separators where they carry interaction or scan structure.
4. Overlay panels may still use a faint border plus overlay shadow because they float above the workbench.
5. Page code should not add local panel borders to compensate for weak color contrast; adjust shared surface tokens instead.

Reason:

The first light/dark parity pass still produced too many visible outlines, especially in light mode where panel, row, and page backgrounds were too close to white. A business-neutral startup kit should make the flat qitu layer model the default, so new app-owned pages inherit the same calm hierarchy without page-by-page border tuning.

### 2026-06-29: Qitu Token Namespace Contract

Decision:

Make `--qitu-*` the canonical CSS custom property namespace for qitu's design system.

Rules:

1. Reusable packages and app pages must consume canonical `--qitu-*` tokens.
2. Non-qitu custom properties must not be defined or consumed.
3. New tokens must enter one of three layers: primitive, semantic, or component.
4. Primitive tokens define raw scale, color, radius, layout, z-index, chroma, and motion values.
5. Semantic tokens define background, surface, text, state, focus, shadow, type, and motion intent.
6. Component tokens define topbar, control, input, overlay, table, chart, and app-shell affordances.
7. Public reusable docs and package contracts must use qitu-owned names, not non-qitu names.

Reason:

The startup kit needs a token system that can grow without leaking page-local values, non-qitu names, or unclear aliases. A qitu-owned namespace makes future extension explicit and keeps cloned applications on the latest contract.

## Pending

1. Whether code generation belongs in core or a separate CLI.
2. Whether React Fast Refresh should be restored through a Vite+ compatible React plugin path.
