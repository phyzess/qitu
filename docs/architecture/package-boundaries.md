# Package Boundaries

Status: draft  
Date: 2026-06-27

## 1. Boundary Rule

Core packages must be business-neutral. App-owned feature code may depend on core packages, but core packages must not depend on app-owned feature code.

```text
packages/* -> no business meaning
apps/* -> deployable entrypoints and app-local features
examples/* -> non-production examples that prove boundaries
templates/* -> copyable starting points
```

`qitu` does not require a top-level `domains/*` folder. Concrete apps may organize business code by feature, workflow, bounded context, or vertical slice.

`apps/worker/src/*` may contain app-local modules that adapt reusable package interfaces to Cloudflare bindings and route wiring. Current examples include auth route composition, the import adapter registry, import job runner, import review routes, audit D1 store, email delivery store, HTTP route helpers, and runtime config helpers. These modules are intentionally app-owned: they may know D1/R2/Queue/Email bindings and starter tables, but they must not move business meaning into `packages/*`.

## 2. Proposed Packages

### 2.1 `packages/auth`

Owns:

1. Users.
2. Password identity.
3. Invitations.
4. Password reset.
5. Sessions.
6. Login attempts.

Does not own:

1. Business roles.
2. Business resource permissions.
3. Business user profiles.

### 2.2 `packages/rbac`

Owns:

1. Permission registry.
2. `can(user, action, resource)`.
3. Route guards.
4. UI visibility helpers.

Does not own:

1. Business-specific actions.
2. Business-specific resource hierarchies.

### 2.3 `packages/files`

Owns:

1. R2 object key conventions.
2. Source file metadata.
3. Secure file downloads.
4. Hashing.
5. File validation.

Does not own:

1. Business parsing.
2. Business file meaning.

### 2.4 `packages/jobs`

Owns:

1. Queue message envelope.
2. Idempotency helpers.
3. Retry classification.
4. Job logging hooks.
5. Failure alert hooks.

Does not own:

1. Business job handler logic.

### 2.5 `packages/import-pipeline`

Owns:

1. Import job creation.
2. Import job state machine.
3. Queue handoff.
4. Timeline events.
5. Review issue lifecycle.
6. Approve/reject/void flow.
7. Import feature adapter contract.
8. Generic review status helpers and staging key conventions.

Does not own:

1. Business staging table schema.
2. Business commit logic.
3. Parser internals for a specific file format.

### 2.6 `packages/audit`

Owns:

1. Append-only audit writes.
2. Audit query helpers.
3. Redaction.
4. Actor/session/request metadata.

Does not own:

1. Business-specific audit interpretation.

### 2.7 Planned `security` Capability

For now, security events stay in `packages/audit` or app-owned code. Split a package only when reuse pressure is proven.

Would own:

1. Security events.
2. Login failures.
3. Permission denial events.
4. Suspicious access patterns.

Does not own:

1. Business risk scoring.

### 2.8 Planned `alerts` Capability

For now, alerts stay in app-owned code or audit-driven operational views. Split a package only when alert lifecycle behavior becomes reusable.

Would own:

1. Alert creation.
2. Acknowledge/resolve.
3. Notification hooks.
4. Admin alert surfaces.

Does not own:

1. Business-specific escalation policy.

### 2.9 `packages/email`

Owns:

1. Transactional email sending.
2. Invitation email.
3. Password reset email.
4. Inbound email metadata.
5. Raw email R2 storage.
6. Attachment handoff.

Does not own:

1. Business-specific attachment parsing.

### 2.10 `packages/ai-advisory`

Owns:

1. AI provider abstraction.
2. Advisory artifact storage.
3. Prompt/result redaction.
4. Human-confirmation enforcement.
5. AI usage audit hooks.

Does not own:

1. Business calculations.
2. Business truth.

### 2.11 `packages/ui`

Owns:

1. App shell.
2. Topbar primary navigation and secondary route tabs.
3. Common panels.
4. Forms.
5. Tables.
6. Review workflow components.
7. Timeline components.

Does not own:

1. Business-specific pages.
2. Business terminology.

### 2.12 `packages/design-system`

Owns:

1. Tokens.
2. Typography.
3. Color.
4. Motion.
5. Spacing.
6. Theme primitives.

Does not own:

1. Business information architecture.

### 2.13 `packages/charts`

Owns:

1. Chart primitives.
2. Chart themes.
3. Tooltip and legend behavior.
4. Internal visx usage.

Does not own:

1. Business chart meaning.
2. Business metric calculation.

## 3. Feature Adapter Contract

Business-owned import features may expose:

```ts
type ImportFeatureModule = {
  id: string;
  name: string;
  routes?: unknown[];
  navigation?: unknown[];
  permissions?: unknown[];
  importAdapters?: ImportFeatureAdapter<unknown, unknown, unknown>[];
};
```

An import adapter should expose a narrow interface:

```ts
type ImportFeatureAdapter<TParsed, TStaged, TCommitted> = {
  id: string;
  canHandle(source: { filename: string; contentType: string }): boolean;
  parse(source: ReadableStream<Uint8Array>): Promise<TParsed[]>;
  stage(parsed: TParsed[]): Promise<TStaged[]>;
  validate(staged: TStaged): ReviewIssue[];
  commitApproved(input: {
    records: TStaged[];
    context: CommitApprovedContext;
  }): Promise<TCommitted[]>;
};
```

`CommitApprovedContext` is provided by the app layer after human review. It carries reviewer identity, import job identity, approved staged record keys, and an idempotency key.

## 4. Anti-Leakage Checks

Before committing code to `packages/*`, ask:

1. Does this package mention a specific business?
2. Does it know a business-owned table name?
3. Does it know a business metric?
4. Does it decide business truth?
5. Would this package be reusable in a different internal tool?

If the answer is no for reuse, move it to app-owned feature code or an example.
