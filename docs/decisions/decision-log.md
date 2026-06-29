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
2. Login, invite acceptance, and local reviewer bootstrap land in the authenticated workbench.
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

1. Authenticated login lands on `/workspace`, not directly on a review workflow.
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

## Pending

1. Whether code generation belongs in core or a separate CLI.
2. Whether React Fast Refresh should be restored through a Vite+ compatible React plugin path.
