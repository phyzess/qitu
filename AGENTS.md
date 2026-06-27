# Agent Instructions for qitu

## Project Identity

`qitu` is a business-neutral Cloudflare-first fullstack application seed.

Do not add business-specific assumptions to core packages or docs. Business meaning belongs in app-owned feature code, examples, or templates, not in reusable `packages/*`.

## Shell

Use Nushell for command-line execution:

```text
nu -lc '<command>'
```

When using POSIX tools under Nushell, call external commands explicitly if needed.

## Editing Rules

1. Prefer small, intentional edits.
2. Use `apply_patch` for manual file edits.
3. Do not write secrets or tokens into docs or code.
4. Do not introduce business-specific vocabulary into `packages/*` or core docs.
5. If a decision is made, update `docs/decisions/decision-log.md`.
6. If a new architectural boundary is introduced, update `README.md`.

## Architecture Rules

Core packages may know:

```text
auth
rbac
files
jobs
imports
reviews
audits
security
alerts
email
ai advisory
ui shell
```

Core packages must not know:

```text
business metrics
business tables
business parser fields
business workflows
business reports
```

## Agent Workflow

Before implementing code:

1. Read `README.md`.
2. Read `docs/kit-completion.md`.
3. Read `docs/capability-matrix.md`.
4. Read `docs/architecture/overview.md`.
5. Read `docs/architecture/package-boundaries.md`.
6. Check `docs/decisions/decision-log.md`.
7. Read the relevant task-specific architecture doc.
8. Keep the core/business boundary intact.

For substantial changes:

1. State the intended boundary.
2. Update docs first or alongside code.
3. Add tests when behavior changes.
4. Call out any unresolved decision.

## Do Not

1. Do not turn `qitu` into a business app.
2. Do not build a universal workflow engine in v0.1.
3. Do not build a universal parser DSL in v0.1.
4. Do not add a dashboard builder before two concrete feature slices prove the need.
5. Do not let AI advisory results bypass human review.
