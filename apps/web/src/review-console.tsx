import { useMemo, type ReactNode, type RefObject } from "react";
import { BarChart, TimeSeriesChart, type CategoryDatum, type ChartDatum } from "@qitu/charts";
import {
  AnimatedIcon,
  AppShell,
  Button,
  DataState,
  Input,
  PanelActionButton,
  ListFrame,
  MetricStrip,
  SectionHeader,
  StatusBadge,
  Surface,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Timeline,
  UploadQueue,
  type AppShellNavItem,
  type MetricItem,
  type StatusBadgeTone,
  type TimelineItem,
  type UploadQueueItem,
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
  UploadQueueEntry,
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
  onConfirmPendingRecords: () => void;
  onConfirmAdvisory: (advisoryId: string) => void;
  onCommand: () => void;
  onDecide: (recordId: string, status: "approved" | "rejected") => void;
  onDismissAdvisory: (advisoryId: string) => void;
  onGenerateAdvisory: () => void;
  onProcessLocalQueue: () => void;
  onRemoveUploadItem: (itemId: string) => void;
  onRetrySelectedJob: () => void;
  onRetryUploadItem: (itemId: string) => void;
  onSelectJob: (jobId: string) => void;
  onUploadFilesSelected: (files: FileList | null) => void;
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
  uploadQueue: UploadQueueEntry[];
  uploadInputRef: RefObject<HTMLInputElement | null>;
  user: ApiUser;
}) {
  const { formatBytes, formatStatus, formatTime, t } = useI18n();
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
  const compactUpload = props.sourceFiles.length > 0 && props.uploadQueue.length === 0;

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
              <Input
                className="hidden"
                disabled={!props.canUploadSources}
                multiple
                ref={props.uploadInputRef}
                type="file"
                onChange={(event) => props.onUploadFilesSelected(event.currentTarget.files)}
              />
              <UploadQueue
                compact={compactUpload}
                compactAction={
                  compactUpload ? (
                    <>
                      <Button
                        disabled={props.isBusy || !props.canUploadSources}
                        size="sm"
                        type="button"
                        variant="secondary"
                        onClick={() => props.uploadInputRef.current?.click()}
                      >
                        <FileUp size={14} /> {t("action.chooseFiles")}
                      </Button>
                      <Button
                        disabled={props.isBusy || !props.canUploadSources}
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={props.onUploadSample}
                      >
                        <FileUp size={14} /> {t("action.uploadSample")}
                      </Button>
                    </>
                  ) : null
                }
                compactDescription={t("sources.compactUploadDescription")}
                compactTitle={t("sources.compactUploadTitle")}
                emptyDescription={t("sources.uploadQueueEmptyDescription")}
                emptyTitle={t("sources.uploadQueueEmptyTitle")}
                items={uploadQueueItems(props.uploadQueue, formatBytes)}
                labels={{
                  remove: t("action.removeUpload"),
                  retry: t("action.retryUpload"),
                }}
                statusLabel={formatStatus}
                onFilesDrop={props.canUploadSources ? props.onUploadFilesSelected : undefined}
                onRemove={props.onRemoveUploadItem}
                onRetry={props.onRetryUploadItem}
              />
              <div className={compactUpload ? "hidden" : "flex flex-wrap gap-2"}>
                <Button
                  disabled={props.isBusy || !props.canUploadSources}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => props.uploadInputRef.current?.click()}
                >
                  <FileUp size={14} /> {t("action.chooseFiles")}
                </Button>
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
              <ListFrame
                description={t("sources.emptyDescription")}
                state={props.sourceFiles.length === 0 ? "empty" : "ready"}
                title={t("sources.emptyTitle")}
              >
                {props.sourceFiles.map((file) => (
                  <SourceFileItem
                    file={file}
                    job={jobBySourceId.get(file.id) ?? null}
                    key={file.id}
                  />
                ))}
              </ListFrame>
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
              <ListFrame
                description={t("imports.emptyDescription")}
                state={props.importJobs.length === 0 ? "empty" : "ready"}
                title={t("imports.emptyTitle")}
              >
                {props.importJobs.map((job) => (
                  <JobStep
                    active={job.id === props.selectedJobId}
                    job={job}
                    key={job.id}
                    onSelect={() => props.onSelectJob(job.id)}
                  />
                ))}
              </ListFrame>
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
              <Button
                disabled={!props.canDecideReviews || props.counts.pending === 0 || props.isBusy}
                size="sm"
                variant="secondary"
                onClick={props.onConfirmPendingRecords}
              >
                <Check size={14} /> {t("action.confirmPending")}
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
            <Table>
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[24%]" />
                <col className="w-[28%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
              </colgroup>
              <TableHeader>
                <TableRow className="text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
                  <TableHead>{t("review.record")}</TableHead>
                  <TableHead>{t("review.payload")}</TableHead>
                  <TableHead>{t("review.issue")}</TableHead>
                  <TableHead>{t("review.status")}</TableHead>
                  <TableHead className="text-right">{t("review.decision")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.reviewRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <DataState
                        description={t("review.emptyStagedDescription")}
                        state="empty"
                        title={t("review.emptyStagedTitle")}
                      />
                    </TableCell>
                  </TableRow>
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
              </TableBody>
            </Table>
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
    <PanelActionButton
      className="w-full"
      data-active={props.active ? "true" : undefined}
      description={formatTime(props.job.updatedAt)}
      icon={props.job.status === "needs_review" ? <Clock3 size={14} /> : <Check size={14} />}
      label={props.job.sourceFile.filename}
      onClick={props.onSelect}
      type="button"
      trailing={
        <>
          <StatusBadge tone={statusTone(props.job.status)}>
            {formatStatus(props.job.status)}
          </StatusBadge>
          <ArrowRight size={14} className="shrink-0 text-[var(--qitu-dim)]" />
        </>
      }
    ></PanelActionButton>
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
    <TableRow>
      <TableCell edge="start">
        <div className="text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.record.sourceRowKey}
        </div>
        <div className="mt-1 max-w-[180px] truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          {props.record.stagedRecordKey}
        </div>
      </TableCell>
      <TableCell>
        <div className="qitu-number max-w-[160px] truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)]">
          {payloadSummary(props.record.payload)}
        </div>
      </TableCell>
      <TableCell className="max-w-[190px]">
        <div className="text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
          {props.issue?.message ?? t("review.noIssue")}
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge tone={statusTone(props.record.reviewStatus)}>
          {formatStatus(props.record.reviewStatus)}
        </StatusBadge>
      </TableCell>
      <TableCell className="text-right" edge="end">
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
      </TableCell>
    </TableRow>
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

function uploadQueueItems(
  queue: UploadQueueEntry[],
  formatBytes: (value: number | null) => string,
): UploadQueueItem[] {
  return queue.map((item) => ({
    error: item.error,
    id: item.id,
    meta: formatBytes(item.file.size),
    name: item.file.name,
    status: item.status,
  }));
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
