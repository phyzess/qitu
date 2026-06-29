import { type ReactNode, type RefObject } from "react";
import {
  AnimatedIcon,
  Button,
  DataState,
  MetricStrip,
  SectionHeader,
  StatusBadge,
  Surface,
  Timeline,
  type MetricItem,
  type StatusBadgeTone,
  type TimelineItem,
} from "@qitu/ui";
import { ArrowRight, Check, Clock3, FileUp, X } from "lucide-react";
import { ErrorText, Field, RuntimeRow, SelectField } from "./app-ui";
import { useI18n, type Translate } from "./i18n";
import type {
  ApiUser,
  AuditEvent,
  ImportJobListItem,
  InvitationSummary,
  SourceFile,
} from "./types";

type ReviewCounts = {
  pending: number;
  approved: number;
  rejected: number;
  committed: number;
};

type InvitationForm = {
  email: string;
  role: string;
};

export function OverviewPage(props: {
  auditEvents: AuditEvent[];
  counts: ReviewCounts;
  importJobs: ImportJobListItem[];
  onNavigate: (path: string) => void;
  sourceFiles: SourceFile[];
}) {
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
      label: t("overview.metricPendingReview"),
      value: props.counts.pending,
      tone: props.counts.pending > 0 ? "warning" : "neutral",
    },
    {
      id: "audit",
      label: t("overview.metricAuditEvents"),
      value: props.auditEvents.length,
    },
  ];

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-[var(--qitu-layout-gutter)]">
        <Surface className="p-[var(--qitu-space-s1)]">
          <SectionHeader
            description={t("overview.description")}
            icon={<AnimatedIcon name="activity" size={16} />}
            title={t("overview.title")}
          />
          <MetricStrip className="mt-[var(--qitu-space-s1)]" items={metrics} />
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
              onClick={() => props.onNavigate("/sources")}
              status={t("overview.workflowSourcesStatus", { count: props.sourceFiles.length })}
            />
            <WorkflowTarget
              description={t("overview.workflowImportsDescription")}
              icon={<AnimatedIcon name="database" size={16} />}
              label={t("nav.imports")}
              onClick={() => props.onNavigate("/imports")}
              status={t("overview.workflowImportsStatus", { count: props.importJobs.length })}
            />
            <WorkflowTarget
              description={t("overview.workflowReviewsDescription")}
              icon={<AnimatedIcon name="reviews" size={16} />}
              label={t("nav.reviews")}
              onClick={() => props.onNavigate("/reviews")}
              status={t("overview.workflowReviewsStatus", { count: props.counts.pending })}
            />
          </div>
        </Surface>
      </section>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader icon={<AnimatedIcon name="audit" size={16} />} title={t("audit.recent")} />
        <Timeline
          className="mt-[var(--qitu-space-s1)]"
          emptyLabel={t("audit.empty")}
          emptyTitle={t("empty.noEvents")}
          items={props.auditEvents
            .slice(0, 8)
            .map((event) => auditTimelineItem(event, formatDateTime))}
        />
      </Surface>
    </div>
  );
}

export function SourcesPage(props: {
  importJobs: ImportJobListItem[];
  isBusy: boolean;
  onUploadSample: () => void;
  onUploadSelected: () => void;
  sourceFiles: SourceFile[];
  uploadInputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  const jobBySourceId = new Map(props.importJobs.map((job) => [job.sourceFileId, job]));

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          description={t("sources.description")}
          icon={<AnimatedIcon name="files" size={16} />}
          title={t("sources.title")}
        />
        <div className="mt-[var(--qitu-space-s1)] grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input ref={props.uploadInputRef} className="qitu-field-control" type="file" />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={props.isBusy}
              size="sm"
              variant="secondary"
              onClick={props.onUploadSelected}
            >
              <FileUp size={14} /> {t("action.uploadSelected")}
            </Button>
            <Button
              disabled={props.isBusy}
              size="sm"
              variant="ghost"
              onClick={props.onUploadSample}
            >
              <FileUp size={14} /> {t("action.uploadSample")}
            </Button>
          </div>
        </div>
        <div className="mt-[var(--qitu-space-s1)]">
          <DataState
            description={t("sources.emptyDescription")}
            state={props.sourceFiles.length === 0 ? "empty" : "ready"}
            title={t("sources.emptyTitle")}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {props.sourceFiles.map((file) => (
                <SourceFileRow file={file} job={jobBySourceId.get(file.id) ?? null} key={file.id} />
              ))}
            </div>
          </DataState>
        </div>
      </Surface>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          icon={<AnimatedIcon name="audit" size={16} />}
          title={t("intake.guardrails")}
        />
        <div className="mt-[var(--qitu-space-s1)] space-y-2">
          <Guardrail label={t("guardrail.loginRequired")} />
          <Guardrail label={t("guardrail.contentHash")} />
          <Guardrail label={t("guardrail.duplicateUpload")} />
          <Guardrail label={t("guardrail.importQueued")} />
        </div>
      </Surface>
    </div>
  );
}

export function ImportsPage(props: {
  canRetry: boolean;
  importJobs: ImportJobListItem[];
  isBusy: boolean;
  onNavigate: (path: string) => void;
  onProcessLocalQueue: () => void;
  onRetrySelectedJob: () => void;
  onSelectJob: (jobId: string) => void;
  runtimeEnvironment: string;
  selectedJobId: string | null;
}) {
  const { t } = useI18n();

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          action={
            <div className="flex flex-wrap gap-2">
              {props.runtimeEnvironment === "local" ? (
                <Button
                  disabled={props.isBusy}
                  size="sm"
                  variant="ghost"
                  onClick={props.onProcessLocalQueue}
                >
                  <AnimatedIcon name="refresh" size={14} /> {t("action.processLocalQueue")}
                </Button>
              ) : null}
              {props.canRetry ? (
                <Button
                  disabled={props.isBusy}
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
          <DataState
            description={t("imports.emptyDescription")}
            state={props.importJobs.length === 0 ? "empty" : "ready"}
            title={t("imports.emptyTitle")}
          >
            <div className="space-y-2">
              {props.importJobs.map((job) => (
                <ImportJobRow
                  active={job.id === props.selectedJobId}
                  job={job}
                  key={job.id}
                  onOpenReview={() => props.onNavigate("/reviews")}
                  onSelect={() => props.onSelectJob(job.id)}
                />
              ))}
            </div>
          </DataState>
        </div>
      </Surface>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          icon={<AnimatedIcon name="activity" size={16} />}
          title={t("common.runtime")}
        />
        <div className="mt-[var(--qitu-space-s1)] space-y-3">
          <RuntimeRow label={t("common.worker")} value="/api" />
          <RuntimeRow label={t("common.environment")} value={props.runtimeEnvironment} />
          <RuntimeRow
            label={t("imports.runtimeSelectedJob")}
            value={props.selectedJobId ?? t("common.none")}
          />
        </div>
      </Surface>
    </div>
  );
}

export function AuditPage(props: { auditEvents: AuditEvent[] }) {
  const { formatTime, t } = useI18n();

  return (
    <Surface className="p-[var(--qitu-space-s1)]">
      <SectionHeader
        description={t("audit.description")}
        icon={<AnimatedIcon name="audit" size={16} />}
        title={t("audit.title")}
      />
      <Timeline
        className="mt-[var(--qitu-space-s1)]"
        emptyLabel={t("audit.empty")}
        emptyTitle={t("empty.noEvents")}
        items={props.auditEvents.map((event) => auditTimelineItem(event, formatTime))}
      />
    </Surface>
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

export function UsersPage(props: {
  adminError: string | null;
  createdInvitationUrl: string | null;
  invitationForm: InvitationForm;
  invitations: InvitationSummary[];
  isBusy: boolean;
  onCreateInvitation: () => void;
  onInvitationFormChange: (form: InvitationForm) => void;
  onRefreshUsers: () => void;
  user: ApiUser;
  users: ApiUser[];
}) {
  const { t } = useI18n();
  const canManage = canManageUsers(props.user);
  const roleOptions = [
    { label: t("role.viewer"), value: "viewer" },
    { label: t("role.reviewer"), value: "reviewer" },
    { label: t("role.admin"), value: "admin" },
    { label: t("role.owner"), value: "owner" },
  ];

  if (!canManage) {
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
              description={t("users.acceptedDescription")}
              state={props.users.length === 0 ? "empty" : "ready"}
              title={t("users.emptyTitle")}
            >
              <div className="space-y-2">
                {props.users.map((user) => (
                  <UserRow key={user.id} user={user} />
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
              description={t("invitation.pendingDescription")}
              state={props.invitations.length === 0 ? "empty" : "ready"}
              title={t("invitation.emptyTitle")}
            >
              <div className="space-y-2">
                {props.invitations.map((invitation) => (
                  <InvitationRow invitation={invitation} key={invitation.id} />
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
    <button
      className="qitu-surface-subtle min-h-36 p-[var(--qitu-space-o5)] text-left transition-[background-color,border-color,transform] duration-[var(--qitu-motion-fast)] ease-[var(--qitu-ease-standard)] hover:bg-[var(--qitu-surface-row-hover)] active:scale-[0.995]"
      onClick={props.onClick}
      type="button"
    >
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
    </button>
  );
}

function SourceFileRow(props: { file: SourceFile; job: ImportJobListItem | null }) {
  const { formatBytes, formatDateTime, formatStatus } = useI18n();
  const status = props.job?.status ?? "stored";

  return (
    <div className="qitu-surface-subtle p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
            {props.file.filename}
          </div>
          <div className="qitu-number mt-1 text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
            {formatBytes(props.file.size)} · {formatDateTime(props.file.uploadedAt)}
          </div>
        </div>
        <StatusBadge tone={statusTone(status)}>{formatStatus(status)}</StatusBadge>
      </div>
    </div>
  );
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
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={props.onSelect}
        type="button"
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
      </button>
      <StatusBadge tone={statusTone(props.job.status)}>
        {formatStatus(props.job.status)}
      </StatusBadge>
      <Button size="sm" variant="ghost" onClick={props.onOpenReview}>
        <ArrowRight size={14} /> {t("nav.reviews")}
      </Button>
    </div>
  );
}

function UserRow(props: { user: ApiUser }) {
  const { formatDateTime, roleLabel, t } = useI18n();

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
      </div>
    </div>
  );
}

function InvitationRow(props: { invitation: InvitationSummary }) {
  const { formatDateTime, formatStatus, roleLabel, t } = useI18n();

  return (
    <div className="qitu-surface-subtle flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.invitation.email}
        </div>
        <div className="qitu-number text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          {t("invitation.expires", { value: formatDateTime(props.invitation.expiresAt) })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone={statusTone(props.invitation.status)}>
          {formatStatus(props.invitation.status)}
        </StatusBadge>
        <StatusBadge tone="neutral">{roleLabel(props.invitation.role)}</StatusBadge>
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

function canManageUsers(user: ApiUser): boolean {
  return user.role === "owner" || user.role === "admin";
}

function auditTimelineItem(event: AuditEvent, formatTime: (value: string) => string): TimelineItem {
  return {
    id: event.id,
    title: event.action,
    description: `${event.subject.kind}:${event.subject.id}`,
    time: formatTime(event.occurredAt),
    tone: timelineTone(event.action),
  };
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
