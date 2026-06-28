import { useMemo, type RefObject } from "react";
import { TimeSeriesChart, type ChartDatum } from "@qitu/charts";
import { AppShell, Button, StatusBadge, type StatusBadgeTone } from "@qitu/ui";
import {
  Activity,
  ArrowRight,
  Check,
  Clock3,
  Database,
  FileSpreadsheet,
  FileUp,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { EmptyText, ErrorText, Panel, SectionTitle, nav } from "./app-ui";
import type {
  AiAdvisoryArtifact,
  ApiUser,
  AuditEvent,
  ImportJobListItem,
  ReviewIssue,
  SourceFile,
  StagedRecord,
} from "./types";

export type ReviewCounts = {
  pending: number;
  approved: number;
  rejected: number;
  committed: number;
};

export function ReviewConsole(props: {
  aiAdvisories: AiAdvisoryArtifact[];
  auditEvents: AuditEvent[];
  canCommit: boolean;
  canRetry: boolean;
  counts: ReviewCounts;
  error: string | null;
  importJobs: ImportJobListItem[];
  isBusy: boolean;
  notice: string;
  onCommitApproved: () => void;
  onConfirmAdvisory: (advisoryId: string) => void;
  onDecide: (recordId: string, status: "approved" | "rejected") => void;
  onDismissAdvisory: (advisoryId: string) => void;
  onGenerateAdvisory: () => void;
  onLogout: () => void;
  onProcessLocalQueue: () => void;
  onRefresh: () => void;
  onRetrySelectedJob: () => void;
  onSelectJob: (jobId: string) => void;
  onUploadSample: () => void;
  onUploadSelected: () => void;
  reviewIssues: ReviewIssue[];
  reviewRecords: StagedRecord[];
  reviewTrend: ChartDatum[];
  runtimeEnvironment: string;
  selectedJob: ImportJobListItem | null;
  selectedJobId: string | null;
  sourceFiles: SourceFile[];
  uploadInputRef: RefObject<HTMLInputElement | null>;
  user: ApiUser;
}) {
  const jobBySourceId = useMemo(() => {
    return new Map(props.importJobs.map((job) => [job.sourceFileId, job]));
  }, [props.importJobs]);

  return (
    <AppShell
      actions={
        <>
          <Button disabled={props.isBusy} size="sm" variant="ghost" onClick={props.onRefresh}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button disabled={props.isBusy} size="sm" variant="ghost" onClick={props.onLogout}>
            <X size={15} /> Logout
          </Button>
        </>
      }
      brand="qitu"
      navigation={nav}
    >
      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.55fr_0.8fr]">
        <section className="space-y-5">
          <Panel>
            <div className="flex items-start justify-between gap-4">
              <div>
                <StatusBadge tone="active">{props.user.email}</StatusBadge>
                <h1 className="mt-3 text-xl font-semibold tracking-normal">Review console</h1>
                <div className="mt-2 text-xs text-[var(--color-text-muted)]">{props.notice}</div>
              </div>
              <LockKeyhole size={17} className="text-[var(--color-accent)]" />
            </div>
            {props.error ? <ErrorText>{props.error}</ErrorText> : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Kpi label="Pending" value={props.counts.pending} />
              <Kpi label="Approved" value={props.counts.approved} />
              <Kpi label="Rejected" value={props.counts.rejected} />
              <Kpi label="Committed" value={props.counts.committed} />
            </div>
            <div className="mt-4 rounded-lg bg-[var(--color-panel-subtle)] p-3">
              <TimeSeriesChart data={props.reviewTrend} height={120} label="Review status trend" />
            </div>
          </Panel>

          <Panel>
            <SectionTitle icon={<FileSpreadsheet size={16} />} label="Source files" />
            <div className="mt-4 space-y-3">
              <input
                ref={props.uploadInputRef}
                className="block w-full rounded-lg bg-[var(--color-panel-subtle)] px-3 py-2 text-sm"
                type="file"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={props.isBusy}
                  size="sm"
                  variant="secondary"
                  onClick={props.onUploadSelected}
                >
                  <FileUp size={14} /> Upload selected
                </Button>
                <Button
                  disabled={props.isBusy}
                  size="sm"
                  variant="ghost"
                  onClick={props.onUploadSample}
                >
                  <FileUp size={14} /> Upload sample
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {props.sourceFiles.length === 0 ? (
                <EmptyText>No source files yet.</EmptyText>
              ) : (
                props.sourceFiles.map((file) => (
                  <SourceFileItem
                    file={file}
                    job={jobBySourceId.get(file.id) ?? null}
                    key={file.id}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={<Activity size={16} />} label="Import jobs" />
              {props.runtimeEnvironment === "local" ? (
                <Button
                  disabled={props.isBusy}
                  size="sm"
                  variant="ghost"
                  onClick={props.onProcessLocalQueue}
                >
                  <RefreshCw size={14} /> Process local queue
                </Button>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {props.importJobs.length === 0 ? (
                <EmptyText>No import jobs yet.</EmptyText>
              ) : (
                props.importJobs.map((job) => (
                  <JobStep
                    active={job.id === props.selectedJobId}
                    job={job}
                    key={job.id}
                    onSelect={() => props.onSelectJob(job.id)}
                  />
                ))
              )}
            </div>
          </Panel>
        </section>

        <section className="qitu-card min-h-[640px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <div className="text-sm font-medium">Staged records</div>
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                {props.selectedJob
                  ? props.selectedJob.sourceFile.filename
                  : "No import job selected"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {props.canRetry ? (
                <Button
                  disabled={props.isBusy}
                  size="sm"
                  variant="secondary"
                  onClick={props.onRetrySelectedJob}
                >
                  <RefreshCw size={14} /> Retry job
                </Button>
              ) : null}
              <Button
                disabled={!props.canCommit || props.isBusy}
                size="sm"
                onClick={props.onCommitApproved}
              >
                <Database size={14} /> Commit approved
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 px-3 pb-4 text-left">
              <thead>
                <tr className="text-xs text-[var(--color-text-muted)]">
                  <th className="px-3 py-2 font-medium">Record</th>
                  <th className="px-3 py-2 font-medium">Payload</th>
                  <th className="px-3 py-2 font-medium">Issue</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {props.reviewRecords.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-sm text-[var(--color-text-muted)]" colSpan={5}>
                      No staged records are available yet.
                    </td>
                  </tr>
                ) : (
                  props.reviewRecords.map((record) => (
                    <ReviewRow
                      issue={issueForRecord(record, props.reviewIssues)}
                      key={record.id}
                      onApprove={() => props.onDecide(record.id, "approved")}
                      onReject={() => props.onDecide(record.id, "rejected")}
                      record={record}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-5">
          <Panel>
            <SectionTitle icon={<ShieldCheck size={16} />} label="Guardrails" />
            <div className="mt-4 space-y-3">
              <Guardrail label="Reviewer identity required" state="active" />
              <Guardrail label="Rejected rows cannot commit" state="active" />
              <Guardrail label="AI output stays advisory" state="active" />
              <Guardrail label="Audit event per decision" state="active" />
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={<Sparkles size={16} />} label="AI advisory" />
              <Button
                disabled={!props.selectedJobId || props.isBusy}
                size="sm"
                variant="ghost"
                onClick={props.onGenerateAdvisory}
              >
                <Sparkles size={14} /> Generate
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {props.aiAdvisories.length === 0 ? (
                <EmptyText>No advisory yet.</EmptyText>
              ) : (
                props.aiAdvisories.map((advisory) => (
                  <AiAdvisoryItem
                    advisory={advisory}
                    disabled={props.isBusy}
                    key={advisory.id}
                    onConfirm={() => props.onConfirmAdvisory(advisory.id)}
                    onDismiss={() => props.onDismissAdvisory(advisory.id)}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <SectionTitle icon={<ListChecks size={16} />} label="Audit timeline" />
            <div className="mt-4 space-y-3">
              {props.auditEvents.length === 0 ? (
                <EmptyText>No audit events yet.</EmptyText>
              ) : (
                props.auditEvents.map((event) => <AuditItem event={event} key={event.id} />)
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

function Kpi(props: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--color-panel-subtle)] p-3">
      <div className="text-xs text-[var(--color-text-muted)]">{props.label}</div>
      <div className="qitu-number mt-2 text-2xl font-semibold">{props.value}</div>
    </div>
  );
}

function SourceFileItem(props: { file: SourceFile; job: ImportJobListItem | null }) {
  const status = props.job?.status ?? "stored";

  return (
    <div className="rounded-lg bg-[var(--color-panel-subtle)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{props.file.filename}</div>
          <div className="qitu-number mt-1 text-xs text-[var(--color-text-muted)]">
            {formatBytes(props.file.size)}
          </div>
        </div>
        <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
      </div>
    </div>
  );
}

function JobStep(props: { active: boolean; job: ImportJobListItem; onSelect: () => void }) {
  return (
    <button
      className={[
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
        props.active ? "bg-white shadow-sm" : "hover:bg-[var(--color-panel-subtle)]",
      ].join(" ")}
      onClick={props.onSelect}
      type="button"
    >
      <div className="flex size-7 items-center justify-center rounded-full bg-[var(--color-panel-subtle)] text-[var(--color-accent)]">
        {props.job.status === "needs_review" ? <Clock3 size={14} /> : <Check size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{props.job.sourceFile.filename}</div>
        <div className="qitu-number text-xs text-[var(--color-text-muted)]">
          {formatTime(props.job.updatedAt)}
        </div>
      </div>
      <StatusBadge tone={statusTone(props.job.status)}>{props.job.status}</StatusBadge>
      <ArrowRight size={14} className="text-[var(--color-text-muted)]" />
    </button>
  );
}

function ReviewRow(props: {
  issue: ReviewIssue | null;
  record: StagedRecord;
  onApprove: () => void;
  onReject: () => void;
}) {
  const disabled = props.record.reviewStatus === "committed";

  return (
    <tr>
      <td className="rounded-l-lg bg-white px-3 py-3 align-top shadow-[0_1px_0_rgba(22,22,21,0.05)]">
        <div className="text-sm font-medium">{props.record.sourceRowKey}</div>
        <div className="mt-1 max-w-[220px] truncate text-xs text-[var(--color-text-muted)]">
          {props.record.stagedRecordKey}
        </div>
      </td>
      <td className="bg-white px-3 py-3 align-top shadow-[0_1px_0_rgba(22,22,21,0.05)]">
        <div className="qitu-number max-w-[220px] truncate text-xs">
          {payloadSummary(props.record.payload)}
        </div>
      </td>
      <td className="max-w-[240px] bg-white px-3 py-3 align-top shadow-[0_1px_0_rgba(22,22,21,0.05)]">
        <div className="text-xs leading-5 text-[var(--color-text-muted)]">
          {props.issue?.message ?? "No issue"}
        </div>
      </td>
      <td className="bg-white px-3 py-3 align-top shadow-[0_1px_0_rgba(22,22,21,0.05)]">
        <StatusBadge tone={statusTone(props.record.reviewStatus)}>
          {props.record.reviewStatus}
        </StatusBadge>
      </td>
      <td className="rounded-r-lg bg-white px-3 py-3 text-right align-top shadow-[0_1px_0_rgba(22,22,21,0.05)]">
        <div className="flex justify-end gap-2">
          <Button disabled={disabled} size="sm" variant="ghost" onClick={props.onReject}>
            <X size={14} /> Reject
          </Button>
          <Button disabled={disabled} size="sm" variant="secondary" onClick={props.onApprove}>
            <Check size={14} /> Approve
          </Button>
        </div>
      </td>
    </tr>
  );
}

function Guardrail(props: { label: string; state: "active" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-panel-subtle)] px-3 py-2">
      <div className="text-sm">{props.label}</div>
      <StatusBadge tone={props.state}>{props.state}</StatusBadge>
    </div>
  );
}

function AiAdvisoryItem(props: {
  advisory: AiAdvisoryArtifact;
  disabled: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const canDecide = props.advisory.status === "suggested";

  return (
    <div className="rounded-lg bg-[var(--color-panel-subtle)] p-3">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge tone={statusTone(props.advisory.status)}>{props.advisory.status}</StatusBadge>
        <span className="qitu-number text-xs text-[var(--color-text-muted)]">
          {formatTime(props.advisory.createdAt)}
        </span>
      </div>
      <div className="mt-3 text-sm leading-5">{props.advisory.summary}</div>
      <div className="qitu-number mt-2 text-xs text-[var(--color-text-muted)]">
        {props.advisory.provider}/{props.advisory.model}
      </div>
      {canDecide ? (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button disabled={props.disabled} size="sm" variant="ghost" onClick={props.onDismiss}>
            <X size={14} /> Dismiss
          </Button>
          <Button disabled={props.disabled} size="sm" variant="secondary" onClick={props.onConfirm}>
            <Check size={14} /> Confirm
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AuditItem(props: { event: AuditEvent }) {
  return (
    <div className="rounded-lg bg-[var(--color-panel-subtle)] p-3">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge tone={statusTone(props.event.action)}>{props.event.action}</StatusBadge>
        <span className="qitu-number text-xs text-[var(--color-text-muted)]">
          {formatTime(props.event.occurredAt)}
        </span>
      </div>
      <div className="mt-3 text-sm font-medium">
        {props.event.subject.kind}:{props.event.subject.id}
      </div>
      <div className="mt-1 text-xs text-[var(--color-text-muted)]">
        {props.event.actor.kind}:{props.event.actor.id}
      </div>
    </div>
  );
}

function issueForRecord(record: StagedRecord, issues: ReviewIssue[]): ReviewIssue | null {
  return issues.find((issue) => issue.stagedRecordKey === record.stagedRecordKey) ?? null;
}

function payloadSummary(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return "";
  }

  if (typeof payload !== "object") {
    return JSON.stringify(payload) ?? "";
  }

  const entries = Object.entries(payload)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.join(", ");
}

function formatBytes(value: number | null): string {
  if (value === null) {
    return "unknown";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  return `${(value / 1024).toFixed(1)} KB`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusTone(status: string): StatusBadgeTone {
  if (
    status === "approved" ||
    status === "committed" ||
    status === "confirmed" ||
    status === "done" ||
    status.includes("succeeded")
  ) {
    return "active";
  }

  if (
    status === "pending" ||
    status === "needs_review" ||
    status === "queued" ||
    status === "processing" ||
    status === "suggested"
  ) {
    return "warning";
  }

  if (
    status === "rejected" ||
    status === "dismissed" ||
    status === "failed" ||
    status.includes("failed")
  ) {
    return "danger";
  }

  return "neutral";
}
