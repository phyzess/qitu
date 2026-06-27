# Roadmap

`qitu` should grow through real vertical slices, not through speculative generalization.

## Phase 0: Architecture Seed

Status:

```text
baseline complete
```

Goals:

1. Establish project identity.
2. Define package boundaries.
3. Define agent entry points.
4. Define first vertical slice.
5. Keep the core business-neutral.

Exit criteria:

1. `README.md` explains the project clearly.
2. Architecture docs describe the reusable core.
3. Agent docs tell Codex, Claude Code, and planning agents how to work here.
4. No business-specific vocabulary is required to understand the core.

## Phase 1: Skeleton App

Status:

```text
done
```

Goals:

1. Create workspace structure.
2. Add React app shell.
3. Add Worker API shell.
4. Add shared config package.
5. Add DB migrations.
6. Add local commands for typecheck, tests, and migrations.

Exit criteria:

1. One command starts local development.
2. One command validates the repo.
3. One command prepares Cloudflare bindings.
4. The app can render a protected shell after login.

Current gap:

1. The app shell renders and the local reviewer setup/login UI is wired to the Worker API.
2. Deployment preparation includes local, preview, and production binding stubs, same-origin Worker Static Assets, and Queue DLQ configuration; production hardening remains tracked below with owner paths.

## Phase 2: First Vertical Slice

Status:

```text
baseline complete
```

Goals:

1. Invite a user.
2. Register from invite.
3. Login with email and password.
4. Upload a source file.
5. Store it in R2.
6. Create an import job.
7. Process the job asynchronously.
8. Write staging records.
9. Review and approve records.
10. Commit business-owned records.
11. Write audit events.

Exit criteria:

1. An example feature can complete the entire path.
2. Core packages do not know example-specific fields.
3. Failed jobs are visible and retryable.
4. Review decisions are traceable.

Current P0 baseline completed:

1. Auth bootstrap.
2. Source file intake.
3. Import job state machine.
4. Review staging and approval.
5. Commit with audit.
6. Password reset and email delivery baseline.
7. Emailed invite and password-reset landing pages.
8. Adapter-driven parse/stage/validate/commit for the app-owned starter feature.
9. Failure visibility, failure classification, and manual retry controls.
10. Browser coverage for both approved/commit and rejected review decisions.
11. A second JSON records feature adapter proving the registry path without changing core semantics.
12. AI advisory artifacts with local deterministic generation, human confirm/dismiss, web panel, and audit.
13. Minimal RBAC with invitation-assigned roles, guarded write routes, read-only viewer behavior, and audited denials.
14. Adapter validation edge-case coverage for invalid numeric source data staying in review and blocked from commit.
15. DLQ and failed-job remediation runbook with a read-only D1 failed-job snapshot command.

Remaining P1 follow-up:

None. Future production hardening can add an automatic DLQ consumer only after real queue operations prove manual recovery is insufficient.

Current verification:

1. `vp run smoke` covers the Worker handler path from invite to audit visibility with local D1/Email/R2/Queue fakes, including password reset, role preservation, viewer RBAC denial, text adapter staging/commit, invalid numeric validation staying in review, JSON adapter staging/commit, AI advisory generation/confirmation, failure classification, manual retry, and session revocation.
2. The React console calls the Worker API client for local setup/login/password reset, upload, source files, jobs, local queue drain, review decisions, AI advisory, commit, manual retry, and audit.
3. `vp run test:worker-runtime` uses the official Cloudflare Vitest pool to verify `/health` and unauthenticated upload rejection inside the Workers runtime.
4. `vp run smoke:browser` starts local Web/Worker dev and exercises invite link acceptance, password reset link confirmation, login, upload, queue drain, approve, commit, reject, and audit in Chromium.
5. `vp run ops:failed-jobs` provides a read-only operator snapshot for failed, queued, and processing import jobs.

## Phase 3: Second Feature Test

Status:

```text
baseline complete
```

Goals:

1. `examples/json-records` adds a second concrete feature.
2. It reuses the same auth, file, job, review, audit, and email packages.
3. The Worker registry selects it by `.json` file name or `application/json` content type.

Exit criteria:

1. The second feature adds no new core concepts.
2. Core package contracts did not change.
3. Smoke and Worker integration verify both optional example packages independently of the Worker starter adapters.

## Phase 4: Extraction Quality

Status:

```text
baseline complete; future extraction hardening tracked
```

Goals:

1. Stabilize package APIs.
2. Maintain templates for new apps and new feature slices.
3. Add smoke tests for generated apps.
4. Add release notes and upgrade notes.

Exit criteria:

1. A new app can start from `templates/app/manifest.json`.
2. A new feature can be added from `templates/feature`.
3. The repo can be adopted by another agent without private context.

Current verification:

1. `templates/app/manifest.json` is checked by smoke for missing copy paths.
2. `templates/feature` is a workspace package with a typechecked `ImportFeatureAdapter` and app-owned registry starter.
3. Release and upgrade notes describe the current starter baseline and safe adoption path.

## Completion Gate

The final target is defined in `docs/kit-completion.md`.

The project is complete only when:

1. All P0 items in this roadmap are implemented.
2. `docs/capability-matrix.md` matches the actual implementation state.
3. `vp run verify:kit` passes.
4. A local clean D1 migration applies.
5. The first vertical slice can be completed without manual database edits.
