# qitu

`qitu` is a business-neutral, Cloudflare-first fullstack application seed.

It is not a business application and it is not a finished framework yet. It is a reusable architecture and starter blueprint for internal tools, data applications, review workflows, and AI-assisted systems with clear boundaries from day one.

Chinese documentation: [`README.zh-CN.md`](./README.zh-CN.md) and [`docs/zh-CN.md`](./docs/zh-CN.md).

## Current Status

Status:

```text
runnable kit baseline
```

The repository currently contains:

1. Architecture and decision docs.
2. Agent entrypoints for Codex, Claude Code, and planning agents.
3. A runnable React app shell.
4. A runnable Cloudflare Worker shell.
5. Generic core package interfaces.
6. Two app-owned starter feature adapters in the Worker.
7. A verified adoption script for renaming, pruning, and reconnecting cloned apps.
8. Copyable app and feature templates under `templates/*`.
9. Optional executable examples under `examples/*`.

See `docs/capability-matrix.md` for what is designed, scaffolded, runnable, tested, or production-ready.

## Quick Start

```sh
vp run setup
vp run dev
vp run validate
```

Corporate networks may block `vp install` while it bootstraps the package manager from `registry.npmjs.org`. See `docs/troubleshooting.md` for the registry workaround.

`vp run dev` starts both the React app and Worker API. Local auth includes demo users for development:

```text
reviewer@example.com
admin@example.com
correct horse battery staple
```

For a frontend-only showcase that does not start the Worker or use Cloudflare bindings, run:

```sh
vp run dev:demo
```

The static demo uses browser-local mock data for auth, files, jobs, review, audit, email metadata,
and AI advisory state. See `docs/demo.md`.

The web app opens at `/login` when signed out. After login it lands on `/workspace`, an app-owned home slot that downstream products can replace without changing the shell, and keeps protected routes under two business-neutral roots:

```text
Workspace: /workspace, /workspace/sources, /workspace/imports, /workspace/reviews
Settings: /settings, /settings/members, /settings/audit
```

## Core Idea

```text
qitu owns reusable application infrastructure.
business features own business meaning.
```

Core packages may know about generic application concepts:

```text
users
sessions
files
jobs
imports
reviews
audits
emails
alerts
AI advisory records
UI shell
```

Business-owned feature code decides:

```text
what a file means
how to parse it
how to validate it
what tables it writes
what charts or pages it needs
what calculations are correct
```

`qitu` does not force a top-level `domains/*` folder. A concrete app may organize business code by feature, workflow, bounded context, or vertical slice. The starter only enforces that reusable core packages do not depend on business-specific code.

## Monorepo Shape

```text
apps/
  web/
  worker/

packages/
  auth/
  rbac/
  db/
  files/
  jobs/
  import-pipeline/
  i18n/
  audit/
  email/
  ai-advisory/
  ui/
  design-system/
  charts/
  config/
  testing/

examples/
  import-review/
  json-records/
  organization-access/

templates/
  app/
  feature/
```

`apps/*` are deployable entrypoints.

`apps/worker/src/*` keeps deployable Worker wiring app-owned: thin route composition entrypoints,
HTTP route groups, auth route groups, Cloudflare binding adapters, source-file intake, MIME parsing
for inbound email, the import job runner, import review routes, feature-owned review stores, and
starter feature registration live there. Reusable state rules and contracts still belong in
`packages/*`.

`apps/web/src/*` keeps the React shell, route pages, page sections, workflow controllers, and demo
mock API app-owned. Reusable visual primitives still belong in `packages/ui`.

`packages/*` are reusable infrastructure and UI packages.

`examples/*` are non-production examples that prove boundaries.

`templates/*` are copyable starting points for future generated apps and feature slices.

## Target Capabilities

`qitu` is growing toward these reusable fullstack capabilities:

1. App-managed authentication.
2. Invitation-only onboarding.
3. Session and password reset flows.
4. RBAC and permission guards.
5. R2-backed source file storage.
6. Queue-backed asynchronous jobs.
7. Import pipeline with staging and human review.
8. Audit events, security events, and alerts.
9. Transactional and inbound email.
10. AI advisory artifacts with human confirmation.
11. Locale-aware React app shell and design system.
12. Recoverable import execution and source lifecycle operations.
13. Accessible workbench layouts and interactive chart primitives.
14. Documentation and decision-log conventions.

Not all capabilities are fully implemented yet. Use `docs/capability-matrix.md` as the source of truth for maturity.

Organization access and versioned derived artifacts are optional examples/recipes, not default core
capabilities. Adopt them only when a concrete app needs tenant ownership or materialized business
calculations.

## What qitu Does Not Provide

`qitu` does not encode business-specific concepts:

1. Business metrics.
2. Business parsers.
3. Business workflows.
4. Business reports.
5. Business data models.
6. Business calculations.

Those belong in app-owned feature code or example/template folders.

## Documentation Map

Chinese documentation starts at `README.zh-CN.md` and `docs/zh-CN.md`.

Start here:

1. `docs/kit-completion.md`
2. `docs/setup.md`
3. `docs/capability-matrix.md`
4. `docs/architecture/overview.md`
5. `docs/architecture/package-boundaries.md`
6. `docs/architecture/data-model.md`
7. `docs/architecture/import-pipeline.md`
8. `docs/architecture/auth-security.md`
9. `docs/architecture/ai-advisory.md`
10. `docs/architecture/ui-design-system.md`
11. `docs/architecture/ui-component-provenance.md`
12. `docs/architecture/dependencies.md`
13. `docs/guides/create-app.md`
14. `docs/guides/add-feature.md`
15. `docs/guides/first-vertical-slice.md`
16. `docs/guides/optional-organization-access.md`
17. `docs/guides/versioned-derived-artifacts.md`
18. `docs/operations/source-lifecycle.md`
19. `docs/deployment.md`
20. `docs/demo.md`
21. `docs/troubleshooting.md`
22. `docs/release-notes.md`
23. `docs/upgrade-notes.md`
24. `docs/agents/agent-integration.md`
25. `docs/decisions/decision-log.md`
26. `docs/roadmap.md`

Agent entrypoints:

1. `AGENTS.md` for Codex and other agentic coding tools.
2. `CLAUDE.md` for Claude Code.
3. `PI.md` for Pi-style planning or conversational agents.

## Naming

The canonical project name is:

```text
qitu
```

`qitu` comes from 鵸鵌, a strange bird from Shan Hai Jing. The image of many heads working through one body fits this starter's shape: auth, data, jobs, review, email, AI advisory, UI, and operations are separate modules that coordinate inside one application seed.

The Chinese homophone joke is welcome: a kit for avoiding 歧途 should probably know the word.

Use lowercase everywhere:

1. Repository name: `qitu`
2. Package prefix: `@qitu/*`
3. CLI name, if added later: `qitu`
4. Documentation title: `qitu`

Avoid suffixes such as `kit`, `framework`, or `starter` in the canonical project name. Those words can appear in explanatory text.

## Implementation Rule

Build real vertical slices before extracting abstractions too aggressively.

Recommended first vertical slice:

```text
invite -> register -> login -> upload file -> create import job -> queue parse -> staging -> review -> advisory -> approve -> commit -> audit
```

Success means a business-owned feature can plug in parser, staging shape, validation, commit logic, and UI without rewriting auth, files, jobs, audits, email, or app shell.
