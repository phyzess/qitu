import { useMemo, type ReactNode, type RefObject } from "react";
import { BarChart, TimeSeriesChart, type CategoryDatum, type ChartDatum } from "@qitu/charts";
import {
  AppShell,
  Button,
  DataState,
  MetricStrip,
  SectionHeader,
  StatusBadge,
  Surface,
  Timeline,
  type AppShellNavItem,
  type MetricItem,
  type StatusBadgeTone,
  type TimelineItem,
} from "@qitu/ui";
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
import { ErrorText } from "./app-ui";
import type {
  AiAdvisoryArtifact,
  ApiUser,
  AuditEvent,
  ImportJobEvent,
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
  actions: ReactNode;
  aiAdvisories: AiAdvisoryArtifact[];
  auditEvents: AuditEvent[];
  canCommit: boolean;
  canRetry: boolean;
  counts: ReviewCounts;
  error: string | null;
  importJobEvents: ImportJobEvent[];
  importJobs: ImportJobListItem[];
  isBusy: boolean;
  navigation: AppShellNavItem[];
  notice: string;
  onCommitApproved: () => void;
  onConfirmAdvisory: (advisoryId: string) => void;
  onCommand: () => void;
  onDecide: (recordId: string, status: "approved" | "rejected") => void;
  onDismissAdvisory: (advisoryId: string) => void;
  onGenerateAdvisory: () => void;
  onProcessLocalQueue: () => void;
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
  subNavigation: AppShellNavItem[];
  uploadInputRef: RefObject<HTMLInputElement | null>;
  user: ApiUser;
}) {
  const jobBySourceId = useMemo(() => {
    return new Map(props.importJobs.map((job) => [job.sourceFileId, job]));
  }, [props.importJobs]);
  const metrics: MetricItem[] = useMemo(
    () => [
      { id: "pending", label: "Pending", value: props.counts.pending, tone: "warning" },
      { id: "approved", label: "Approved", value: props.counts.approved, tone: "positive" },
      { id: "rejected", label: "Rejected", value: props.counts.rejected, tone: "negative" },
      { id: "committed", label: "Committed", value: props.counts.committed },
    ],
    [props.counts],
  );
  const reviewBars: CategoryDatum[] = useMemo(
    () => [
      { label: "Pending", value: props.counts.pending, tone: "warning" },
      { label: "Approved", value: props.counts.approved, tone: "positive" },
      { label: "Rejected", value: props.counts.rejected, tone: "negative" },
      { label: "Committed", value: props.counts.committed, tone: "info" },
    ],
    [props.counts],
  );
  const auditTimeline: TimelineItem[] = useMemo(
    () =>
      props.auditEvents.map((event) => ({
        id: event.id,
        title: event.action,
        description: `${event.subject.kind}:${event.subject.id}`,
        time: formatTime(event.occurredAt),
        tone: timelineTone(event.action),
      })),
    [props.auditEvents],
  );
  const importTimeline: TimelineItem[] = useMemo(
    () =>
      props.importJobEvents.map((event) => ({
        id: event.id,
        title: event.eventType,
        description:
          event.message ??
          [event.statusFrom, event.statusTo].filter(Boolean).join(" -> ") ??
          "Import job event",
        time: formatTime(event.createdAt),
        tone: timelineTone(event.eventType),
      })),
    [props.importJobEvents],
  );

  return (
    <AppShell
      actions={props.actions}
      brand="qitu"
      commandLabel="Find source, job, or staged record"
      commandShortcutLabel="Cmd K"
      eyebrow={props.notice}
      navigation={props.navigation}
      subNavigation={props.subNavigation}
      onCommand={props.onCommand}
    >
      <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.7fr)_minmax(280px,0.85fr)]">
        <section className="space-y-[var(--qitu-layout-gutter)]">
          <Surface className="p-[var(--qitu-space-s1)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <StatusBadge tone="active">{props.user.email}</StatusBadge>
                <h1 className="mt-3 truncate text-[length:var(--qitu-text-heading-20)] font-semibold leading-[var(--qitu-leading-heading-20)]">
                  Review console
                </h1>
                <div className="mt-1 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-dim)]">
                  {props.notice}
                </div>
              </div>
              <LockKeyhole size={17} className="shrink-0 text-[var(--qitu-chroma-lime-ink)]" />
            </div>
            {props.error ? <ErrorText>{props.error}</ErrorText> : null}
            <MetricStrip className="mt-[var(--qitu-space-s1)]" items={metrics} />
            <div className="mt-[var(--qitu-space-s1)] grid gap-[var(--qitu-space-s0)]">
              <TimeSeriesChart data={props.reviewTrend} height={132} label="Review status trend" />
              <BarChart data={reviewBars} height={156} label="Review status distribution" />
            </div>
          </Surface>

          <Surface className="p-[var(--qitu-space-s1)]">
            <SectionHeader
              description="Authenticated source intake with content-hash idempotency."
              icon={<FileSpreadsheet size={16} />}
              title="Source files"
            />
            <div className="mt-[var(--qitu-space-s1)] space-y-3">
              <input ref={props.uploadInputRef} className="qitu-field-control" type="file" />
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
            <div className="mt-[var(--qitu-space-s1)]">
              <DataState
                description="Upload a sample or local file to create an import job."
                state={props.sourceFiles.length === 0 ? "empty" : "ready"}
                title="No source files"
              >
                <div className="space-y-2">
                  {props.sourceFiles.map((file) => (
                    <SourceFileItem
                      file={file}
                      job={jobBySourceId.get(file.id) ?? null}
                      key={file.id}
                    />
                  ))}
                </div>
              </DataState>
            </div>
          </Surface>

          <Surface className="p-[var(--qitu-space-s1)]">
            <SectionHeader
              action={
                props.runtimeEnvironment === "local" ? (
                  <Button
                    disabled={props.isBusy}
                    size="sm"
                    variant="ghost"
                    onClick={props.onProcessLocalQueue}
                  >
                    <RefreshCw size={14} /> Process local queue
                  </Button>
                ) : null
              }
              icon={<Activity size={16} />}
              title="Import jobs"
            />
            <div className="mt-[var(--qitu-space-s1)]">
              <DataState
                description="Queued imports will appear here after a source file is accepted."
                state={props.importJobs.length === 0 ? "empty" : "ready"}
                title="No import jobs"
              >
                <div className="space-y-2">
                  {props.importJobs.map((job) => (
                    <JobStep
                      active={job.id === props.selectedJobId}
                      job={job}
                      key={job.id}
                      onSelect={() => props.onSelectJob(job.id)}
                    />
                  ))}
                </div>
              </DataState>
            </div>
          </Surface>
        </section>

        <Surface className="min-h-[640px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-[var(--qitu-space-s1)] py-[var(--qitu-space-s0)]">
            <SectionHeader
              description={
                props.selectedJob ? props.selectedJob.sourceFile.filename : "No import job selected"
              }
              icon={<ListChecks size={16} />}
              title="Staged records"
            />
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

          <div className="overflow-x-auto px-3 pb-4">
            <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-y-2 text-left">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[24%]" />
                <col className="w-[28%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
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
                    <td colSpan={5}>
                      <DataState
                        description="Select or process an import job to review staged records."
                        state="empty"
                        title="No staged records"
                      />
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
        </Surface>

        <aside className="space-y-[var(--qitu-layout-gutter)]">
          <Surface as="aside" className="p-[var(--qitu-space-s1)]">
            <SectionHeader icon={<ShieldCheck size={16} />} title="Guardrails" />
            <div className="mt-[var(--qitu-space-s1)] space-y-2">
              <Guardrail label="Reviewer identity required" state="active" />
              <Guardrail label="Rejected rows cannot commit" state="active" />
              <Guardrail label="AI output stays advisory" state="active" />
              <Guardrail label="Audit event per decision" state="active" />
            </div>
          </Surface>

          <Surface as="aside" className="p-[var(--qitu-space-s1)]">
            <SectionHeader
              action={
                <Button
                  disabled={!props.selectedJobId || props.isBusy}
                  size="sm"
                  variant="ghost"
                  onClick={props.onGenerateAdvisory}
                >
                  <Sparkles size={14} /> Generate
                </Button>
              }
              icon={<Sparkles size={16} />}
              title="AI advisory"
            />
            <div className="mt-[var(--qitu-space-s1)]">
              <DataState
                description="Generate an advisory for the selected import job."
                state={props.aiAdvisories.length === 0 ? "empty" : "ready"}
                title="No advisory yet"
              >
                <div className="space-y-3">
                  {props.aiAdvisories.map((advisory) => (
                    <AiAdvisoryItem
                      advisory={advisory}
                      disabled={props.isBusy}
                      key={advisory.id}
                      onConfirm={() => props.onConfirmAdvisory(advisory.id)}
                      onDismiss={() => props.onDismissAdvisory(advisory.id)}
                    />
                  ))}
                </div>
              </DataState>
            </div>
          </Surface>

          <Surface as="aside" className="p-[var(--qitu-space-s1)]">
            <SectionHeader icon={<Activity size={16} />} title="Event stream" />
            <Timeline
              className="mt-[var(--qitu-space-s1)]"
              emptyLabel="Select or process an import job to populate the event stream."
              items={importTimeline}
            />
          </Surface>

          <Surface as="aside" className="p-[var(--qitu-space-s1)]">
            <SectionHeader icon={<ListChecks size={16} />} title="Audit timeline" />
            <Timeline className="mt-[var(--qitu-space-s1)]" items={auditTimeline} />
          </Surface>
        </aside>
      </div>
    </AppShell>
  );
}

function SourceFileItem(props: { file: SourceFile; job: ImportJobListItem | null }) {
  const status = props.job?.status ?? "stored";

  return (
    <div className="qitu-surface-subtle p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
            {props.file.filename}
          </div>
          <div className="qitu-number mt-1 text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
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
      className="qitu-panel-action w-full text-left"
      data-active={props.active ? "true" : undefined}
      onClick={props.onSelect}
      type="button"
    >
      <div className="qitu-icon-chip size-7">
        {props.job.status === "needs_review" ? <Clock3 size={14} /> : <Check size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.job.sourceFile.filename}
        </div>
        <div className="qitu-number text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          {formatTime(props.job.updatedAt)}
        </div>
      </div>
      <StatusBadge tone={statusTone(props.job.status)}>{props.job.status}</StatusBadge>
      <ArrowRight size={14} className="shrink-0 text-[var(--qitu-dim)]" />
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
      <td className="qitu-table-cell rounded-l-[var(--qitu-radius-md)] px-3 py-3 align-top">
        <div className="text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.record.sourceRowKey}
        </div>
        <div className="mt-1 max-w-[180px] truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          {props.record.stagedRecordKey}
        </div>
      </td>
      <td className="qitu-table-cell px-3 py-3 align-top">
        <div className="qitu-number max-w-[160px] truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)]">
          {payloadSummary(props.record.payload)}
        </div>
      </td>
      <td className="qitu-table-cell max-w-[190px] px-3 py-3 align-top">
        <div className="text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
          {props.issue?.message ?? "No issue"}
        </div>
      </td>
      <td className="qitu-table-cell px-3 py-3 align-top">
        <StatusBadge tone={statusTone(props.record.reviewStatus)}>
          {props.record.reviewStatus}
        </StatusBadge>
      </td>
      <td className="qitu-table-cell rounded-r-[var(--qitu-radius-md)] px-3 py-3 text-right align-top">
        <div className="flex justify-end gap-2">
          <Button
            aria-label="Reject record"
            className="size-8 px-0"
            disabled={disabled}
            size="sm"
            title="Reject record"
            variant="ghost"
            onClick={props.onReject}
          >
            <X size={14} />
          </Button>
          <Button
            aria-label="Approve record"
            className="size-8 px-0"
            disabled={disabled}
            size="sm"
            title="Approve record"
            variant="secondary"
            onClick={props.onApprove}
          >
            <Check size={14} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function Guardrail(props: { label: string; state: "active" }) {
  return (
    <div className="qitu-surface-subtle flex items-center justify-between gap-3 px-3 py-2">
      <div className="text-[length:var(--qitu-text-label-13)] leading-[var(--qitu-leading-label-13)]">
        {props.label}
      </div>
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
    <div className="qitu-surface-subtle p-3">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge tone={statusTone(props.advisory.status)}>{props.advisory.status}</StatusBadge>
        <span className="qitu-number text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          {formatTime(props.advisory.createdAt)}
        </span>
      </div>
      <div className="mt-3 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)]">
        {props.advisory.summary}
      </div>
      <div className="qitu-number mt-2 text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
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

function timelineTone(action: string): TimelineItem["tone"] {
  if (action.includes("failed") || action.includes("denied")) return "error";
  if (action.includes("queued") || action.includes("requested")) return "warning";
  if (action.includes("succeeded") || action.includes("committed")) return "success";
  if (action.includes("advisory")) return "info";
  return "neutral";
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
