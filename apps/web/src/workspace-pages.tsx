import { type ReactNode, type RefObject } from "react";
import {
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
import {
  Activity,
  ArrowRight,
  Check,
  Clock3,
  Database,
  FileSpreadsheet,
  FileUp,
  KeyRound,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { ErrorText, Field, RuntimeRow, SelectField } from "./app-ui";
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

const roleOptions = [
  { label: "Viewer", value: "viewer" },
  { label: "Reviewer", value: "reviewer" },
  { label: "Admin", value: "admin" },
  { label: "Owner", value: "owner" },
];

export function OverviewPage(props: {
  auditEvents: AuditEvent[];
  counts: ReviewCounts;
  importJobs: ImportJobListItem[];
  onNavigate: (path: string) => void;
  sourceFiles: SourceFile[];
}) {
  const metrics: MetricItem[] = [
    {
      id: "sources",
      label: "Source files",
      value: props.sourceFiles.length,
      meta: latestTime(props.sourceFiles.map((file) => file.uploadedAt)),
    },
    {
      id: "imports",
      label: "Import jobs",
      value: props.importJobs.length,
      meta: latestTime(props.importJobs.map((job) => job.updatedAt)),
    },
    {
      id: "pending",
      label: "Pending review",
      value: props.counts.pending,
      tone: props.counts.pending > 0 ? "warning" : "neutral",
    },
    {
      id: "audit",
      label: "Audit events",
      value: props.auditEvents.length,
    },
  ];

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-[var(--qitu-layout-gutter)]">
        <Surface className="p-[var(--qitu-space-s1)]">
          <SectionHeader
            description="Authenticated workbench state across source intake, import jobs, review, and audit."
            icon={<Activity size={16} />}
            title="Workspace overview"
          />
          <MetricStrip className="mt-[var(--qitu-space-s1)]" items={metrics} />
        </Surface>

        <Surface className="p-[var(--qitu-space-s1)]">
          <SectionHeader icon={<ListChecks size={16} />} title="Primary workflow" />
          <div className="mt-[var(--qitu-space-s1)] grid gap-3 md:grid-cols-3">
            <WorkflowTarget
              description="Upload a source file and create an import job."
              icon={<FileSpreadsheet size={16} />}
              label="Sources"
              onClick={() => props.onNavigate("/sources")}
              status={`${props.sourceFiles.length} file(s)`}
            />
            <WorkflowTarget
              description="Process local jobs and inspect job status."
              icon={<Database size={16} />}
              label="Imports"
              onClick={() => props.onNavigate("/imports")}
              status={`${props.importJobs.length} job(s)`}
            />
            <WorkflowTarget
              description="Review staged records and commit approved rows."
              icon={<ListChecks size={16} />}
              label="Reviews"
              onClick={() => props.onNavigate("/reviews")}
              status={`${props.counts.pending} pending`}
            />
          </div>
        </Surface>
      </section>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader icon={<ShieldCheck size={16} />} title="Recent audit" />
        <Timeline
          className="mt-[var(--qitu-space-s1)]"
          emptyLabel="No audit events have been recorded yet."
          items={props.auditEvents.slice(0, 8).map(auditTimelineItem)}
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
  const jobBySourceId = new Map(props.importJobs.map((job) => [job.sourceFileId, job]));

  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader
          description="Authenticated source intake with content-hash idempotency."
          icon={<FileSpreadsheet size={16} />}
          title="Source files"
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
            <div className="grid gap-3 lg:grid-cols-2">
              {props.sourceFiles.map((file) => (
                <SourceFileRow file={file} job={jobBySourceId.get(file.id) ?? null} key={file.id} />
              ))}
            </div>
          </DataState>
        </div>
      </Surface>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader icon={<ShieldCheck size={16} />} title="Intake guardrails" />
        <div className="mt-[var(--qitu-space-s1)] space-y-2">
          <Guardrail label="Login required" />
          <Guardrail label="Content hash stored" />
          <Guardrail label="Duplicate upload detected" />
          <Guardrail label="Import job queued" />
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
                  <RefreshCw size={14} /> Process local queue
                </Button>
              ) : null}
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
            </div>
          }
          icon={<Database size={16} />}
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
        <SectionHeader icon={<Activity size={16} />} title="Runtime" />
        <div className="mt-[var(--qitu-space-s1)] space-y-3">
          <RuntimeRow label="Worker" value="/api" />
          <RuntimeRow label="Environment" value={props.runtimeEnvironment} />
          <RuntimeRow label="Selected job" value={props.selectedJobId ?? "none"} />
        </div>
      </Surface>
    </div>
  );
}

export function AuditPage(props: { auditEvents: AuditEvent[] }) {
  return (
    <Surface className="p-[var(--qitu-space-s1)]">
      <SectionHeader
        description="Compliance trail for auth, RBAC, source, import, review, advisory, and commit events."
        icon={<ShieldCheck size={16} />}
        title="Audit timeline"
      />
      <Timeline
        className="mt-[var(--qitu-space-s1)]"
        emptyLabel="No audit events have been recorded yet."
        items={props.auditEvents.map(auditTimelineItem)}
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
  return (
    <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader icon={<KeyRound size={16} />} title="Account" />
        <div className="mt-[var(--qitu-space-s1)] grid gap-3 md:grid-cols-2">
          <RuntimeRow label="Email" value={props.user.email} />
          <RuntimeRow label="Display name" value={props.user.displayName ?? "none"} />
          <RuntimeRow label="Role" value={props.user.role} />
          <RuntimeRow label="Created" value={formatDateTime(props.user.createdAt)} />
        </div>
        <div className="mt-[var(--qitu-space-s1)] flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onLogout}>
            <X size={15} /> Logout
          </Button>
        </div>
      </Surface>

      <Surface as="aside" className="p-[var(--qitu-space-s1)]">
        <SectionHeader icon={<Activity size={16} />} title="Session" />
        <div className="mt-[var(--qitu-space-s1)] space-y-3">
          <RuntimeRow label="Runtime" value={props.runtimeEnvironment} />
          <RuntimeRow label="Status" value={props.notice} />
          <RuntimeRow label="Cookie" value="HttpOnly session" />
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
  const canManage = canManageUsers(props.user);

  if (!canManage) {
    return (
      <Surface className="p-[var(--qitu-space-s1)]">
        <SectionHeader icon={<UserCog size={16} />} title="User management" />
        <div className="mt-[var(--qitu-space-s1)]">
          <DataState
            description="Owner or admin role is required for user and invitation management."
            state="error"
            title="Admin-only route"
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
                <RefreshCw size={14} /> Refresh
              </Button>
            }
            icon={<UserCog size={16} />}
            title="User management"
          />
          {props.adminError ? <ErrorText>{props.adminError}</ErrorText> : null}
          <div className="mt-[var(--qitu-space-s1)]">
            <DataState
              description="Users accepted through invitation links will appear here."
              state={props.users.length === 0 ? "empty" : "ready"}
              title="No users"
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
          <SectionHeader icon={<ShieldCheck size={16} />} title="Invitations" />
          <div className="mt-[var(--qitu-space-s1)]">
            <DataState
              description="Pending, accepted, revoked, and expired invitations are listed here."
              state={props.invitations.length === 0 ? "empty" : "ready"}
              title="No invitations"
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
        <SectionHeader icon={<KeyRound size={16} />} title="Create invitation" />
        <div className="mt-[var(--qitu-space-s1)] space-y-4">
          <Field
            label="Email"
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
            label="Role"
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
            <KeyRound size={15} /> Create invitation
          </Button>
          {props.createdInvitationUrl ? (
            <a
              className="block break-all text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-chroma-lime-ink)]"
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
        <span className="text-[var(--qitu-chroma-lime-ink)]">{props.icon}</span>
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
        <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
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
      <StatusBadge tone={statusTone(props.job.status)}>{props.job.status}</StatusBadge>
      <Button size="sm" variant="ghost" onClick={props.onOpenReview}>
        <ArrowRight size={14} /> Review
      </Button>
    </div>
  );
}

function UserRow(props: { user: ApiUser }) {
  return (
    <div className="qitu-surface-subtle flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.user.email}
        </div>
        <div className="text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
          {props.user.displayName ?? "No display name"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone="active">{props.user.role}</StatusBadge>
        <span className="qitu-number text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          {formatDateTime(props.user.createdAt)}
        </span>
      </div>
    </div>
  );
}

function InvitationRow(props: { invitation: InvitationSummary }) {
  return (
    <div className="qitu-surface-subtle flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.invitation.email}
        </div>
        <div className="qitu-number text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          Expires {formatDateTime(props.invitation.expiresAt)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone={statusTone(props.invitation.status)}>
          {props.invitation.status}
        </StatusBadge>
        <StatusBadge tone="neutral">{props.invitation.role}</StatusBadge>
      </div>
    </div>
  );
}

function Guardrail(props: { label: string }) {
  return (
    <div className="qitu-surface-subtle flex items-center justify-between gap-3 px-3 py-2">
      <div className="text-[length:var(--qitu-text-label-13)] leading-[var(--qitu-leading-label-13)]">
        {props.label}
      </div>
      <StatusBadge tone="active">active</StatusBadge>
    </div>
  );
}

function canManageUsers(user: ApiUser): boolean {
  return user.role === "owner" || user.role === "admin";
}

function auditTimelineItem(event: AuditEvent): TimelineItem {
  return {
    id: event.id,
    title: event.action,
    description: `${event.subject.kind}:${event.subject.id}`,
    time: formatTime(event.occurredAt),
    tone: timelineTone(event.action),
  };
}

function latestTime(values: string[]): string | undefined {
  const latest = values
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  return latest ? `Latest ${formatDateTime(new Date(latest).toISOString())}` : undefined;
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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
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
    status === "active" ||
    status === "accepted" ||
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
