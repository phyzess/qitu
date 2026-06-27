# Capability Matrix

Status: draft  
Date: 2026-06-27

Legend:

| Status           | Meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| Designed         | Architecture and decisions are documented.                    |
| Scaffolded       | Package or app shell exists.                                  |
| Runnable         | Local command path exists.                                    |
| Verified         | Covered by smoke, type, unit, integration, or runtime checks. |
| Production-ready | Ready for real users with operational runbooks.               |

## Current Matrix

| Capability            | Designed | Scaffolded | Runnable | Verified | Production-ready | Notes                                                                                                                                                                       |
| --------------------- | -------- | ---------- | -------- | -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React app shell       | Yes      | Yes        | Yes      | Partial  | No               | API-backed invite/reset/login/upload/review/AI advisory/commit/retry/audit console with scripted browser smoke coverage.                                                    |
| Worker API shell      | Yes      | Yes        | Yes      | Partial  | No               | `apps/worker` exposes health/runtime primitives and has a minimal Cloudflare Vitest runtime smoke.                                                                          |
| Auth                  | Yes      | Yes        | Partial  | Partial  | No               | Invite links, accept page, login, logout, `me`, reset page, session revocation, and audit paths are integrated.                                                             |
| RBAC                  | Yes      | Partial    | Partial  | Partial  | No               | `@qitu/rbac` defines owner/admin/reviewer/viewer; Worker write routes enforce permissions and audit `rbac.denied`; multi-tenant scopes remain future work.                  |
| Files                 | Yes      | Yes        | Partial  | Partial  | No               | Authenticated upload writes R2/D1/audit; source list API and upload UI are wired to the Worker API.                                                                         |
| Jobs                  | Yes      | Partial    | Partial  | Partial  | No               | Upload creates queued import job; handler/local drain advance processing/needs_review/failed; failed jobs can be listed read-only and retried manually.                     |
| Import pipeline       | Yes      | Partial    | Partial  | Partial  | No               | Worker registers app-owned text and JSON starter adapters; queue uses adapter parse/stage/validate, invalid numeric text stays in review, and commit uses `commitApproved`. |
| Human review          | Yes      | Partial    | Partial  | Partial  | No               | Review/decision/commit/retry API routes and API-backed demo console exist; handler and browser smoke cover approve, commit, reject.                                         |
| Audit                 | Yes      | Partial    | Partial  | Partial  | No               | Sensitive paths write audit; audit list API and web timeline exist; handler integration verifies visibility.                                                                |
| Email                 | Yes      | Partial    | Partial  | Partial  | No               | Invitation/reset templates, local delivery metadata, Cloudflare `send_email`, and React token landing pages are wired.                                                      |
| AI advisory           | Yes      | Partial    | Partial  | Partial  | No               | Local deterministic import-review advisory artifacts, list/generate/confirm/dismiss routes, web panel, and audit events are wired.                                          |
| Charts                | Yes      | Partial    | Partial  | Partial  | No               | `@qitu/charts` exports a visx-backed `TimeSeriesChart`, and the starter console renders it; broader chart catalog remains future work.                                      |
| Design system         | Yes      | Partial    | Yes      | Partial  | No               | Tokens and UI package exist.                                                                                                                                                |
| Feature templates     | Yes      | Yes        | Yes      | Partial  | No               | `templates/app` has a verified copy manifest; `templates/feature` is a typechecked copyable adapter and registry starter.                                                   |
| Agent docs            | Yes      | Yes        | N/A      | Partial  | No               | Codex, Claude Code, and Pi entrypoints exist.                                                                                                                               |
| Cloudflare deployment | Yes      | Partial    | Partial  | Partial  | No               | Local, preview, and production binding stubs exist; dry-run scripts, DLQ remediation runbook, and deployment runbook are wired, but no real account is provisioned.         |

## Verification Targets

Near-term verification should be added in this order:

1. Static smoke checks for template invariants.
2. Worker handler integration with local D1/R2/Queue fakes.
3. Package type checks with TypeScript 7 RC.
4. Worker runtime tests covering Cloudflare Email Service, Queues, D1, and R2 binding behavior beyond the current minimal runtime smoke.
5. Broader adapter edge-case tests only when new real adapters add parser-specific risk.

## Production Readiness Gate

A capability becomes production-ready only when these are true:

1. It has tests that exercise success and failure paths.
2. It writes audit events for sensitive actions.
3. It has rate limits or abuse controls where relevant.
4. It has an operational recovery path.
5. It does not depend on AI output without human confirmation.
6. It has documented Cloudflare bindings and secrets.
