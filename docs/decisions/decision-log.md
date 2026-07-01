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

The bootstrap routes create or reset those users only when `APP_ENV=local`; invitation-only onboarding remains the non-local default. The operator account exercises confirmation workflows, and the admin account exercises user and invitation management.

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
/workspace
/workspace/sources
/workspace/imports
/workspace/reviews
/settings
/settings/members
/settings/audit
```

Rules:

1. Protected routes require a current session and redirect signed-out users to `/login`.
2. Login, invite acceptance, and local operator bootstrap land in the authenticated workbench.
3. The account entry is visible in the authenticated topbar and exposes logout through its user panel.
4. Member and invitation management are real app routes backed by Worker APIs and RBAC, not hidden test-only capabilities.
5. The route shell stays business-neutral; app-owned feature routes may add business meaning outside reusable packages.

Reason:

A startup kit for logged-in internal applications needs a credible post-login shell before business features are added. This preserves the qitu workbench UI baseline while keeping member and invitation management in auth/RBAC infrastructure instead of smuggling business workflow into core packages.

### 2026-06-28: Qitu Shell Interaction Contract

Decision:

Define qitu's shell interaction structure without migrating app-owned router, query, state, or animation stack into reusable packages.

Extracted rules:

1. Keep primary navigation to a few business-neutral sections.
2. Show the active section's existing routes as secondary navigation.
3. Provide a real command search entry with `Cmd/Ctrl+K`.
4. Put profile, RBAC role, permitted member management, theme switching, and logout in an authenticated user panel.
5. Support light, dark, and system theme preferences through design tokens.
6. Keep primary route links stable; preserve workflow context through selected app state such as the selected import job, not through primary-route memory.
7. Do not use a desktop side rail for route navigation.
8. Use qitu icon-only main route buttons with an adjacent live label on desktop, text-only subroute tabs, pure icon compact search/theme controls, wide search as icon + text + shortcut, and avatar/initial + chevron for the user trigger.

Reason:

qitu needs refined app-shell behavior without inheriting product vocabulary or adding framework weight before the starter proves it needs those dependencies.

### 2026-06-28: Qitu Visual Style Contract

Decision:

Define qitu's non-business visual layer through semantic token names and reusable package boundaries.

Extracted style rules:

1. Use cool ink/paper neutrals for background, surfaces, lines, and text.
2. Prefer `--qitu-surface`, `--qitu-surface-glass`, and `--qitu-surface-elevated` over page-local RGB colors.
3. Keep controls compact on a 28/32/36px scale with shared radius, focus, and motion tokens.
4. Use one brand accent family, led by 中国色 `品红` as `oklch(0.633 0.222 6.9)`, for logo, active affordances, links, and focus treatment.
5. Keep status colors semantic and low saturation: green for success/protected, blue-gray for warning/review/info, and a muted orange-red for destructive or rejected states so brand pink does not double as error.
6. Reserve meaningful shadow for overlays and active affordances; most panels rely on tone, fine lines, and subtle inset highlights.
7. Centralize recurring field, list action, icon chip, avatar trigger, overlay, and table-cell styling in `packages/ui`.

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

### 2026-06-29: Qitu Icon Mark

Decision:

Use a folded-path qitu mark:

1. The mark is a folded route: one path bends back through a compact system instead of drifting into open-ended branches.
2. The shape borrows from topology's habit of treating paths up to deformation: different app-owned routes still pass through the same reusable constraints.
3. The mark avoids literal mythology, business workflow imagery, and text-shaped monograms.
4. `packages/ui` owns the reusable React/SVG mark for shell usage.
5. `apps/web` may expose a static SVG favicon derived from the same geometry.

Reason:

The project name carries both the 鵸鵌 reference and the 歧途 homophone, but the app shell needs a mark that reads as a serious internal-tool system rather than mythology artwork. A folded path keeps the "avoid the wrong route" idea without spelling it out, and it has a cleaner brand silhouette than a generic grid, monogram, or literal braid.

### 2026-06-29: Shared Internationalization Foundation

Decision:

Split internationalization into a reusable mechanism package and app-owned dictionaries.

Rules:

1. `packages/i18n` owns locale metadata types, typed dictionary helpers, interpolation, fallback, locale negotiation, generic code-label helpers, and locale-aware number/date/time/byte/plural/relative-time formatting primitives.
2. `apps/web` owns the React provider, persisted locale preference, document language updates, explicit language chooser, and qitu web shell dictionaries.
3. The starter ships English and Simplified Chinese web dictionaries, with English as the stable default for existing smoke coverage.
4. `packages/ui` remains language-neutral and receives display strings through props; it must not import app dictionaries or own product copy.
5. Future languages are added by extending locale metadata and providing a complete dictionary that typechecks against the English key set.
6. Worker routes may derive locale from request body, request headers, locale cookie, or `Accept-Language`, then pass the resolved locale to app-owned or package-owned renderers.
7. Auth invite/reset email templates may be localized inside `packages/email` because they are generic transactional auth emails; business email copy remains app-owned.
8. Server-provided domain or event codes may remain canonical machine values until a route returns stable display-code metadata.

Reason:

The React starter shell needs bilingual operation, and future Worker email, exports, CLI output, or templates may need the same locale primitives. A small dependency-free `@qitu/i18n` package avoids a heavy runtime and keeps reusable mechanics out of `apps/web`, while typed app dictionaries keep product copy local and preserve qitu's business-neutral package boundary.

### 2026-06-29: Branch Slash Icon Direction

Decision:

Lock the qitu icon direction to the branch slash mark and stop exploring unrelated logo concepts.

Rules:

1. Treat `apps/web/public/brand/qitu-branch-slash-master.svg` as the maintainable source of truth.
2. Keep `apps/web/public/brand/qitu-branch-slash-visual-master.png` as a rendered PNG preview of the same source geometry.
3. Preserve the defining structure: three separated black forms, a Y-shaped negative route, one blue decision point, and the smooth notch beside that point.
4. Size the decision point for the real 30-36px shell mark first, then verify it still feels restrained at larger brand-board sizes.
5. Use 中国色 `品红` as `oklch(0.633 0.222 6.9)` for the static decision point, with a softer `凤仙花红`-leaning dark-mode token for app-level active affordances.
6. Optimize only within this direction: proportions, spacing, curve quality, small-size clarity, and final production asset integration.
7. Do not return to hexagon, cube, literal bird, mythology illustration, or broad monogram exploration unless this direction is explicitly rejected.
8. This decision supersedes the earlier folded-path qitu mark direction for the final app icon.
9. Keep the naked mark transparent for React shell and inline product use.
10. Give favicon and app-icon assets their own rounded-square background: cool off-white in light mode, steel-blue ink with light glyph forms in dark mode.

Reason:

The branch slash mark best balances the `qitu` name's 歧途 homophone with the project positioning: one reusable startup kit can branch into different app-owned products. The non-hex silhouette avoids generic cube/package reads, keeps the mark compact at favicon sizes, and has a stronger ownable shape than the previous broader explorations.

### 2026-06-29: Vendored AnimateIcons Source Registry

Decision:

Use selected AnimateIcons Lucide SVG source for app chrome, vendored inside a small `packages/ui` registry.

Rules:

1. `packages/ui/src/animated-icon.tsx` owns `AnimatedIcon`, `AnimatedIconName`, and the mapping from qitu semantic icon names to the vendored SVG source.
2. App pages may not import icon runtimes directly; they use `AnimatedIcon` from `@qitu/ui`.
3. Use animated icons for shell navigation, command/search, theme/language, refresh, account panel actions, and reusable section headers.
4. Keep dense tables, timeline rows, destructive confirmations, one-off secondary actions, and data-state fallback glyphs static unless repeated use proves motion improves scanning.
5. Prefer AnimateIcons/Lucide source geometry first. If a semantic match is missing, choose the closest existing source shape or keep a static Lucide fallback rather than drawing a rough local icon.
6. Do not introduce Lottie, `@animateicons/react`, or a second animated icon runtime for app chrome without a new dependency and bundle-size decision.
7. Icons must inherit `currentColor`, avoid page-local accent overrides, and respect `prefers-reduced-motion`.
8. Keep the AnimateIcons MIT notice in `docs/third-party-notices.md` while vendored source remains in the repository.

Reason:

The first local hand-drawn animated icon set looked too heavy and inconsistent at the real 15-17px shell size. AnimateIcons provides a more polished proportion baseline, but importing its React runtime adds disproportionate bundle weight for qitu's small selected set. Vendoring selected SVG source preserves the semantic qitu API and visual baseline while keeping app chrome lightweight.

### 2026-06-29: Stable Workspace Bootstrap Shell

Decision:

Treat protected-route refresh as a workspace bootstrap state, not an auth-page fallback.

Rules:

1. Direct entry into `/workspace`, `/workspace/sources`, `/workspace/imports`, `/workspace/reviews`, `/settings`, `/settings/members`, or `/settings/audit` must keep the user inside the workbench shell while session status is unresolved.
2. The static HTML entrypoint resolves the persisted/system theme before module loading and paints a neutral preboot workbench skeleton with the same light/dark tone family as the app.
3. React theme state must apply to `document.documentElement` before first paint, so route-loading shells do not render in the wrong theme for a frame.
4. Session bootstrap owns only health and current-user resolution; workspace list data and route-specific companion data load after the session snapshot is known.
5. Route-specific companion data should only load where it is needed. Settings routes must not trigger review-record/advisory/event loading merely because a selected job exists.
6. Protected-route loading actions should preserve the final workbench topbar shape with disabled or skeletal controls rather than switching to a guest/auth action model.

Reason:

Refreshing a protected deep link exposed a visible white loading frame before the authenticated page settled. The failure was systemic: theme, auth, route, and route-owned data did not share one startup contract. A stable bootstrap shell keeps protected routes visually and semantically inside the workspace from the first HTML paint through authenticated data hydration.

### 2026-06-29: App-Owned TanStack Router

Decision:

Use TanStack Router for the React web app's route tree, location state, and client-side navigation.

Rules:

1. `apps/web` owns the TanStack Router dependency, route tree, route matching, and navigation calls.
2. Reusable packages such as `packages/ui` remain router-agnostic and receive plain `href` and callback props.
3. App navigation must use the router instance instead of manual `window.history` writes or `popstate` subscriptions.
4. The route tree covers the starter shell routes, invitation links, and password-reset links.
5. Auth, RBAC, audit, and persistence remain Worker/API responsibilities; the client router may gate presentation but must not become the source of authorization truth.
6. Future route guards, pending states, and skeletons should be added through app-owned router lifecycle APIs rather than page-local history effects.

Reason:

The hand-written History API router made route transitions depend on scattered link handlers and browser default behavior. That allowed a disabled navigation item to fall through to a full document request and made protected-route refresh flashes harder to reason about. A mature app-owned router gives qitu a single navigation contract while preserving the core package boundary.

### 2026-06-29: Business-Neutral Starter Information Architecture

Decision:

Keep qitu's shipped web routes as real authenticated routes, but present them through starter-capability groups instead of product-domain modules.

Rules:

1. Authenticated login lands on `/workspace`, not directly on a confirmation workflow.
2. Primary navigation exposes only Workspace and Settings.
3. Workspace contains `/workspace`, `/workspace/sources`, `/workspace/imports`, and `/workspace/reviews`.
4. Settings contains `/settings`, `/settings/members`, and `/settings/audit`.
5. Source intake and import jobs remain real workflow surfaces, but they are Workspace subroutes rather than a top-level Intake module.
6. Audit remains a real visibility surface, but it is a Settings subroute rather than a top-level Operations module until repeated operational workflows justify a separate root.
7. Member and invitation management stays a real RBAC-protected route, but it is framed as Settings and disabled for non-admin route navigation.
8. Account and member management remain reachable from the authenticated user panel.
9. Reusable chart package exports must stay business-neutral; remove finance-specific component names such as drawdown or performance panels from `packages/charts`.
10. App-owned examples may still use business-specific labels, but reusable docs and packages must describe capabilities by infrastructure responsibility.
11. Because qitu has not shipped a stable public route contract, flat pre-release paths such as `/overview`, `/sources`, `/imports`, `/reviews`, `/audit`, `/users`, and `/account` are not retained as compatibility redirects.

Reason:

The starter should prove reusable foundations without making the shell feel like a finished business app. Source intake, import jobs, review, audit, account, and member management are necessary startup-kit capabilities, but the top-level product story should be the reusable workspace and settings surface, not a collection of pseudo-product modules. Removing finance-coded chart names closes a core-package vocabulary leak while preserving generic chart primitives.

### 2026-07-01: Production Auth Email And Member Management Hardening

Decision:

Strengthen the reusable auth/email/admin baseline without adding business-specific concepts:

1. Outbound auth email supports `store` and `send` delivery modes.
2. Invitation and password-reset email always write `email_messages` delivery metadata.
3. Invitation creation succeeds when the invitation row is created even if email delivery fails; the API, UI, and ledger must show `delivery: failed` so an administrator can resend.
4. Auth links must be built from `PUBLIC_APP_URL`; preview and production must not use `example.com`, localhost, or workers.dev as the public email origin.
5. Invitation management includes resend, revoke, delete revoked, and accepted/pending/revoked/expired status visibility.
6. Member deletion is hard delete in the starter baseline, guarded by "cannot delete self" and "cannot delete the last owner/admin"; deleting a member also removes password credentials, sessions, and password reset tokens.
7. Password policy constants are shared from `@qitu/auth` so web forms can fail fast before the Worker schema rejects a request.

Reason:

Real downstream adoption exposed reusable production gaps in auth email, invitation operations,
public-link generation, member management, and deploy checks. These are qitu infrastructure concerns,
not downstream business logic. Keeping the behavior business-neutral gives cloned apps a safer
starting point while preserving app-owned feature boundaries.

### 2026-06-29: Import Job Status Comes From Review Counts

Decision:

Derive import job status from staged-record status counts after review and commit actions.

Rules:

1. `approved` means the job currently has approved, uncommitted staged records ready to commit.
2. `needs_review` means there is still review work and no approved work currently ready to commit.
3. `committed` means approved work has been committed and there are no pending or approved staged records left.
4. Partial commits must not mark the whole job `committed` while pending rows remain.
5. A single approve/reject click must not decide the job status by itself; the Worker must recompute from staged-record counts.
6. Rejected-only jobs remain `needs_review` in the neutral starter until a real app proves it needs a job-level rejected/voided terminal status.

Reason:

The starter supports partial commit of approved rows, but the previous job status helper treated the last record decision as the whole job state. That made multi-record imports read as fully approved or committed even while pending records remained. Count-derived status keeps the workflow truthful without adding speculative terminal states.

### 2026-06-30: Shadcn Base UI Execution Contract

Decision:

Make the shadcn/Base UI direction executable instead of documentation-only:

1. Pin `shadcn@4.11.0` at the workspace root and expose `vp run ui:add` / `vp run ui:info`.
2. Keep root `components.json` as the workspace shadcn contract and add `packages/ui/components.json` as the package-local install target.
3. Resolve shadcn registry output into `packages/ui/src` through the package-local shadcn config and TypeScript aliases.
4. Use `@base-ui/react@1.6.0`, the Base UI package generated by `shadcn@4.11.0 --base base`, instead of the old `@base-ui-components/react` RC package.
5. Keep app pages on `@qitu/ui`; Base UI imports belong inside reusable qitu UI primitives.
6. Smoke checks must fail if shadcn config, Base UI imports, or package pins drift away from this contract.

Reason:

The previous implementation only recorded shadcn/Base UI as a direction while hand-rolling interactive primitives in app code and leaving the old Base UI package unused. That made the design-system baseline unenforceable. The starter needs a working registry path, accessible primitive backing, and a package boundary that keeps qitu tokens/components canonical without letting app pages bypass `packages/ui`.

### 2026-07-01: Production Auth Hygiene And API Error Visibility

Decision:

Keep local setup and demo credentials as local-only development affordances across both API and UI:

1. Bootstrap invitation and local demo user routes remain disabled unless `APP_ENV=local`.
2. The login page shows the `Setup` tab and local demo credential affordances only after `/health` reports `APP_ENV=local`.
3. Preview and production login pages must not prefill demo credentials.
4. First-admin onboarding in deployed environments must use a one-time admin invitation, not local bootstrap or direct user/password creation.
5. The web API client must parse structured backend error bodies in the `{ error: { code, message, issues? } }` shape and surface the backend message instead of replacing it with generic HTTP status text.
6. Network-style frontend failures use a stable Worker-connection message so operators can distinguish backend validation from local proxy/runtime problems.

Reason:

Downstream practice showed that local scaffold conveniences become production risk when they are visible in deployed login screens, and generic HTTP errors make upload/auth failures hard to act on. qitu should keep cloned local setup fast while making preview and production invitation-only by default, and it should preserve backend error semantics all the way to the frontend.

### 2026-07-01: UI Primitive Governance As Downstream Paved Road

Decision:

Treat shared UI primitive governance as boundary protection, not as speculative component-library expansion.

Rules:

1. Missing common primitives should be checked against the shadcn/Base UI registry before custom implementation.
2. Use the root shadcn workflow, which runs against `packages/ui`, to discover and inspect candidates: `vp run ui:search`, `vp run ui:docs`, and `vp run ui:view`.
3. Prefer `vp run ui:add <component> --dry-run` followed by `vp run ui:add <component>` over copying shadcn-looking Tailwind recipes into app pages.
4. If no single registry component fits, compose existing shadcn/qitu primitives before writing a bespoke primitive.
5. App pages import reusable controls from `@qitu/ui`; direct Base UI imports stay inside `packages/ui`.
6. qitu installs registry-backed primitives for alert dialog, badge, button, calendar, card, checkbox, command, dialog, drawer, dropdown menu, input, input group, popover, radio group, select, separator, sheet, table, tabs, and textarea, then layers qitu-specific wrappers such as `DateField`, `ConfirmDialog`, `SegmentedControl`, `StatusBadge`, `DetailDrawer`, and `ListActionRow` on top.
7. App pages must not introduce raw native date inputs, raw checkbox controls, page-local lookalike menus/dialogs, or page-local table structures once shared qitu primitives exist.
8. qitu provides a small `DateField` composed from qitu `Popover` plus the shadcn `Calendar`; the calendar registry component adds the required `react-day-picker` dependency.
9. If a page needs a bespoke primitive, record why the registry and existing qitu wrapper composition were insufficient.
10. Primitive names and props remain business-neutral and must not encode downstream product vocabulary.

Reason:

Downstream practice showed that waiting for repeated duplication before adding primitives lets product pages accumulate page-local table, checkbox, date, drawer, and action-bar implementations. For a reusable seed, the safer default is to provide a small paved road early, keep it business-neutral, and enforce it with smoke checks so future downstream work follows the qitu visual and accessibility contract.

### 2026-07-01: Batch Source Upload Queue Baseline

Decision:

Move source intake from a single selected file action to an app-owned upload queue backed by a shared `@qitu/ui` `UploadQueue` display primitive.

Rules:

1. File objects and upload side effects stay in `apps/web`; `packages/ui` receives only generic item names, status, metadata, and actions.
2. File selection appends to the existing queue instead of replacing it.
3. The queue supports multiple selected files, drag-and-drop handoff, per-file uploading/uploaded/duplicate/failed states, item removal, and retry actions for failed rows.
4. The Worker upload route remains compatible with the existing single-file source upload API while the frontend processes queued files sequentially.
5. Failed uploads stay visible in the queue with backend error messages preserved by the structured API error client.
6. Source intake copy and props remain business-neutral; downstream file meaning still belongs in app-owned feature adapters.

Reason:

Downstream practice showed that upload intake becomes product-facing quickly. A batch-first queue gives users append selection, visible partial failure, and retry without forcing a backend batch API before it is needed. Keeping `UploadQueue` generic prevents downstream pages from recreating local upload row styling while preserving the core/business boundary.

### 2026-07-01: Source List Details Drawer

Decision:

Use the source-file list as the primary source intake surface and put source metadata plus related import jobs in a drawer opened from each row.

Rules:

1. The source list must remain usable without opening the drawer.
2. Drawer content is generic source metadata, object storage metadata, and import job state only.
3. The drawer uses `@qitu/ui` `Drawer` primitives instead of page-local overlays.
4. Technical guardrails may remain visible, but source/job details should not require a permanent side panel.
5. Business interpretation of the source file stays in app-owned feature adapters, not in the generic source list.

Reason:

Downstream intake workflows need a dense list for routine scanning and a focused details surface for exceptions. A drawer avoids turning operational metadata into the primary workspace while still keeping source provenance and job state one click away.

### 2026-07-01: Confirmation Language First Batch Action

Decision:

Add a `Confirm pending` user-facing batch action for staged records while preserving the existing backend approve route and internal review status names.

Rules:

1. The UI can use confirmation language for routine data-quality gates before backend status names are migrated.
2. The first batch action confirms all pending staged records for the selected import job through a backend `confirm-pending` route.
3. Existing per-row approve/reject actions remain for exception handling.
4. Commit still requires approved/confirmed records and keeps the existing `commitApproved` path.
5. The backend batch route keeps the existing internal `approve` action/status names while exposing confirmation language to the UI.

Reason:

Downstream practice showed that presenting every parsed row as a manual confirmation obligation makes routine intake feel heavier than necessary. A small batch confirmation action starts the language and workflow migration without destabilizing the import state machine or bypassing existing audit events.

### 2026-07-01: Backend Batch Confirmation Endpoint

Decision:

Move `Confirm pending` from a frontend loop over per-record approve calls to a backend job-level route: `POST /api/import-jobs/:jobId/review/confirm-pending`.

Rules:

1. The route requires `review:decide`, the same permission as per-record approve/reject.
2. The route only changes staged records currently in `pending` status.
3. Internal review action/status names stay `approve` and `approved` until a broader schema migration is justified.
4. The route writes one review decision, per-record decision/audit rows, a job status update, and an import job event.
5. The frontend calls this route for routine batch confirmation and keeps per-row approve/reject for exception handling.

Reason:

Once the UI shape proved useful, keeping batch confirmation as a frontend loop created extra request chatter and made the product interaction look more temporary than it was. A backend route keeps audit and status derivation centralized while preserving compatibility with the existing import review state machine.

### 2026-07-01: Confirmation Language UI Migration

Decision:

Move the main web UI labels from review/approve/reject language toward confirmation/exclusion language while keeping route keys, permission names, event names, and database statuses stable.

Rules:

1. User-facing navigation should say `Confirmations`, not `Reviews`.
2. Routine positive actions should say confirm/confirmed, even while the internal status remains `approved`.
3. Negative row decisions should say exclude/excluded, even while the internal status remains `rejected`.
4. Permission and event identifiers such as `review:decide` and `import_review.record_rejected` remain unchanged until a deliberate backend migration is planned.
5. Browser smoke should assert the user-facing language, while worker integration can continue asserting internal route/event compatibility.

Reason:

Downstream practice showed that "review everything" makes routine data intake feel like manual compliance work. A UI-language migration gives product surfaces the right mental model now without forcing a risky schema or event taxonomy change in the same slice.

### 2026-07-01: Target Deploy And Health Check Gate

Decision:

Add explicit preview and production deployment commands that wrap Wrangler deploy and run a target health check after deployment.

Rules:

1. Remote D1 migrations remain explicit reviewed commands and are not hidden inside deploy scripts.
2. Target deploy commands must build web assets, run `wrangler deploy` for the selected environment, and then check `/health`.
3. Preview and production health checks require the deployed origin through `QITU_PREVIEW_APP_URL`, `QITU_PRODUCTION_APP_URL`, `QITU_PUBLIC_APP_URL`, or `--url`; qitu must not guess account-specific hostnames.
4. The health script verifies `ok`, `service = qitu-worker`, and the expected `APP_ENV` value.
5. Health and deploy scripts must not read or print secret values.

Reason:

Deployability should be a product feature of the starter, not a remembered sequence of ad hoc Wrangler commands. Keeping migration and failed-job inspection explicit preserves operator review, while a narrow deploy wrapper plus `/health` contract turns the final release step into a repeatable command that proves the deployed runtime environment.

### 2026-07-01: App-Owned Workspace Home Slot

Decision:

Keep `/workspace` as the authenticated default route, but render it through an app-owned `WorkspaceHomeSlot` module rather than wiring the home content directly into shell internals.

Rules:

1. Downstream apps can replace `apps/web/src/workspace-home.tsx` to own their business home or workbench.
2. The qitu shell still owns authentication, navigation, settings, account, members, and route protection.
3. Technical operational pages such as audit remain under `/settings/audit`, not foregrounded on the default home surface.
4. The default starter home may show generic source intake, import job, and confirmation state, but it must not encode downstream business metrics or reports.

Reason:

Downstream products need a real first screen, but qitu should not guess business dashboards or make audit logs feel like the product home. A narrow home slot gives downstream apps a stable replacement point while preserving the reusable shell, settings, and intake routes.

### 2026-07-01: Local Smoke Cleanup Is Local-Only

Decision:

Add an operator command for removing local browser-smoke and demo intake rows from `qitu-dev --local`, with a dry-run mode.

Rules:

1. Cleanup targets only local D1 through Wrangler `qitu-dev --local`.
2. Matching is limited to smoke/demo file prefixes and browser-smoke reviewer accounts.
3. The command deletes dependent local rows in an order that keeps source/job/review/advisory/auth artifacts together.
4. The command must not be adapted for preview or production cleanup.
5. Remote remediation stays manual and reviewed through failed-job snapshots, app/API retry paths, and the DLQ runbook.

Reason:

Browser smoke and local demo runs intentionally exercise real app paths, so repeated local validation can clutter product-facing source, job, audit, member, and email lists. A narrow local cleanup command keeps development databases usable without creating a dangerous remote data-deletion primitive.

### 2026-07-01: First Admin Invitation Operator Command

Decision:

Add `vp run ops:create-admin-invite` as the reviewed operator path for first-admin creation and admin-access recovery.

Rules:

1. The command creates a pending `admin` invitation and an `invitation.created` audit event.
2. The command must not insert directly into `users` or `password_credentials`.
3. Preview and production require an explicit app origin through `QITU_PREVIEW_APP_URL`, `QITU_PRODUCTION_APP_URL`, `QITU_PUBLIC_APP_URL`, or `--app-url`.
4. The successful command prints a one-time invitation URL as its operational artifact; operators must treat it as a secret and send it through an approved private channel.
5. `--dry-run` validates target/email/app URL without writing to D1 or printing a usable token.

Reason:

Production hygiene is incomplete if the first operator has to improvise raw SQL or re-enable local bootstrap. A narrow command keeps the deployed onboarding path invitation-only while avoiding direct user/password creation and preserving normal password setup, session creation, and audit semantics.

### 2026-07-01: Source List Batch Confirmation Actions

Decision:

Make the source-file list a routine intake action surface by adding source selection plus list-level confirmation and commit actions.

Rules:

1. Source rows can be selected with the shared `@qitu/ui` `Checkbox` primitive.
2. The action bar uses the shared `BatchActionBar` primitive, keeping row/list density in qitu UI tokens.
3. Source-list confirmation maps selected or all pending source jobs to the existing backend `confirm-pending` route.
4. Source-list commit maps selected or all confirmed source jobs to the existing `commit` route.
5. Row-level exception handling remains available through details and the confirmation console.

Reason:

The source list is the natural place for routine intake work. Moving common confirm/commit actions there prevents users from opening every import job for normal cases while preserving the confirmation console for exceptions and detailed inspection.

### 2026-07-01: Audit Date Range Uses Shared DateField

Decision:

Use the shared `@qitu/ui` `DateField` primitive for audit date-range filters, and back it with Worker-side ISO date-time filtering on `/api/audit-events`.

Rules:

1. App pages must not reintroduce native `type="date"` inputs when a qitu `DateField` is available.
2. Date-only UI values are converted by the app into ISO date-time query boundaries before calling the API.
3. The Worker validates audit date filters and returns a structured `invalid_audit_date_filter` error for invalid values.
4. Browser smoke must open the custom date picker in dark mode so token/theme regressions are visible.
5. The audit filter remains operational scaffold functionality and must not encode downstream business reporting semantics.

Reason:

The audit page is a business-neutral place to prove that custom date picking, popover layering, dark-mode styling, and backend filtering work as a reusable primitive. Covering it in smoke tests turns DateField from an exported component into a governed app pattern.

### 2026-07-01: Release Gate Script Is Plan-First

Decision:

Add `vp run release:preview` and `vp run release:production` as plan-first release gate entrypoints. The scripts execute remote operations only when the operator adds `--yes`.

Rules:

1. The release gate sequence is `verify:kit`, target deploy dry-run, target remote D1 migration, failed-job snapshot, target deploy, and post-deploy health check.
2. Running the command without `--yes` prints the plan and exits without touching remote resources.
3. Executing the gate requires a target app URL through `QITU_PREVIEW_APP_URL`, `QITU_PRODUCTION_APP_URL`, `QITU_PUBLIC_APP_URL`, or `QITU_HEALTH_URL`.
4. The script prints command names and required env var names, not secret values.
5. Remote migrations remain explicit reviewed steps inside the gate; they are not hidden inside the lower-level deploy command.

Reason:

Deployability should be repeatable without asking operators to remember a raw Wrangler sequence. Keeping the release gate plan-first makes the intended path discoverable while preserving a deliberate confirmation point before preview or production state changes.

### 2026-07-01: Intake Upload Queue Collapses After Successful Uploads

Decision:

After source files exist and no upload failures are waiting for action, render the intake upload area as a compact add-files entry instead of a full empty dropzone.

Rules:

1. Successful and duplicate upload queue entries are removed after the workspace reloads.
2. Failed upload entries remain in the queue with their per-file error and retry action.
3. The full dropzone remains the empty-state intake surface before any source files exist.
4. Adding files after sources exist appends to the queue and expands the queue surface while files are pending.
5. The compact surface uses the shared `UploadQueue` primitive and qitu density tokens, not page-local card styling.

Reason:

Once a user has source data, the primary workspace is the source list. Keeping a large empty upload dropzone above existing sources makes the scaffold feel unfinished; collapsing it keeps routine intake available without letting upload chrome dominate the list.

### 2026-07-01: Intake Lists Use Layout-Matched ListFrame States

Decision:

Add a shared `ListFrame` primitive for source and import lists so empty, loading, and ready states share the same list container, row density, and spacing.

Rules:

1. Source and import intake lists render through `ListFrame` instead of a generic centered empty card.
2. Ready states render the real row components inside the same `qitu-list-frame` container used by empty/loading states.
3. Empty states render row-like list-state content, preserving list width and rhythm for screenshot-oriented checks.
4. `ListFrame` stays business-neutral and owns only list state structure, not source/import domain behavior.
5. Browser smoke measures source-list empty and ready frames in the same viewport to catch layout drift.

Reason:

Downstream products quickly diverge from generic placeholder layouts. A shared list-state primitive keeps qitu's intake lists visually stable across empty and populated states, and gives regression tests a concrete structure to verify instead of relying on text-only assertions.

### 2026-07-01: Adoption Script For Real App Baselines

Decision:

Add `vp run adopt:app` as a dry-run-first script for turning a copied qitu checkout into an app-owned repository.

Rules:

1. The script plans package namespace, root package name, session cookie, Worker name, Cloudflare resource-name, and public app-name edits.
2. It writes files only with explicit `--apply`.
3. It can remove scaffold-only templates, examples, agent docs, roadmap, capability, and kit-completion docs with `--clean-product-baseline`.
4. It prints remote safety commands instead of changing git remotes automatically.
5. It must not read, write, or print secret values.

Reason:

Downstream adoption showed that qitu's first-day value depends on a safe path from reusable seed to real product repository. Making adoption dry-run-first preserves review while removing private-memory rename steps.

### 2026-07-01: Replaceable Feature Slice Template

Decision:

Expand `templates/feature` from an adapter skeleton into a replaceable feature slice scaffold with migration, integration fixture, web surface descriptor, and smoke-path metadata.

Rules:

1. The template keeps parser, staging, validation, commit, fixtures, and web-surface hooks app-owned.
2. The migration file is a slot to copy into app-owned Worker migrations and rewrite for the product feature.
3. The registry exports import adapters, integration fixtures, and web surfaces.
4. Core packages must not import copied feature code.
5. Starter adapters should be removed only after a copied feature proves the same upload -> queue -> confirmation -> commit path.

Reason:

Downstream work replaces a vertical slice, not just a parser. A deeper template gives leverage to agents adding the first real business feature without changing qitu core semantics.

### 2026-07-01: App-Owned RBAC Policy Seam

Decision:

Keep `@qitu/rbac` as the permission evaluation module, but make role policy app-owned through `createRbacPolicy`, `normalizeRoleForPolicy`, and app-local policy adapters.

Rules:

1. `@qitu/rbac` ships the starter `owner/admin/reviewer/viewer` policy as the default.
2. Worker and Web apps use `apps/*/src/rbac-policy.ts` adapters.
3. Downstream apps may rename or replace role names without editing package internals.
4. Permission names remain business-neutral until a real app proves a reusable extension is needed.
5. Database role values remain strings owned by the app policy.

Reason:

Downstream apps need app-owned role vocabulary. Keeping fixed role names only in the package made the RBAC module shallow; the policy seam keeps authorization mechanics reusable while letting apps own role language.

### 2026-07-01: Web Orchestration Helpers Are App-Owned Modules

Decision:

Split audit filters, upload queue state, and web permission projection out of `apps/web/src/app.tsx` into app-owned helper modules.

Rules:

1. `app.tsx` remains the route/workflow orchestrator.
2. Audit filter query construction lives in `apps/web/src/audit-filters.ts`.
3. Upload queue entry construction lives in `apps/web/src/upload-queue-state.ts`.
4. Permission projection lives in `apps/web/src/web-permissions.ts` and calls the app-owned RBAC policy.
5. Pages import shared app-owned types instead of redefining workflow helper shapes.

Reason:

The web shell is the main replacement surface for downstream products. Moving repeated orchestration helpers out of the root app module improves locality without inventing a framework layer.

### 2026-07-01: UI Pattern Primitives Beyond Basic Controls

Decision:

Add shared qitu primitives for filter bars, data toolbars, detail drawers, and command-search trigger structure, and wire them into the starter shell/pages.

Rules:

1. Audit filters use `FilterBar`.
2. Audit result headers use `DataToolbar`.
3. Source metadata details use `DetailDrawer`.
4. The app shell command trigger uses `CommandSearchFixture`.
5. These primitives own layout structure only; business filtering semantics remain app-owned.

Reason:

The first primitive hardening pass covered controls; downstream pages also drift in repeated pattern composition. These small pattern primitives keep density, spacing, and accessibility consistent without turning qitu into a full design-system catalog.

### 2026-07-01: Confirmation Alias Bridge Before Schema Migration

Decision:

Expose confirmation-language aliases in `@qitu/import-pipeline` while keeping existing review actions and statuses stable.

Rules:

1. `confirm` maps to the existing `approve` action.
2. `exclude` maps to the existing `reject` action.
3. `approved` can display as `confirmed`; `rejected` can display as `excluded`.
4. Route keys, permission names, event names, and database statuses stay stable until a deliberate migration is planned.
5. Package interface tests must cover the alias mapping.

Reason:

UI language has moved toward confirmation, but immediate storage renames would be noisy and risky. A package-level alias bridge gives downstream code a canonical semantic interface while preserving compatibility.

### 2026-07-01: Business-Neutral Inbound Email Intake

Decision:

Add an inbound email handler that stores raw RFC822 messages and hands supported attachments to the existing source-file import pipeline.

Rules:

1. Worker `email(message, env)` handles Cloudflare Email Routing events.
2. Raw messages are stored in R2 under `raw-emails/`.
3. `inbound_email_messages` and `inbound_email_attachments` store generic receipt and attachment metadata.
4. Supported attachments create `source_files`, `import_jobs`, audit events, job events, and queue messages through the shared source intake helper.
5. Business interpretation of attachments remains in app-owned import adapters.

Reason:

Real internal data apps often receive files by email. Adding a narrow inbound intake path extends qitu's source-first architecture without adding business parsers, workflow engines, or product-specific inbox semantics.

### 2026-07-01: Static Demo Separate From Preview

Decision:

Add a dedicated frontend-only `demo` environment for visual review and walkthroughs, separate from
the Worker-backed `preview` release environment.

Rules:

1. `demo` builds `apps/web` with `VITE_QITU_API_MODE=mock`.
2. Demo API behavior lives in app-owned web code, not in reusable `packages/*`.
3. Demo state uses browser `localStorage` fixtures and does not use Worker, D1, R2, Queue,
   Cloudflare Email, or secrets.
4. Demo deploys to a dedicated Cloudflare Pages project such as `qitu-demo`.
5. `preview` and `production` continue to use Worker Static Assets and real Cloudflare bindings.
6. Demo must display a clear runtime/notice that services, email, and storage are mocked.
7. Demo must not become a release gate for Worker-backed behavior.

Reason:

`qitu` needs a shareable product-shape preview before real Cloudflare resources are provisioned, but
weakening the existing `preview` gate would blur operational meaning. A static Cloudflare Pages demo
supports review and adoption while preserving `preview` as the production-like environment.

## Pending

1. Whether code generation belongs in core or a separate CLI.
2. Whether React Fast Refresh should be restored through a Vite+ compatible React plugin path.
