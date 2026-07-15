# Release Notes

Status: draft  
Date: 2026-07-10

`qitu` is not versioned for npm publication yet. These notes describe reusable starter baselines that another team or agent can clone and adopt.

## Baseline: Runnable Kit

This baseline proves the reusable foundation with one complete vertical slice and one second adapter path.

Included:

1. React app shell with auth, source files, import jobs, review, AI advisory, commit/retry, and audit views.
2. Cloudflare Worker API with D1, R2, Queue, Email, and Static Assets configuration.
3. App-managed auth: invitation, accept, login, logout, `me`, password reset, session revocation, and auth audit events.
4. Minimal RBAC: `owner`, `admin`, `reviewer`, and read-only `viewer`; denied writes are audited as `rbac.denied`.
5. Source file intake with content-hash idempotency, R2 object storage, D1 metadata, queue dispatch, and audit.
6. Queue-backed import processing with app-owned starter adapters for text and JSON records, including invalid numeric text values staying in review instead of committing.
7. Human review with approve/reject decisions, AI advisory artifacts, human confirmation, commit, retry, and audit.
8. Business-neutral packages for auth, RBAC, files, jobs, import pipeline, audit, email, AI advisory, charts, UI, design system, config, db, and testing.
9. Copyable app and feature templates.
10. Agent entrypoints for Codex, Claude Code, and Pi-style planning agents.
11. Validation commands for static smoke, Worker runtime smoke, Worker integration, browser smoke, local migrations, Worker deploy dry-runs, and read-only failed-job operations.

Verified commands for this baseline are recorded in `docs/kit-completion.md`.

## Baseline Update: Recoverable Operations and Accessible Workbench

The 2026-07-10 baseline incorporates reusable lessons from downstream applications without moving
their business vocabulary into qitu core.

Import execution and review:

1. Source intake persists a queued job, dispatches it to Cloudflare Queue, and may also schedule a
   best-effort `ctx.waitUntil` fast path. The Queue remains the durable fallback.
2. Processing ownership and review mutations use bounded compare-and-swap leases. Commit has an
   explicit recoverable `committing` state, and still-queued jobs have an audited redispatch route.
3. Open record errors block ordinary approval and commit. A single-record action may explicitly
   accept the observed errors; batch confirmation never does so implicitly.
4. Adapters remain manual by default. A deterministic adapter may opt into
   `commitPolicy: "auto_when_clean"`; it uses the guarded commit path and a system actor. AI advisory
   artifacts still require human confirmation and never authorize business writes.

Source lifecycle:

1. Raw download and bounded text preview use a dedicated permission and write audit evidence.
2. Reparse, queued-job redispatch, job void, staged-record adjustment, single/batch source deletion,
   soft tombstones, and UTF-8-safe upload/download filenames are included.
3. Source deletion uses an exclusive claim, structured retry stages, app-owned cleanup hooks, and
   report-only retention of metadata/audit/job events.

UI and verification:

1. `AppShell` adds skip navigation, document titles, route-change focus, and native link semantics.
2. `WorkbenchPage`, `WorkbenchGrid`, and `ContextPanel` provide responsive business-neutral layouts.
3. Charts own their styles and add pointer/focus tooltips, keyboard time-series inspection,
   interactive legends, live announcements, and reduced-motion handling.
4. Calendar/date fields receive locale-aware accessible labels. Root unit tests, isolated Worker
   runtime configuration, and PID-isolated browser persistence are part of `verify:kit`.
5. CI no longer asks `setup-node` to restore pnpm state before Corepack has made pnpm available, and
   local Wrangler migration setup discovers the latest numbered migration instead of a fixed marker.

Optional adoption material:

1. `examples/organization-access` demonstrates fail-closed organization context, entitlements,
   time-boxed read-only support access, and exact resource grants without changing the starter's
   single-organization default.
2. The versioned-derived-artifact guide and feature recipe keep formulas, artifact tables, source
   versions, rebuild triggers, and golden fixtures app-owned.

See `docs/upgrade-notes.md` before applying this update to an existing cloned application.

## Not Included

This baseline intentionally does not include:

1. Production Cloudflare account provisioning.
2. Public signup.
3. Social login or SSO.
4. A production tenant-aware resource scope system. The repository includes only an optional
   executable organization-access example and migration runbook.
5. Real AI provider integration.
6. A full chart catalog.
7. Business-specific parsers, tables, dashboards, or calculations.
8. Automatic DLQ consumers or replay automation for a real production queue.

## Compatibility Notes

Pinned toolchain:

1. TypeScript `7.0.2`.
2. Vite+ `0.2.1`.
3. pnpm `11.5.2`.
4. Wrangler `4.103.0`.
5. React `19.2.7`.

Keep versions exact unless a decision record explains the change.
