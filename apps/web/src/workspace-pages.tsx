import { useEffect, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import {
  AnimatedIcon,
  BatchActionBar,
  Button,
  Checkbox,
  DataState,
  DataToolbar,
  DateField,
  DetailDrawer,
  FilterBar,
  Input,
  ListActionRow,
  ListFrame,
  MetricStrip,
  SectionHeader,
  StatusBadge,
  Surface,
  Timeline,
  UploadQueue,
  type MetricItem,
  type StatusBadgeTone,
  type TimelineItem,
  type UploadQueueItem,
} from "@qitu/ui";
import { ArrowRight, Check, Clock3, FileUp, Send, Trash2, X } from "lucide-react";
import type { AuditFilters } from "./audit-filters";
import { routePath, type AppNavigationPath } from "./app-routes";
import { ErrorText, Field, RuntimeRow, SelectField } from "./app-ui";
import { useI18n, type Translate } from "./i18n";
import type {
  ApiUser,
  AuditEvent,
  ImportJobEvent,
  ImportJobListItem,
  InvitationSummary,
  SourceFile,
  UploadQueueEntry,
} from "./types";

type WorkspaceReviewCounts = {
  approvedForCommit: number;
  failed: number;
  reviewQueue: number;
};

export type WorkspaceHomeProps = {
  importJobs: ImportJobListItem[];
  onNavigate: (path: AppNavigationPath) => void;
  sourceFiles: SourceFile[];
  workspaceReviewCounts: WorkspaceReviewCounts;
};

type InvitationForm = {
  email: string;
  role: string;
};

export function OverviewPage(props: WorkspaceHomeProps) {
  const { formatDateTime, t } = useI18n();
  const metrics: MetricItem[] = [
    {
      id: "sources",
      label: t("overview.metricSourceFiles"),
      value: props.sourceFiles.length,
      meta: latestTime(
        props.sourceFiles.map((file) => file.uploadedAt),
        formatDateTime,
        t,
      ),
    },
    {
      id: "imports",
      label: t("overview.metricImportJobs"),
      value: props.importJobs.length,
      meta: latestTime(
        props.importJobs.map((job) => job.updatedAt),
        formatDateTime,
        t,
      ),
    },
    {
      id: "pending",
      label: t("overview.metricReviewQueue"),
      value: props.workspaceReviewCounts.reviewQueue,
      tone: props.workspaceReviewCounts.reviewQueue > 0 ? "warning" : "neutral",
      meta:
        props.workspaceReviewCounts.approvedForCommit > 0
          ? t("overview.metricApprovedForCommit", {
              count: props.workspaceReviewCounts.approvedForCommit,
            })
          : undefined,
    },
  ];

  return (
    <div className="space-y-[var(--qitu-layout-gutter)]">
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          description={t("overview.description")}
          icon={<AnimatedIcon name="workbench" size={16} />}
          title={t("overview.title")}
        />
      </Surface>

      <Surface className="p-[var(--qitu-space-s1)]">
        <MetricStrip items={metrics} />
      </Surface>

      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          icon={<AnimatedIcon name="reviews" size={16} />}
          title={t("overview.workflowTitle")}
        />
        <div className="mt-[var(--qitu-space-s1)] grid gap-3 md:grid-cols-3">
          <WorkflowTarget
            description={t("overview.workflowSourcesDescription")}
            icon={<AnimatedIcon name="files" size={16} />}
            label={t("nav.sources")}
            onClick={() => props.onNavigate(routePath("sources"))}
            status={t("overview.workflowSourcesStatus", { count: props.sourceFiles.length })}
          />
          <WorkflowTarget
            description={t("overview.workflowImportsDescription")}
            icon={<AnimatedIcon name="database" size={16} />}
            label={t("nav.imports")}
            onClick={() => props.onNavigate(routePath("imports"))}
            status={t("overview.workflowImportsStatus", { count: props.importJobs.length })}
          />
          <WorkflowTarget
            description={t("overview.workflowReviewsDescription")}
            icon={<AnimatedIcon name="reviews" size={16} />}
            label={t("nav.reviews")}
            onClick={() => props.onNavigate(routePath("reviews"))}
            status={t("overview.workflowReviewsStatus", {
              count: props.workspaceReviewCounts.reviewQueue,
            })}
          />
        </div>
      </Surface>
    </div>
  );
}

export function SourcesPage(props: {
  canCommitImports: boolean;
  canDecideReviews: boolean;
  canUploadSources: boolean;
  importJobs: ImportJobListItem[];
  isBusy: boolean;
  onCommitSourceJobs: (jobIds: string[]) => void;
  onConfirmSourceJobs: (jobIds: string[]) => void;
  onRemoveUploadItem: (itemId: string) => void;
  onRetryUploadItem: (itemId: string) => void;
  onUploadFilesSelected: (files: FileList | null) => void;
  onUploadSample: () => void;
  onUploadSelected: () => void;
  sourceFiles: SourceFile[];
  uploadQueue: UploadQueueEntry[];
  uploadInputRef: RefObject<HTMLInputElement | null>;
}) {
  const { formatBytes, formatStatus, t } = useI18n();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const jobsBySourceId = new Map<string, ImportJobListItem[]>();
  for (const job of props.importJobs) {
    const jobs = jobsBySourceId.get(job.sourceFileId) ?? [];
    jobs.push(job);
    jobsBySourceId.set(job.sourceFileId, jobs);
  }
  const sourceIds = new Set(props.sourceFiles.map((source) => source.id));
  const selectedSourceIdSet = new Set(selectedSourceIds.filter((id) => sourceIds.has(id)));
  const selectedPendingJobIds = jobIdsForSources(
    props.importJobs,
    selectedSourceIdSet,
    "needs_review",
  );
  const allPendingJobIds = props.importJobs
    .filter((job) => job.status === "needs_review")
    .map((job) => job.id);
  const selectedConfirmedJobIds = jobIdsForSources(
    props.importJobs,
    selectedSourceIdSet,
    "approved",
  );
  const allConfirmedJobIds = props.importJobs
    .filter((job) => job.status === "approved")
    .map((job) => job.id);
  const selectedCount = selectedSourceIdSet.size;
  const selectedSource =
    props.sourceFiles.find((source) => source.id === selectedSourceId) ??
    props.sourceFiles[0] ??
    null;
  const selectedSourceJobs = selectedSource ? (jobsBySourceId.get(selectedSource.id) ?? []) : [];
  const compactUpload = props.sourceFiles.length > 0 && props.uploadQueue.length === 0;

  useEffect(() => {
    setSelectedSourceIds((current) => current.filter((sourceId) => sourceIds.has(sourceId)));
  }, [props.sourceFiles]);

  function toggleSourceSelection(sourceId: string, selected: boolean) {
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(sourceId);
      } else {
        next.delete(sourceId);
      }
      return [...next];
    });
  }

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          description={t("sources.description")}
          icon={<AnimatedIcon name="files" size={16} />}
          title={t("sources.title")}
        />
        <div className="mt-[var(--qitu-space-s1)] grid gap-3">
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
            <BatchActionBar
              actions={[
                {
                  disabled:
                    props.isBusy ||
                    !props.canDecideReviews ||
                    selectedCount === 0 ||
                    selectedPendingJobIds.length === 0,
                  icon: <Check size={14} />,
                  id: "confirm-selected",
                  label: t("action.confirmSelectedSources"),
                  onSelect: () => props.onConfirmSourceJobs(selectedPendingJobIds),
                },
                {
                  disabled:
                    props.isBusy || !props.canDecideReviews || allPendingJobIds.length === 0,
                  icon: <Check size={14} />,
                  id: "confirm-all",
                  label: t("action.confirmAllPendingSources"),
                  onSelect: () => props.onConfirmSourceJobs(allPendingJobIds),
                  variant: "ghost",
                },
                {
                  disabled:
                    props.isBusy ||
                    !props.canCommitImports ||
                    selectedCount === 0 ||
                    selectedConfirmedJobIds.length === 0,
                  icon: <AnimatedIcon name="database" size={14} />,
                  id: "commit-selected",
                  label: t("action.commitSelectedSources"),
                  onSelect: () => props.onCommitSourceJobs(selectedConfirmedJobIds),
                },
                {
                  disabled:
                    props.isBusy || !props.canCommitImports || allConfirmedJobIds.length === 0,
                  icon: <AnimatedIcon name="database" size={14} />,
                  id: "commit-all",
                  label: t("action.commitAllConfirmedSources"),
                  onSelect: () => props.onCommitSourceJobs(allConfirmedJobIds),
                  variant: "ghost",
                },
              ]}
              clearLabel={t("action.clearSelection")}
              selectedCount={selectedCount}
              summary={t("sources.batchSummary", {
                confirmed: String(allConfirmedJobIds.length),
                pending: String(allPendingJobIds.length),
                selected: String(selectedCount),
              })}
              onClear={() => setSelectedSourceIds([])}
            />
            {props.sourceFiles.map((file) => (
              <SourceFileRow
                file={file}
                jobs={jobsBySourceId.get(file.id) ?? []}
                key={file.id}
                selected={selectedSourceIdSet.has(file.id)}
                onOpenDetails={() => setSelectedSourceId(file.id)}
                onSelectedChange={(selected) => toggleSourceSelection(file.id, selected)}
              />
            ))}
          </ListFrame>
        </div>
      </Surface>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          icon={<AnimatedIcon name="audit" size={16} />}
          title={t("review.guardrails")}
        />
        <div className="mt-[var(--qitu-space-s1)] space-y-2">
          <Guardrail label={t("guardrail.loginRequired")} />
          <Guardrail label={t("guardrail.contentHash")} />
          <Guardrail label={t("guardrail.duplicateUpload")} />
          <Guardrail label={t("guardrail.importQueued")} />
        </div>
      </Surface>
      <DetailDrawer
        open={Boolean(selectedSourceId)}
        onOpenChange={(open) => !open && setSelectedSourceId(null)}
        closeAction={
          <Button
            aria-label={t("action.closeDetails")}
            className="size-8 px-0"
            size="sm"
            title={t("action.closeDetails")}
            variant="ghost"
            onClick={() => setSelectedSourceId(null)}
          >
            <X size={14} />
          </Button>
        }
        description={t("sources.detailsDescription")}
        title={selectedSource?.filename ?? ""}
      >
        {selectedSource ? (
          <SourceDetailsDrawer file={selectedSource} jobs={selectedSourceJobs} />
        ) : null}
      </DetailDrawer>
    </div>
  );
}

export function ImportsPage(props: {
  canProcessImports: boolean;
  canRetry: boolean;
  importJobEvents: ImportJobEvent[];
  importJobs: ImportJobListItem[];
  isBusy: boolean;
  retryAvailable: boolean;
  onOpenReview: (jobId: string) => void;
  onProcessLocalQueue: () => void;
  onRetrySelectedJob: () => void;
  onSelectJob: (jobId: string) => void;
  runtimeEnvironment: string;
  selectedJob: ImportJobListItem | null;
  selectedJobId: string | null;
  sourceFiles: SourceFile[];
}) {
  const { formatDateTime, formatStatus, formatTime, t } = useI18n();
  const selectedJob =
    props.selectedJob ??
    props.importJobs.find((job) => job.id === props.selectedJobId) ??
    props.importJobs[0] ??
    null;
  const selectedSource = selectedJob
    ? (props.sourceFiles.find((source) => source.id === selectedJob.sourceFileId) ?? null)
    : null;
  const importTimeline = props.importJobEvents.map((event) =>
    importJobTimelineItem(event, formatStatus, formatTime, t),
  );
  const recoveryGuidance = selectedJob ? importRecoveryGuidance(selectedJob, t) : null;

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          action={
            <div className="flex flex-wrap gap-2">
              {props.runtimeEnvironment === "local" ? (
                <Button
                  disabled={props.isBusy || !props.canProcessImports}
                  size="sm"
                  variant="ghost"
                  onClick={props.onProcessLocalQueue}
                >
                  <AnimatedIcon name="refresh" size={14} /> {t("action.processLocalQueue")}
                </Button>
              ) : null}
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
            </div>
          }
          icon={<AnimatedIcon name="database" size={16} />}
          title={t("imports.title")}
        />
        <div className="mt-[var(--qitu-space-s1)]">
          <ListFrame
            description={t("imports.emptyDescription")}
            state={props.importJobs.length === 0 ? "empty" : "ready"}
            title={t("imports.emptyTitle")}
          >
            {props.importJobs.map((job) => (
              <ImportJobRow
                active={job.id === props.selectedJobId}
                job={job}
                key={job.id}
                onOpenReview={() => props.onOpenReview(job.id)}
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

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          icon={<AnimatedIcon name="activity" size={16} />}
          title={t("imports.diagnostics")}
        />
        {selectedJob ? (
          <div className="mt-[var(--qitu-space-s1)] space-y-4">
            <div className="space-y-3">
              <RuntimeRow label={t("common.environment")} value={props.runtimeEnvironment} />
              <RuntimeRow label={t("imports.status")} value={formatStatus(selectedJob.status)} />
              <RuntimeRow label={t("imports.source")} value={selectedJob.sourceFile.filename} />
              <RuntimeRow
                label={t("imports.adapter")}
                value={selectedJob.adapterId ?? selectedJob.jobKind ?? t("common.none")}
              />
              <RuntimeRow label={t("imports.attempts")} value={String(selectedJob.attemptCount)} />
              <RuntimeRow
                label={t("imports.failureClass")}
                value={selectedJob.failureClass ?? t("common.none")}
              />
              <RuntimeRow
                label={t("imports.failureReason")}
                value={selectedJob.failureReason ?? t("common.none")}
              />
              <RuntimeRow
                label={t("imports.started")}
                value={
                  selectedJob.processingStartedAt
                    ? formatDateTime(selectedJob.processingStartedAt)
                    : t("common.none")
                }
              />
              <RuntimeRow
                label={t("imports.completed")}
                value={
                  selectedJob.completedAt
                    ? formatDateTime(selectedJob.completedAt)
                    : t("common.none")
                }
              />
              <RuntimeRow
                label={t("imports.contentHash")}
                value={selectedSource?.contentHash ?? t("common.none")}
              />
            </div>
            {recoveryGuidance ? (
              <div className="qitu-surface-subtle p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
                      {t("imports.recoveryPath")}
                    </div>
                    <div className="mt-1 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
                      {recoveryGuidance.description}
                    </div>
                  </div>
                  <StatusBadge tone={recoveryGuidance.tone}>{recoveryGuidance.label}</StatusBadge>
                </div>
                {selectedJob.status === "failed" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      disabled={props.isBusy || !props.canRetry}
                      size="sm"
                      variant="secondary"
                      onClick={props.onRetrySelectedJob}
                    >
                      <AnimatedIcon name="refresh" size={14} /> {t("action.retryJob")}
                    </Button>
                    {!props.canRetry ? (
                      <span className="text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
                        {t("permission.importRetry")}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <SectionHeader
                icon={<AnimatedIcon name="activity" size={16} />}
                title={t("imports.eventStream")}
              />
              <Timeline
                className="mt-[var(--qitu-space-s1)]"
                emptyLabel={t("empty.noEventsDescription")}
                emptyTitle={t("empty.noEvents")}
                items={importTimeline}
              />
            </div>
          </div>
        ) : (
          <DataState
            className="mt-[var(--qitu-space-s1)]"
            description={t("imports.selectJobDescription")}
            state="empty"
            title={t("imports.noSelectedJob")}
          />
        )}
      </Surface>
    </div>
  );
}

export function AuditPage(props: {
  auditEvents: AuditEvent[];
  filters: AuditFilters;
  isBusy: boolean;
  selectedEventId: string | null;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  onFiltersChange: (filters: AuditFilters) => void;
  onSelectEvent: (eventId: string) => void;
}) {
  const { formatDateTime, formatTime, localeMeta, t } = useI18n();
  const selectedEvent =
    props.auditEvents.find((event) => event.id === props.selectedEventId) ??
    props.auditEvents[0] ??
    null;

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onApplyFilters();
  }

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-[var(--qitu-layout-gutter)]">
        <Surface className="p-[var(--qitu-space-s1)]">
          <SectionHeader
            description={t("audit.description")}
            icon={<AnimatedIcon name="audit" size={16} />}
            title={t("audit.title")}
          />
          <FilterBar
            className="mt-[var(--qitu-space-s1)]"
            onSubmit={submitFilters}
            actions={
              <>
                <Button disabled={props.isBusy} size="sm" type="submit">
                  <AnimatedIcon name="search" size={14} /> {t("action.applyFilters")}
                </Button>
                <Button
                  disabled={props.isBusy}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={props.onClearFilters}
                >
                  <X size={14} /> {t("action.clearFilters")}
                </Button>
              </>
            }
          >
            <Field
              label={t("audit.filterAction")}
              onChange={(action) => props.onFiltersChange({ ...props.filters, action })}
              value={props.filters.action}
            />
            <Field
              label={t("audit.filterActor")}
              onChange={(actorId) => props.onFiltersChange({ ...props.filters, actorId })}
              value={props.filters.actorId}
            />
            <Field
              label={t("audit.filterSubjectKind")}
              onChange={(subjectKind) =>
                props.onFiltersChange({
                  ...props.filters,
                  subjectKind,
                })
              }
              value={props.filters.subjectKind}
            />
            <Field
              label={t("audit.filterSubjectId")}
              onChange={(subjectId) => props.onFiltersChange({ ...props.filters, subjectId })}
              value={props.filters.subjectId}
            />
            <DateField
              label={t("audit.filterOccurredAfter")}
              labels={{
                nextMonth: t("calendar.nextMonth"),
                previousMonth: t("calendar.previousMonth"),
              }}
              locale={localeMeta.intlLocale}
              placeholder={t("audit.filterDatePlaceholder")}
              value={props.filters.occurredAfter}
              onChange={(occurredAfter) =>
                props.onFiltersChange({ ...props.filters, occurredAfter })
              }
            />
            <DateField
              label={t("audit.filterOccurredBefore")}
              labels={{
                nextMonth: t("calendar.nextMonth"),
                previousMonth: t("calendar.previousMonth"),
              }}
              locale={localeMeta.intlLocale}
              placeholder={t("audit.filterDatePlaceholder")}
              value={props.filters.occurredBefore}
              onChange={(occurredBefore) =>
                props.onFiltersChange({ ...props.filters, occurredBefore })
              }
            />
          </FilterBar>
        </Surface>

        <Surface className="p-[var(--qitu-space-s1)]">
          <DataToolbar
            meta={t("audit.resultCount", { count: String(props.auditEvents.length) })}
            actions={
              <StatusBadge tone={props.auditEvents.length > 0 ? "info" : "neutral"}>
                {props.auditEvents.length > 0 ? t("status.ready") : t("status.empty")}
              </StatusBadge>
            }
          >
            <SectionHeader
              icon={<AnimatedIcon name="activity" size={16} />}
              title={t("audit.results")}
            />
          </DataToolbar>
          <div className="mt-[var(--qitu-space-s1)]">
            <DataState
              description={t("audit.empty")}
              state={props.auditEvents.length === 0 ? "empty" : "ready"}
              title={t("empty.noEvents")}
            >
              <div className="space-y-2">
                {props.auditEvents.map((event) => (
                  <AuditEventRow
                    active={event.id === selectedEvent?.id}
                    event={event}
                    formatTime={formatTime}
                    key={event.id}
                    onSelect={() => props.onSelectEvent(event.id)}
                  />
                ))}
              </div>
            </DataState>
          </div>
        </Surface>
      </section>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          icon={<AnimatedIcon name="audit" size={16} />}
          title={t("audit.eventDetails")}
        />
        {selectedEvent ? (
          <div className="mt-[var(--qitu-space-s1)] space-y-3">
            <RuntimeRow label={t("audit.eventId")} value={selectedEvent.id} />
            <RuntimeRow label={t("audit.action")} value={selectedEvent.action} />
            <RuntimeRow label={t("audit.actor")} value={actorLabel(selectedEvent)} />
            <RuntimeRow label={t("audit.subject")} value={subjectLabel(selectedEvent)} />
            <RuntimeRow
              label={t("audit.occurredAt")}
              value={formatDateTime(selectedEvent.occurredAt)}
            />
            <div className="qitu-surface-subtle p-3">
              <div className="text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
                {t("audit.metadata")}
              </div>
              <pre className="qitu-number mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-muted)]">
                {formatMetadata(selectedEvent.metadata)}
              </pre>
            </div>
          </div>
        ) : (
          <DataState
            className="mt-[var(--qitu-space-s1)]"
            description={t("audit.selectEventDescription")}
            state="empty"
            title={t("audit.noSelectedEvent")}
          />
        )}
      </Surface>
    </div>
  );
}

export function AccountPage(props: {
  notice: string;
  onLogout: () => void;
  runtimeEnvironment: string;
  user: ApiUser;
}) {
  const { formatDateTime, roleLabel, t } = useI18n();

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader icon={<AnimatedIcon name="key" size={16} />} title={t("account.title")} />
        <div className="mt-[var(--qitu-space-s1)] grid gap-3 md:grid-cols-2">
          <RuntimeRow label={t("account.email")} value={props.user.email} />
          <RuntimeRow
            label={t("account.displayName")}
            value={props.user.displayName ?? t("common.none")}
          />
          <RuntimeRow label={t("account.role")} value={roleLabel(props.user.role)} />
          <RuntimeRow label={t("account.created")} value={formatDateTime(props.user.createdAt)} />
        </div>
        <div className="mt-[var(--qitu-space-s1)] flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onLogout}>
            <X size={15} /> {t("action.logout")}
          </Button>
        </div>
      </Surface>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          icon={<AnimatedIcon name="activity" size={16} />}
          title={t("account.session")}
        />
        <div className="mt-[var(--qitu-space-s1)] space-y-3">
          <RuntimeRow label={t("account.runtime")} value={props.runtimeEnvironment} />
          <RuntimeRow label={t("account.status")} value={props.notice} />
          <RuntimeRow label={t("account.cookie")} value={t("account.cookieHttpOnly")} />
        </div>
      </Surface>
    </div>
  );
}

function AuditEventRow(props: {
  active: boolean;
  event: AuditEvent;
  formatTime: (value: string) => string;
  onSelect: () => void;
}) {
  return (
    <ListActionRow
      className={["p-3", props.active ? "qitu-row-card-active" : ""].join(" ")}
      onClick={props.onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
            {props.event.action}
          </div>
          <div className="mt-1 truncate text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
            {subjectLabel(props.event)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge tone={auditStatusTone(props.event.action)}>
            {props.event.actor.kind}
          </StatusBadge>
          <span className="qitu-number text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
            {props.formatTime(props.event.occurredAt)}
          </span>
        </div>
      </div>
    </ListActionRow>
  );
}

export function UsersPage(props: {
  adminError: string | null;
  canManageUsers: boolean;
  createdInvitationUrl: string | null;
  invitationForm: InvitationForm;
  invitations: InvitationSummary[];
  isBusy: boolean;
  isLoading: boolean;
  onCreateInvitation: () => void;
  onDeleteInvitation: (invitationId: string) => void;
  onDeleteUser: (userId: string) => void;
  onInvitationFormChange: (form: InvitationForm) => void;
  onRefreshUsers: () => void;
  onResendInvitation: (invitationId: string) => void;
  onRevokeInvitation: (invitationId: string) => void;
  user: ApiUser;
  users: ApiUser[];
}) {
  const { t } = useI18n();
  const roleOptions = [
    { label: t("role.viewer"), value: "viewer" },
    { label: t("role.reviewer"), value: "reviewer" },
    { label: t("role.admin"), value: "admin" },
    { label: t("role.owner"), value: "owner" },
  ];

  if (!props.canManageUsers) {
    return (
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader icon={<AnimatedIcon name="users" size={16} />} title={t("users.title")} />
        <div className="mt-[var(--qitu-space-s1)]">
          <DataState
            description={t("error.adminOnlyDescription")}
            state="error"
            title={t("error.adminOnlyTitle")}
          />
        </div>
      </Surface>
    );
  }

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-[var(--qitu-layout-gutter)]">
        <Surface className="p-[var(--qitu-space-s1)]">
          <SectionHeader
            action={
              <Button
                disabled={props.isBusy}
                size="sm"
                variant="ghost"
                onClick={props.onRefreshUsers}
              >
                <AnimatedIcon name="refresh" size={14} /> {t("action.refresh")}
              </Button>
            }
            icon={<AnimatedIcon name="users" size={16} />}
            title={t("users.title")}
          />
          {props.adminError ? <ErrorText>{props.adminError}</ErrorText> : null}
          <div className="mt-[var(--qitu-space-s1)]">
            <DataState
              description={
                props.isLoading ? t("users.loadingDescription") : t("users.acceptedDescription")
              }
              state={props.isLoading ? "loading" : props.users.length === 0 ? "empty" : "ready"}
              title={props.isLoading ? t("users.loadingTitle") : t("users.emptyTitle")}
            >
              <div className="space-y-2">
                {props.users.map((user) => (
                  <UserRow
                    currentUserId={props.user.id}
                    isBusy={props.isBusy}
                    key={user.id}
                    user={user}
                    onDelete={props.onDeleteUser}
                  />
                ))}
              </div>
            </DataState>
          </div>
        </Surface>

        <Surface className="p-[var(--qitu-space-s1)]">
          <SectionHeader
            icon={<AnimatedIcon name="audit" size={16} />}
            title={t("invitation.title")}
          />
          <div className="mt-[var(--qitu-space-s1)]">
            <DataState
              description={
                props.isLoading
                  ? t("invitation.loadingDescription")
                  : t("invitation.pendingDescription")
              }
              state={
                props.isLoading ? "loading" : props.invitations.length === 0 ? "empty" : "ready"
              }
              title={props.isLoading ? t("invitation.loadingTitle") : t("invitation.emptyTitle")}
            >
              <div className="space-y-2">
                {props.invitations.map((invitation) => (
                  <InvitationRow
                    invitation={invitation}
                    isBusy={props.isBusy}
                    key={invitation.id}
                    onDelete={props.onDeleteInvitation}
                    onResend={props.onResendInvitation}
                    onRevoke={props.onRevokeInvitation}
                  />
                ))}
              </div>
            </DataState>
          </div>
        </Surface>
      </section>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          icon={<AnimatedIcon name="key" size={16} />}
          title={t("invitation.createTitle")}
        />
        <div className="mt-[var(--qitu-space-s1)] space-y-4">
          <Field
            label={t("field.email")}
            onChange={(email) =>
              props.onInvitationFormChange({
                ...props.invitationForm,
                email,
              })
            }
            type="email"
            value={props.invitationForm.email}
          />
          <SelectField
            label={t("field.role")}
            onChange={(role) =>
              props.onInvitationFormChange({
                ...props.invitationForm,
                role,
              })
            }
            options={roleOptions}
            value={props.invitationForm.role}
          />
          <Button disabled={props.isBusy} onClick={props.onCreateInvitation}>
            <AnimatedIcon name="key" size={15} /> {t("action.createInvitation")}
          </Button>
          {props.createdInvitationUrl ? (
            <a
              className="block break-all text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-brand-accent-ink)]"
              href={props.createdInvitationUrl}
            >
              {props.createdInvitationUrl}
            </a>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}

function WorkflowTarget(props: {
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  status: string;
}) {
  return (
    <ListActionRow onClick={props.onClick} type="button" variant="card">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[var(--qitu-brand-accent)]">{props.icon}</span>
        <StatusBadge tone="neutral">{props.status}</StatusBadge>
      </div>
      <div className="mt-4 text-[length:var(--qitu-text-heading-16)] font-semibold leading-[var(--qitu-leading-heading-16)]">
        {props.label}
      </div>
      <div className="mt-2 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
        {props.description}
      </div>
    </ListActionRow>
  );
}

function SourceFileRow(props: {
  file: SourceFile;
  jobs: ImportJobListItem[];
  onOpenDetails: () => void;
  onSelectedChange: (selected: boolean) => void;
  selected: boolean;
}) {
  const { formatBytes, formatDateTime, formatStatus, t } = useI18n();
  const latestJob = props.jobs[0] ?? null;
  const status = latestJob?.status ?? "stored";

  return (
    <div className="qitu-surface-subtle flex flex-wrap items-start gap-3 p-3">
      <Checkbox
        aria-label={t("sources.selectSource", { filename: props.file.filename })}
        checked={props.selected}
        onCheckedChange={(checked) => props.onSelectedChange(checked === true)}
      />
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
            {props.file.filename}
          </div>
          <div className="qitu-number mt-1 text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
            {formatBytes(props.file.size)} · {formatDateTime(props.file.uploadedAt)}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
          <StatusBadge tone="neutral">
            {t("sources.jobCount", { count: String(props.jobs.length) })}
          </StatusBadge>
          <span>
            {latestJob ? t("sources.latestJob", { id: latestJob.id }) : t("sources.noImportJob")}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <StatusBadge tone={statusTone(status)}>{formatStatus(status)}</StatusBadge>
        <Button size="sm" variant="ghost" onClick={props.onOpenDetails}>
          {t("action.viewDetails")}
        </Button>
      </div>
    </div>
  );
}

function SourceDetailsDrawer(props: { file: SourceFile; jobs: ImportJobListItem[] }) {
  const { formatBytes, formatDateTime, formatStatus, t } = useI18n();

  return (
    <div>
      <div className="mt-[var(--qitu-space-s1)] grid gap-2">
        <RuntimeRow label={t("sources.uploadedAt")} value={formatDateTime(props.file.uploadedAt)} />
        <RuntimeRow label={t("sources.fileSize")} value={formatBytes(props.file.size)} />
        <RuntimeRow label={t("sources.contentTypeLabel")} value={props.file.contentType} />
        <RuntimeRow
          label={t("sources.contentHashLabel")}
          value={props.file.contentHash ?? t("common.none")}
        />
        <RuntimeRow label={t("sources.objectKey")} value={props.file.objectKey} />
      </div>

      <div className="mt-[var(--qitu-space-s1)]">
        <SectionHeader title={t("sources.importJobs")} />
        <div className="mt-3 grid gap-2">
          {props.jobs.length === 0 ? (
            <DataState
              description={t("sources.noImportJob")}
              state="empty"
              title={t("sources.noImportJobsTitle")}
            />
          ) : (
            props.jobs.map((job) => (
              <div className="qitu-surface-subtle p-3" key={job.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="qitu-number truncate text-[length:var(--qitu-text-label-13)] font-medium leading-[var(--qitu-leading-label-13)]">
                      {job.id}
                    </div>
                    <div className="qitu-number mt-1 text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
                      {formatDateTime(job.updatedAt)}
                    </div>
                  </div>
                  <StatusBadge tone={statusTone(job.status)}>
                    {formatStatus(job.status)}
                  </StatusBadge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
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

function jobIdsForSources(
  jobs: ImportJobListItem[],
  sourceIds: Set<string>,
  status: string,
): string[] {
  if (sourceIds.size === 0) return [];
  return jobs
    .filter((job) => sourceIds.has(job.sourceFileId) && job.status === status)
    .map((job) => job.id);
}

function ImportJobRow(props: {
  active: boolean;
  job: ImportJobListItem;
  onOpenReview: () => void;
  onSelect: () => void;
}) {
  const { formatDateTime, formatStatus, t } = useI18n();

  return (
    <div
      className={[
        "qitu-surface-subtle flex flex-wrap items-center gap-3 p-3",
        props.active ? "qitu-row-card-active" : "",
      ].join(" ")}
    >
      <ListActionRow
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={props.onSelect}
        type="button"
        variant="inline"
      >
        <div className="qitu-icon-chip size-8">
          {props.job.status === "needs_review" ? <Clock3 size={14} /> : <Check size={14} />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
            {props.job.sourceFile.filename}
          </div>
          <div className="qitu-number text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
            {formatDateTime(props.job.updatedAt)}
          </div>
        </div>
      </ListActionRow>
      <StatusBadge tone={statusTone(props.job.status)}>
        {formatStatus(props.job.status)}
      </StatusBadge>
      <Button size="sm" variant="ghost" onClick={props.onOpenReview}>
        <ArrowRight size={14} /> {t("nav.reviews")}
      </Button>
    </div>
  );
}

function UserRow(props: {
  currentUserId: string;
  isBusy: boolean;
  onDelete: (userId: string) => void;
  user: ApiUser;
}) {
  const { formatDateTime, roleLabel, t } = useI18n();
  const canDelete = props.user.id !== props.currentUserId;

  return (
    <div className="qitu-surface-subtle flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.user.email}
        </div>
        <div className="text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
          {props.user.displayName ?? t("user.noDisplayName")}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone="active">{roleLabel(props.user.role)}</StatusBadge>
        <span className="qitu-number text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          {formatDateTime(props.user.createdAt)}
        </span>
        <Button
          aria-label={t("action.deleteMemberFor", {
            email: props.user.email,
          })}
          disabled={props.isBusy || !canDelete}
          size="sm"
          variant="ghost"
          onClick={() => props.onDelete(props.user.id)}
        >
          <Trash2 size={14} /> {t("action.delete")}
        </Button>
      </div>
    </div>
  );
}

function InvitationRow(props: {
  invitation: InvitationSummary;
  isBusy: boolean;
  onDelete: (invitationId: string) => void;
  onResend: (invitationId: string) => void;
  onRevoke: (invitationId: string) => void;
}) {
  const { formatDateTime, formatStatus, roleLabel, t } = useI18n();
  const canRevoke = props.invitation.status === "pending";
  const canResend = props.invitation.status === "pending" || props.invitation.status === "expired";
  const canDelete = props.invitation.status === "revoked";

  return (
    <div className="qitu-surface-subtle flex flex-wrap items-start justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.invitation.email}
        </div>
        <div className="mt-1 grid gap-1 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
          <span className="qitu-number">
            {t("invitation.created", { value: formatDateTime(props.invitation.createdAt) })}
          </span>
          <span className="qitu-number">
            {t("invitation.expires", { value: formatDateTime(props.invitation.expiresAt) })}
          </span>
          {props.invitation.acceptedAt ? (
            <span className="qitu-number">
              {t("invitation.accepted", {
                value: formatDateTime(props.invitation.acceptedAt),
              })}
            </span>
          ) : null}
          {props.invitation.revokedAt ? (
            <span className="qitu-number">
              {t("invitation.revoked", {
                value: formatDateTime(props.invitation.revokedAt),
              })}
            </span>
          ) : null}
          {props.invitation.latestEmailStatus ? (
            <span>
              {t("invitation.latestEmail", {
                status: formatStatus(props.invitation.latestEmailStatus),
              })}
            </span>
          ) : null}
          {props.invitation.latestEmailStatus === "failed" &&
          props.invitation.latestEmailErrorMessage ? (
            <span className="text-[var(--qitu-color-destructive)]">
              {t("invitation.emailError", {
                message: props.invitation.latestEmailErrorMessage,
              })}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <StatusBadge tone={statusTone(props.invitation.status)}>
          {formatStatus(props.invitation.status)}
        </StatusBadge>
        <StatusBadge tone="neutral">{roleLabel(props.invitation.role)}</StatusBadge>
        {props.invitation.latestEmailStatus ? (
          <StatusBadge tone={statusTone(props.invitation.latestEmailStatus)}>
            {formatStatus(props.invitation.latestEmailStatus)}
          </StatusBadge>
        ) : null}
        {canResend ? (
          <Button
            aria-label={t("action.resendInvitationFor", {
              email: props.invitation.email,
            })}
            disabled={props.isBusy}
            size="sm"
            variant="ghost"
            onClick={() => props.onResend(props.invitation.id)}
          >
            <Send size={14} /> {t("action.resend")}
          </Button>
        ) : null}
        {canRevoke ? (
          <Button
            aria-label={t("action.revokeInvitationFor", {
              email: props.invitation.email,
            })}
            disabled={props.isBusy}
            size="sm"
            variant="ghost"
            onClick={() => props.onRevoke(props.invitation.id)}
          >
            <X size={14} /> {t("action.revoke")}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            aria-label={t("action.deleteInvitationFor", {
              email: props.invitation.email,
            })}
            disabled={props.isBusy}
            size="sm"
            variant="ghost"
            onClick={() => props.onDelete(props.invitation.id)}
          >
            <Trash2 size={14} /> {t("action.delete")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Guardrail(props: { label: string }) {
  const { formatStatus } = useI18n();

  return (
    <div className="qitu-surface-subtle flex items-center justify-between gap-3 px-3 py-2">
      <div className="text-[length:var(--qitu-text-label-13)] leading-[var(--qitu-leading-label-13)]">
        {props.label}
      </div>
      <StatusBadge tone="active">{formatStatus("active")}</StatusBadge>
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

function importJobTimelineItem(
  event: ImportJobEvent,
  formatStatus: (value: string) => string,
  formatTime: (value: string) => string,
  t: Translate,
): TimelineItem {
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
}

function importRecoveryGuidance(
  job: ImportJobListItem,
  t: Translate,
): { description: string; label: string; tone: StatusBadgeTone } | null {
  if (job.status === "failed") {
    const failureClass = job.failureClass ?? "unknown";
    const keyByFailureClass: Record<string, Parameters<Translate>[0]> = {
      adapter_missing: "imports.recoveryAdapterMissing",
      processing: "imports.recoveryProcessing",
      queue_dispatch: "imports.recoveryQueueDispatch",
      source_missing: "imports.recoverySourceMissing",
      validation: "imports.recoveryValidation",
    };

    return {
      description: t(keyByFailureClass[failureClass] ?? "imports.recoveryUnknown"),
      label: t("imports.retryCandidate"),
      tone:
        failureClass === "queue_dispatch" || failureClass === "source_missing"
          ? "danger"
          : "warning",
    };
  }

  if (job.status === "queued" || job.status === "processing") {
    return {
      description: t("imports.recoveryWaitForProcessing"),
      label: t("imports.inProgress"),
      tone: "warning",
    };
  }

  if (job.status === "needs_review") {
    return {
      description: t("imports.recoveryNeedsReview"),
      label: t("imports.humanReview"),
      tone: "info",
    };
  }

  return null;
}

function actorLabel(event: AuditEvent): string {
  return `${event.actor.kind}:${event.actor.id}`;
}

function subjectLabel(event: AuditEvent): string {
  return `${event.subject.kind}:${event.subject.id}`;
}

function formatMetadata(metadata: unknown): string {
  if (metadata === null || metadata === undefined) {
    return "{}";
  }

  return JSON.stringify(metadata, null, 2);
}

function auditStatusTone(action: string): StatusBadgeTone {
  if (action.includes("failed") || action.includes("denied")) return "danger";
  if (action.includes("queued") || action.includes("requested")) return "warning";
  if (action.includes("succeeded") || action.includes("committed")) return "success";
  if (action.includes("advisory")) return "info";
  return "neutral";
}

function latestTime(
  values: string[],
  formatDateTime: (value: string) => string,
  t: Translate,
): string | undefined {
  const latest = values
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  return latest
    ? t("common.latest", { value: formatDateTime(new Date(latest).toISOString()) })
    : undefined;
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
    status === "accepted" ||
    status === "approved" ||
    status === "committed" ||
    status === "confirmed" ||
    status === "done" ||
    status === "sent" ||
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
    status === "expired" ||
    status === "rejected" ||
    status === "revoked" ||
    status === "dismissed" ||
    status === "failed" ||
    status.includes("failed")
  ) {
    return "danger";
  }

  return "neutral";
}
