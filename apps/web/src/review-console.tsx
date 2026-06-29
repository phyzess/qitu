import { useMemo, type ReactNode, type RefObject } from "react";
import { BarChart, TimeSeriesChart, type CategoryDatum, type ChartDatum } from "@qitu/charts";
import {
  AnimatedIcon,
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
import { ArrowRight, Check, Clock3, FileUp, X } from "lucide-react";
import { ErrorText } from "./app-ui";
import { useI18n } from "./i18n";
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
  canDecideReviews: boolean;
  canCommit: boolean;
  canProcessImports: boolean;
  canRetry: boolean;
  canUploadSources: boolean;
  canWriteAiAdvisories: boolean;
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
  retryAvailable: boolean;
  selectedJob: ImportJobListItem | null;
  selectedJobId: string | null;
  sourceFiles: SourceFile[];
  subNavigation: AppShellNavItem[];
  uploadInputRef: RefObject<HTMLInputElement | null>;
  user: ApiUser;
}) {
  const { formatStatus, formatTime, t } = useI18n();
  const jobBySourceId = useMemo(() => {
    return new Map(props.importJobs.map((job) => [job.sourceFileId, job]));
  }, [props.importJobs]);
  const metrics: MetricItem[] = useMemo(
    () => [
      {
        id: "pending",
        label: formatStatus("pending"),
        value: props.counts.pending,
        tone: "warning",
      },
      {
        id: "approved",
        label: formatStatus("approved"),
        value: props.counts.approved,
        tone: "positive",
      },
      {
        id: "rejected",
        label: formatStatus("rejected"),
        value: props.counts.rejected,
        tone: "negative",
      },
      { id: "committed", label: formatStatus("committed"), value: props.counts.committed },
    ],
    [formatStatus, props.counts],
  );
  const reviewBars: CategoryDatum[] = useMemo(
    () => [
      { label: formatStatus("pending"), value: props.counts.pending, tone: "warning" },
      { label: formatStatus("approved"), value: props.counts.approved, tone: "positive" },
      { label: formatStatus("rejected"), value: props.counts.rejected, tone: "negative" },
      { label: formatStatus("committed"), value: props.counts.committed, tone: "info" },
    ],
    [formatStatus, props.counts],
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
    [formatTime, props.auditEvents],
  );
  const importTimeline: TimelineItem[] = useMemo(
    () =>
      props.importJobEvents.map((event) => {
        const transition = [event.statusFrom, event.statusTo]
          .filter((status): status is string => Boolean(status))
          .map(formatStatus)
          .join(" -> ");

        return {
          id: event.id,
          title: event.eventType,
          description: event.message ?? (transition || t("imports.eventFallback")),
          time: formatTime(event.createdAt),
          tone: timelineTone(event.eventType),
        };
      }),
    [formatStatus, formatTime, props.importJobEvents, t],
  );

  return (
    <AppShell
      actions={props.actions}
      brand="qitu"
      commandLabel={t("command.findSourceJobRecord")}
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
                  {t("review.consoleTitle")}
                </h1>
                <div className="mt-1 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-dim)]">
                  {props.notice}
                </div>
              </div>
              <AnimatedIcon
                className="shrink-0 text-[var(--qitu-chroma-lime-ink)]"
                name="key"
                size={17}
              />
            </div>
            {props.error ? <ErrorText>{props.error}</ErrorText> : null}
            <MetricStrip className="mt-[var(--qitu-space-s1)]" items={metrics} />
            <div className="mt-[var(--qitu-space-s1)] grid gap-[var(--qitu-space-s0)]">
              <TimeSeriesChart
                data={props.reviewTrend}
                height={132}
                label={t("review.chartTrend")}
              />
              <BarChart data={reviewBars} height={156} label={t("review.chartDistribution")} />
            </div>
          </Surface>

          <Surface className="p-[var(--qitu-space-s1)]">
            <SectionHeader
              description={t("sources.description")}
              icon={<AnimatedIcon name="files" size={16} />}
              title={t("sources.title")}
            />
            <div className="mt-[var(--qitu-space-s1)] space-y-3">
              <input ref={props.uploadInputRef} className="qitu-field-control" type="file" />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={props.isBusy || !props.canUploadSources}
                  size="sm"
                  variant="secondary"
                  onClick={props.onUploadSelected}
                >
                  <FileUp size={14} /> {t("action.uploadSelected")}
                </Button>
                <Button
                  disabled={props.isBusy || !props.canUploadSources}
                  size="sm"
                  variant="ghost"
                  onClick={props.onUploadSample}
                >
                  <FileUp size={14} /> {t("action.uploadSample")}
                </Button>
              </div>
            </div>
            {!props.canUploadSources ? (
              <div className="mt-3">
                <PermissionHint label={t("permission.sourceUpload")} />
              </div>
            ) : null}
            <div className="mt-[var(--qitu-space-s1)]">
              <DataState
                description={t("sources.emptyDescription")}
                state={props.sourceFiles.length === 0 ? "empty" : "ready"}
                title={t("sources.emptyTitle")}
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
                    disabled={props.isBusy || !props.canProcessImports}
                    size="sm"
                    variant="ghost"
                    onClick={props.onProcessLocalQueue}
                  >
                    <AnimatedIcon name="refresh" size={14} /> {t("action.processLocalQueue")}
                  </Button>
                ) : null
              }
              icon={<AnimatedIcon name="activity" size={16} />}
              title={t("imports.title")}
            />
            <div className="mt-[var(--qitu-space-s1)]">
              <DataState
                description={t("imports.emptyDescription")}
                state={props.importJobs.length === 0 ? "empty" : "ready"}
                title={t("imports.emptyTitle")}
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
              {!props.canProcessImports ? (
                <div className="mt-3">
                  <PermissionHint label={t("permission.importProcess")} />
                </div>
              ) : null}
            </div>
          </Surface>
        </section>

        <Surface className="min-h-[640px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-[var(--qitu-space-s1)] py-[var(--qitu-space-s0)]">
            <SectionHeader
              description={
                props.selectedJob
                  ? props.selectedJob.sourceFile.filename
                  : t("review.noJobSelected")
              }
              icon={<AnimatedIcon name="reviews" size={16} />}
              title={t("review.stagedRecords")}
            />
            <div className="flex flex-wrap gap-2">
              {props.retryAvailable ? (
                <Button
                  disabled={props.isBusy || !props.canRetry}
                  size="sm"
                  variant="secondary"
                  onClick={props.onRetrySelectedJob}
                >
                  <AnimatedIcon name="refresh" size={14} /> {t("action.retryJob")}
                </Button>
              ) : null}
              <Button
                disabled={!props.canCommit || props.isBusy}
                size="sm"
                onClick={props.onCommitApproved}
              >
                <AnimatedIcon name="database" size={14} /> {t("action.commitApproved")}
              </Button>
            </div>
          </div>
          {!props.canCommit && props.selectedJobId && props.counts.approved > 0 ? (
            <div className="px-[var(--qitu-space-s1)] pb-[var(--qitu-space-s0)]">
              <PermissionHint label={t("permission.importCommit")} />
            </div>
          ) : null}
          {!props.canDecideReviews && props.reviewRecords.length > 0 ? (
            <div className="px-[var(--qitu-space-s1)] pb-[var(--qitu-space-s0)]">
              <PermissionHint label={t("permission.reviewDecide")} />
            </div>
          ) : null}

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
                  <th className="px-3 py-2 font-medium">{t("review.record")}</th>
                  <th className="px-3 py-2 font-medium">{t("review.payload")}</th>
                  <th className="px-3 py-2 font-medium">{t("review.issue")}</th>
                  <th className="px-3 py-2 font-medium">{t("review.status")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("review.decision")}</th>
                </tr>
              </thead>
              <tbody>
                {props.reviewRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <DataState
                        description={t("review.emptyStagedDescription")}
                        state="empty"
                        title={t("review.emptyStagedTitle")}
                      />
                    </td>
                  </tr>
                ) : (
                  props.reviewRecords.map((record) => (
                    <ReviewRow
                      canDecide={props.canDecideReviews}
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
            <SectionHeader
              icon={<AnimatedIcon name="audit" size={16} />}
              title={t("review.guardrails")}
            />
            <div className="mt-[var(--qitu-space-s1)] space-y-2">
              <Guardrail label={t("guardrail.reviewerIdentity")} state="active" />
              <Guardrail label={t("guardrail.rejectedRows")} state="active" />
              <Guardrail label={t("guardrail.aiAdvisory")} state="active" />
              <Guardrail label={t("guardrail.auditDecision")} state="active" />
            </div>
          </Surface>

          <Surface as="aside" className="p-[var(--qitu-space-s1)]">
            <SectionHeader
              action={
                <Button
                  disabled={!props.selectedJobId || props.isBusy || !props.canWriteAiAdvisories}
                  size="sm"
                  variant="ghost"
                  onClick={props.onGenerateAdvisory}
                >
                  <AnimatedIcon name="sparkles" size={14} /> {t("action.generate")}
                </Button>
              }
              icon={<AnimatedIcon name="sparkles" size={16} />}
              title={t("advisory.title")}
            />
            <div className="mt-[var(--qitu-space-s1)]">
              <DataState
                description={t("advisory.description")}
                state={props.aiAdvisories.length === 0 ? "empty" : "ready"}
                title={t("advisory.emptyTitle")}
              >
                <div className="space-y-3">
                  {props.aiAdvisories.map((advisory) => (
                    <AiAdvisoryItem
                      advisory={advisory}
                      disabled={props.isBusy || !props.canWriteAiAdvisories}
                      key={advisory.id}
                      onConfirm={() => props.onConfirmAdvisory(advisory.id)}
                      onDismiss={() => props.onDismissAdvisory(advisory.id)}
                    />
                  ))}
                </div>
              </DataState>
              {!props.canWriteAiAdvisories ? (
                <div className="mt-3">
                  <PermissionHint label={t("permission.aiAdvisory")} />
                </div>
              ) : null}
            </div>
          </Surface>

          <Surface as="aside" className="p-[var(--qitu-space-s1)]">
            <SectionHeader
              icon={<AnimatedIcon name="activity" size={16} />}
              title={t("review.eventStream")}
            />
            <Timeline
              className="mt-[var(--qitu-space-s1)]"
              emptyLabel={t("review.eventEmpty")}
              emptyTitle={t("empty.noEvents")}
              items={importTimeline}
            />
          </Surface>

          <Surface as="aside" className="p-[var(--qitu-space-s1)]">
            <SectionHeader
              icon={<AnimatedIcon name="reviews" size={16} />}
              title={t("audit.title")}
            />
            <Timeline
              className="mt-[var(--qitu-space-s1)]"
              emptyLabel={t("audit.empty")}
              emptyTitle={t("empty.noEvents")}
              items={auditTimeline}
            />
          </Surface>
        </aside>
      </div>
    </AppShell>
  );
}

function SourceFileItem(props: { file: SourceFile; job: ImportJobListItem | null }) {
  const { formatBytes, formatStatus } = useI18n();
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
        <StatusBadge tone={statusTone(status)}>{formatStatus(status)}</StatusBadge>
      </div>
    </div>
  );
}

function JobStep(props: { active: boolean; job: ImportJobListItem; onSelect: () => void }) {
  const { formatStatus, formatTime } = useI18n();

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
      <StatusBadge tone={statusTone(props.job.status)}>
        {formatStatus(props.job.status)}
      </StatusBadge>
      <ArrowRight size={14} className="shrink-0 text-[var(--qitu-dim)]" />
    </button>
  );
}

function ReviewRow(props: {
  canDecide: boolean;
  issue: ReviewIssue | null;
  record: StagedRecord;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { formatStatus, t } = useI18n();
  const disabled = props.record.reviewStatus === "committed" || !props.canDecide;

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
          {props.issue?.message ?? t("review.noIssue")}
        </div>
      </td>
      <td className="qitu-table-cell px-3 py-3 align-top">
        <StatusBadge tone={statusTone(props.record.reviewStatus)}>
          {formatStatus(props.record.reviewStatus)}
        </StatusBadge>
      </td>
      <td className="qitu-table-cell rounded-r-[var(--qitu-radius-md)] px-3 py-3 text-right align-top">
        <div className="flex justify-end gap-2">
          <Button
            aria-label={t("action.rejectRecord")}
            className="size-8 px-0"
            disabled={disabled}
            size="sm"
            title={t("action.rejectRecord")}
            variant="ghost"
            onClick={props.onReject}
          >
            <X size={14} />
          </Button>
          <Button
            aria-label={t("action.approveRecord")}
            className="size-8 px-0"
            disabled={disabled}
            size="sm"
            title={t("action.approveRecord")}
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
  const { formatStatus } = useI18n();

  return (
    <div className="qitu-surface-subtle flex items-center justify-between gap-3 px-3 py-2">
      <div className="text-[length:var(--qitu-text-label-13)] leading-[var(--qitu-leading-label-13)]">
        {props.label}
      </div>
      <StatusBadge tone={props.state}>{formatStatus(props.state)}</StatusBadge>
    </div>
  );
}

function PermissionHint(props: { label: string }) {
  const { t } = useI18n();

  return (
    <div className="qitu-surface-subtle flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <div className="text-[length:var(--qitu-text-label-13)] leading-[var(--qitu-leading-label-13)] text-[var(--qitu-muted)]">
        {props.label}
      </div>
      <StatusBadge tone="neutral">{t("permission.readOnly")}</StatusBadge>
    </div>
  );
}

function AiAdvisoryItem(props: {
  advisory: AiAdvisoryArtifact;
  disabled: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const { formatStatus, formatTime, t } = useI18n();
  const canDecide = props.advisory.status === "suggested";

  return (
    <div className="qitu-surface-subtle p-3">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge tone={statusTone(props.advisory.status)}>
          {formatStatus(props.advisory.status)}
        </StatusBadge>
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
            <X size={14} /> {t("action.dismiss")}
          </Button>
          <Button disabled={props.disabled} size="sm" variant="secondary" onClick={props.onConfirm}>
            <Check size={14} /> {t("action.confirm")}
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

function timelineTone(action: string): TimelineItem["tone"] {
  if (action.includes("failed") || action.includes("denied")) return "error";
  if (action.includes("queued") || action.includes("requested")) return "warning";
  if (action.includes("succeeded") || action.includes("committed")) return "success";
  if (action.includes("advisory")) return "info";
  return "neutral";
}

function statusTone(status: string): StatusBadgeTone {
  if (status === "active") {
    return "active";
  }

  if (
    status === "approved" ||
    status === "committed" ||
    status === "confirmed" ||
    status === "done" ||
    status.includes("succeeded")
  ) {
    return "success";
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
