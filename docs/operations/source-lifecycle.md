# Source Lifecycle Operations

Status: runnable baseline
Date: 2026-07-10

Source operations are app-owned Worker routes over generic qitu permissions and import/review
contracts. Raw content stays in R2; D1 keeps source metadata, jobs, review state, and audit evidence.

## Route Baseline

| Operation            | Route                                                    | Permission            | Safety rule                                                                 |
| -------------------- | -------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------- |
| Download             | `GET /api/source-files/:sourceFileId/download`           | `source_file:raw`     | Stream from R2 with `nosniff` and UTF-8-safe attachment metadata.           |
| Preview              | `GET /api/source-files/:sourceFileId/preview`            | `source_file:raw`     | Text/JSON/XML only; read at most 64 KiB and report truncation.              |
| Reparse              | `POST /api/source-files/:sourceFileId/reparse`           | `source_file:reparse` | Create a new queued job against the existing immutable source object.       |
| Redispatch           | `POST /api/import-jobs/:jobId/dispatch`                  | `import_job:retry`    | Re-send only a still-queued job and append dispatch evidence.               |
| Void job             | `POST /api/import-jobs/:jobId/void`                      | `review:decide`       | Idempotent; committed jobs require source cleanup instead.                  |
| Adjust staged record | `PATCH /api/import-jobs/:jobId/staged-records/:recordId` | `review:decide`       | App adapter validates the payload; committed/voided work cannot be changed. |
| Delete source        | `DELETE /api/source-files/:sourceFileId`                 | `source_file:delete`  | Void jobs, delete R2, run app cleanup, then tombstone metadata.             |
| Batch delete         | `POST /api/source-files/delete`                          | `source_file:delete`  | Deduplicated, sequential, and limited to 50 source ids.                     |

Raw reads and lifecycle mutations write audit evidence. Viewer roles remain unable to read raw
source content or mutate source lifecycle state in the starter policy.

## Delete Protocol

Before enabling deletion for a real adapter, implement
`WorkerReviewStore.prepareDeleteSourceRecords`. The hook must remove or rebuild all app-owned staged,
committed, and derived data contributed by the source. Qitu cannot infer those business tables.

Deletion order is deliberate:

```text
claim source deletion with compare-and-swap
-> verify every adapter cleanup hook
-> renew the exact claim before each job void
-> renew the exact claim, then delete the R2 object
-> renew the exact claim again after R2 returns
-> run each app-owned cleanup store with only its own job ids
-> set source_files.deleted_at/deleted_by
-> append audit and job events
```

The deletion claim is also the durable recovery record. Once deletion has started, an R2, job-void,
or D1-cleanup failure keeps the claim and records a failure stage instead of reopening the source.
Normal source lists and raw reads fail closed while the claim exists. A DELETE retry may immediately
compare-and-swap a recorded failure stage without waiting for the ordinary 15-minute lease to
expire. Retrying after R2 succeeds is safe because deleting a missing object is tolerated and every
cleanup hook must be idempotent.

A concurrent delete receives `source_deletion_in_progress`; a database trigger blocks reparse/new
job insertion after the claim. Claim takeover and its reclaim/resume audit are one D1 transaction;
the exact token is renewed before destructive side effects and after R2 returns. A five-minute
scheduled handler recovers recorded failures and expired claims even when no import Queue message
survives. Queue delivery may wait once for a fresh claim, but an expired/failed claim is handed to
the same recovery path and acknowledged instead of consuming the finite retry budget. Repeated
failures keep one open `source_file.deletion_stalled` alert, which successful cleanup resolves.
Missing cleanup support may release only a brand-new, side-effect-free claim; recovery claims remain
fail closed and alert an operator. Batch deletion reports each item separately so one failed source
does not hide earlier successes.

Deleted source rows are hidden from normal source/job lists, while metadata, audit events, and job
events remain report-only evidence.

The starter does not run an automatic retention purge. A cloned app must confirm its compliance
policy before adding destructive metadata or audit cleanup, and that job must emit structured
operator evidence.

## Review Safety

Open `error` issues block ordinary approval and batch confirmation. An approved record cannot be
committed while its own error remains open; an open issue on a rejected or still-pending row does
not block separately approved clean rows. A single-record approve may set
`overrideOpenErrors: true`; that explicit action marks the record's observed open errors `accepted`
inside the same D1 batch as the decision and writes audit/job events. Batch confirmation never
accepts errors implicitly.

Adapters default to manual confirmation. An app may opt a deterministic adapter into
`commitPolicy: "auto_when_clean"` (or the compatibility flag `autoCommitCleanImports: true`). The
automatic path runs only with no open errors and reuses the same confirmation and
`commitApproved` persistence path as manual review.

`committing` is exclusive and recoverable. Job void and source deletion must reject both fresh and
stale commit claims rather than deleting the work underneath them. Recover commit first by replaying
the adapter with the stable `commit:${jobId}` idempotency key; only then may a later lifecycle action
proceed from the resulting non-committing state.
