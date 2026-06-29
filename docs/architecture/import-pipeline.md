# Import Pipeline

Status: draft  
Date: 2026-06-27

## 1. Purpose

The import pipeline is the central reusable workflow in `qitu`.

It turns unknown or semi-structured inputs into reviewed, auditable, business-owned data.

## 2. Flow

```text
source file
-> source_files
-> import_jobs
-> queue
-> feature parser
-> feature staging
-> human review
-> feature commit
-> audit_events
```

## 3. Core Owns

Core packages own:

1. Source file metadata.
2. Raw file storage.
3. Import job lifecycle.
4. Queue message envelope.
5. Generic review issue lifecycle.
6. Approve/reject/void decision records.
7. Audit hooks.

Core does not own business staging payloads or business commit tables.

## 4. Feature Owns

Business-owned feature code owns:

1. Source matching.
2. File parser.
3. Parsed record shape.
4. Staging shape.
5. Validation rules.
6. `commitApproved` logic.
7. Business-owned tables.
8. Review UI copy.

## 5. Import Feature Adapter

The generic adapter shape lives in `@qitu/import-pipeline`:

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

The adapter is intentionally narrow. It does not prescribe where app-owned feature code lives.

`CommitApprovedContext` must include the import job, reviewer identity, approved staged record keys, and an idempotency key. This prevents an adapter from treating commit as a raw data write detached from review.

## 6. Review Decision

Review decisions should be explicit and auditable:

```ts
type ReviewDecision = {
  importJobId: string;
  reviewerId: string;
  action: "approve" | "reject" | "void";
  note?: string;
  rowDecisions?: Array<{
    stagedRecordId: string;
    action: "approve" | "reject";
    note?: string;
  }>;
};
```

Job status is derived from staged-record status counts after review and commit actions:

1. Any approved, uncommitted staged record keeps the job `approved`, because there is work ready to commit.
2. Pending staged records without approved work keep the job `needs_review`, including after a partial commit.
3. A job becomes `committed` only after approved rows have been committed and no staged records remain pending or approved.
4. Rejected-only jobs stay `needs_review` in the neutral starter because there is no separate job-level rejected status.

## 7. Idempotency Requirements

Import work must be safe to retry:

1. Queue messages carry stable `jobId`.
2. Source file object keys are stable.
3. Staging writes are keyed by import job and source row identity when possible.
4. Commit operations must avoid duplicate business-owned rows.
5. Audit events should describe retries without hiding the original failure.

The starter Worker currently includes app-owned `example_staged_records` and `example_committed_records` tables to prove the path. Real applications should replace those with feature-owned tables without changing core review decisions.

## 8. Failure Classes

The reusable pipeline should distinguish:

1. Unsupported source.
2. Parse error.
3. Missing required business fields.
4. Invalid business date or number.
5. Duplicate source.
6. Duplicate target record.
7. Commit conflict.
8. Infrastructure failure.

Failures should be visible and retryable unless the adapter marks them as terminal.

The current web starter exposes that visibility in the Imports route: the selected job inspector shows status, adapter, attempt count, failure class, failure reason, timestamps, source hash, recovery guidance, RBAC-aware retry action, and the `import_job_events` stream before the user opens the Review route.
