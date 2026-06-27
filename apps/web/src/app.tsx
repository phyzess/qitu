import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import {
  acceptInvitation,
  approveStagedRecord,
  commitImportJob,
  confirmAiAdvisory,
  confirmPasswordReset,
  createLocalInvitation,
  dismissAiAdvisory,
  drainLocalImportJobs,
  generateAiAdvisory,
  getImportJobReview,
  health,
  listAiAdvisories,
  listAuditEvents,
  listImportJobs,
  listSourceFiles,
  login,
  logout,
  me,
  rejectStagedRecord,
  requestPasswordReset,
  retryImportJob,
  uploadSourceFile,
} from "./api";
import type {
  AiAdvisoryArtifact,
  ApiUser,
  AuditEvent,
  ImportJobListItem,
  ReviewIssue,
  SourceFile,
  StagedRecord,
} from "./types";

const nav = [
  { label: "Overview" },
  { label: "Sources" },
  { label: "Imports" },
  { label: "Reviews", active: true },
  { label: "Audit" },
];

const defaultAuthForm = {
  email: "reviewer@example.com",
  displayName: "Reviewer",
  password: "correct horse battery staple",
  resetToken: "",
};

type AuthRoute =
  | {
      kind: "home";
    }
  | {
      kind: "invite";
      token: string;
    }
  | {
      kind: "reset";
      token: string;
    };

export function App() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [authMode, setAuthMode] = useState<"login" | "setup" | "reset">("setup");
  const [authRoute, setAuthRoute] = useState(readAuthRoute);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [runtimeEnvironment, setRuntimeEnvironment] = useState("unknown");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState("Connect to the local Worker to begin");
  const [error, setError] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJobListItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [reviewRecords, setReviewRecords] = useState<StagedRecord[]>([]);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [aiAdvisories, setAiAdvisories] = useState<AiAdvisoryArtifact[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const runtime = await health().catch(() => null);
        const session = await me();
        if (cancelled) return;
        if (runtime) {
          setRuntimeEnvironment(runtime.environment);
        }
        setUser(session.user);
        if (session.user) {
          await loadWorkspace();
          setNotice("Review queue is ready");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(errorMessage(caught));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSession(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      setAuthRoute(readAuthRoute());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const jobBySourceId = useMemo(() => {
    return new Map(importJobs.map((job) => [job.sourceFileId, job]));
  }, [importJobs]);

  const counts = useMemo(() => {
    return reviewRecords.reduce(
      (accumulator, record) => {
        if (record.reviewStatus === "pending") accumulator.pending += 1;
        if (record.reviewStatus === "approved") accumulator.approved += 1;
        if (record.reviewStatus === "rejected") accumulator.rejected += 1;
        if (record.reviewStatus === "committed") accumulator.committed += 1;
        return accumulator;
      },
      {
        pending: 0,
        approved: 0,
        rejected: 0,
        committed: 0,
      },
    );
  }, [reviewRecords]);
  const reviewTrend: ChartDatum[] = useMemo(
    () => [
      { x: 0, y: counts.pending, label: "Pending" },
      { x: 1, y: counts.approved, label: "Approved" },
      { x: 2, y: counts.rejected, label: "Rejected" },
      { x: 3, y: counts.committed, label: "Committed" },
    ],
    [counts],
  );

  const selectedJob = importJobs.find((job) => job.id === selectedJobId) ?? null;
  const canCommit = Boolean(selectedJobId && counts.approved > 0);
  const canRetry = Boolean(selectedJobId && selectedJob?.status === "failed");

  async function loadWorkspace(preferredJobId?: string) {
    const [sourceFileResponse, importJobResponse, auditResponse] = await Promise.all([
      listSourceFiles({ limit: 20 }),
      listImportJobs({ limit: 20 }),
      listAuditEvents({ limit: 20 }),
    ]);

    setSourceFiles(sourceFileResponse.sourceFiles);
    setImportJobs(importJobResponse.importJobs);
    setAuditEvents(auditResponse.auditEvents);

    const nextJobId =
      preferredJobId ?? selectedJobId ?? importJobResponse.importJobs[0]?.id ?? null;
    setSelectedJobId(nextJobId);

    if (nextJobId) {
      await loadReview(nextJobId);
    } else {
      setReviewRecords([]);
      setReviewIssues([]);
      setAiAdvisories([]);
    }
  }

  async function loadReview(jobId: string) {
    try {
      const [review, advisoryResponse] = await Promise.all([
        getImportJobReview(jobId),
        listAiAdvisories(jobId),
      ]);
      setReviewRecords(review.records);
      setReviewIssues(review.issues);
      setAiAdvisories(advisoryResponse.advisories);
      setNotice(`Review loaded for ${review.job.sourceFile.filename}`);
    } catch (caught) {
      setReviewRecords([]);
      setReviewIssues([]);
      setAiAdvisories([]);
      setNotice("Import job is waiting for review records");
      if (!String(caught).includes("404")) {
        setError(errorMessage(caught));
      }
    }
  }

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLocalSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const invitation = await createLocalInvitation({
        email: authForm.email,
        role: "reviewer",
      });
      const accepted = await acceptInvitation({
        token: invitation.inviteToken,
        password: authForm.password,
        ...(authForm.displayName ? { displayName: authForm.displayName } : {}),
      });
      setUser(accepted.user);
      setNotice("Local reviewer created");
      await loadWorkspace();
    });
  }

  async function handleInviteAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authRoute.kind !== "invite") return;

    await runAction(async () => {
      const accepted = await acceptInvitation({
        token: authRoute.token,
        password: authForm.password,
        ...(authForm.displayName ? { displayName: authForm.displayName } : {}),
      });
      setUser(accepted.user);
      setNotice("Invitation accepted");
      replaceAuthPath("/", setAuthRoute);
      await loadWorkspace();
    });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const response = await login({
        email: authForm.email,
        password: authForm.password,
      });
      setUser(response.user);
      setNotice("Signed in");
      await loadWorkspace();
    });
  }

  async function handleRoutePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authRoute.kind !== "reset") return;

    await runAction(async () => {
      await confirmPasswordReset({
        token: authRoute.token,
        password: authForm.password,
      });
      setUser(null);
      setSourceFiles([]);
      setImportJobs([]);
      setAuditEvents([]);
      setReviewRecords([]);
      setReviewIssues([]);
      setAiAdvisories([]);
      setSelectedJobId(null);
      setAuthMode("login");
      setNotice("Password reset complete. Sign in with the new password.");
      replaceAuthPath("/", setAuthRoute);
    });
  }

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      if (!authForm.resetToken) {
        const response = await requestPasswordReset({
          email: authForm.email,
        });
        setAuthForm((current) => ({
          ...current,
          resetToken: response.resetToken ?? current.resetToken,
        }));
        setNotice(response.resetToken ? "Local reset token created" : "Password reset email sent");
        return;
      }

      await confirmPasswordReset({
        token: authForm.resetToken,
        password: authForm.password,
      });
      setAuthMode("login");
      setNotice("Password reset complete");
    });
  }

  async function handleLogout() {
    await runAction(async () => {
      await logout();
      setUser(null);
      setSourceFiles([]);
      setImportJobs([]);
      setAuditEvents([]);
      setReviewRecords([]);
      setReviewIssues([]);
      setAiAdvisories([]);
      setSelectedJobId(null);
      setNotice("Signed out");
    });
  }

  async function handleUploadSelected() {
    const file = uploadInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }

    await uploadFile(file);
  }

  async function handleUploadSample() {
    const file = new File(["label,value\nSample Record,1.1992\n"], `sample-${Date.now()}.txt`, {
      type: "text/plain",
    });
    await uploadFile(file);
  }

  async function uploadFile(file: File) {
    await runAction(async () => {
      const upload = await uploadSourceFile({
        file,
        workspaceId: "default",
      });
      setNotice(upload.duplicate ? "Duplicate source file found" : "Source file uploaded");
      await loadWorkspace(upload.importJobId);
    });
  }

  async function selectJob(jobId: string) {
    setSelectedJobId(jobId);
    await runAction(async () => {
      await loadReview(jobId);
    });
  }

  async function processLocalQueue() {
    await runAction(async () => {
      const result = await drainLocalImportJobs();
      setNotice(`Processed ${result.processedCount} local import job(s)`);
      await loadWorkspace(selectedJobId ?? result.processedJobIds[0]);
    });
  }

  async function decide(recordId: string, status: "approved" | "rejected") {
    if (!selectedJobId) return;

    await runAction(async () => {
      const response =
        status === "approved"
          ? await approveStagedRecord({
              jobId: selectedJobId,
              recordId,
              note: "Approved in web console.",
            })
          : await rejectStagedRecord({
              jobId: selectedJobId,
              recordId,
              note: "Rejected in web console.",
            });

      setReviewRecords((current) =>
        current.map((record) => (record.id === recordId ? response.record : record)),
      );
      setNotice(status === "approved" ? "Record approved" : "Record rejected");
      await loadWorkspace(selectedJobId);
    });
  }

  async function commitApproved() {
    if (!selectedJobId) return;

    await runAction(async () => {
      await commitImportJob(selectedJobId);
      setNotice("Approved records committed");
      await loadWorkspace(selectedJobId);
    });
  }

  async function retrySelectedJob() {
    if (!selectedJobId) return;

    await runAction(async () => {
      const response = await retryImportJob(selectedJobId);
      setNotice(`Import job ${response.status}`);
      await loadWorkspace(selectedJobId);
    });
  }

  async function generateAdvisory() {
    if (!selectedJobId) return;

    await runAction(async () => {
      await generateAiAdvisory(selectedJobId);
      setNotice("AI advisory generated");
      await loadWorkspace(selectedJobId);
    });
  }

  async function confirmAdvisory(advisoryId: string) {
    if (!selectedJobId) return;

    await runAction(async () => {
      await confirmAiAdvisory({
        jobId: selectedJobId,
        advisoryId,
      });
      setNotice("AI advisory confirmed");
      await loadWorkspace(selectedJobId);
    });
  }

  async function dismissAdvisory(advisoryId: string) {
    if (!selectedJobId) return;

    await runAction(async () => {
      await dismissAiAdvisory({
        jobId: selectedJobId,
        advisoryId,
      });
      setNotice("AI advisory dismissed");
      await loadWorkspace(selectedJobId);
    });
  }

  if (isLoadingSession) {
    return (
      <AppShell brand="qitu" navigation={nav}>
        <Panel>
          <div className="text-sm text-[var(--color-text-muted)]">Loading session...</div>
        </Panel>
      </AppShell>
    );
  }

  if (authRoute.kind === "invite") {
    return (
      <AppShell brand="qitu" navigation={nav}>
        <AuthLinkLayout
          badge="invitation"
          description="Create your reviewer account from the secure link sent by email."
          notice={notice}
          title="Accept invitation"
        >
          <form className="mt-5 space-y-4" onSubmit={handleInviteAccept}>
            <Field
              label="Display name"
              onChange={(value) => setAuthForm((current) => ({ ...current, displayName: value }))}
              value={authForm.displayName}
            />
            <Field
              label="Password"
              onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
              type="password"
              value={authForm.password}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button disabled={isBusy} type="submit">
              <ShieldCheck size={15} /> Accept invitation
            </Button>
          </form>
        </AuthLinkLayout>
      </AppShell>
    );
  }

  if (authRoute.kind === "reset") {
    return (
      <AppShell brand="qitu" navigation={nav}>
        <AuthLinkLayout
          badge="password reset"
          description="Choose a new password. Existing sessions will be revoked after confirmation."
          notice={notice}
          title="Reset password"
        >
          <form className="mt-5 space-y-4" onSubmit={handleRoutePasswordReset}>
            <Field
              label="New password"
              onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
              type="password"
              value={authForm.password}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button disabled={isBusy} type="submit">
              <ShieldCheck size={15} /> Reset password
            </Button>
          </form>
        </AuthLinkLayout>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell brand="qitu" navigation={nav}>
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[1fr_0.8fr]">
          <Panel>
            <div className="flex items-start justify-between gap-4">
              <div>
                <StatusBadge tone="warning">local access</StatusBadge>
                <h1 className="mt-3 text-xl font-semibold tracking-normal">Reviewer access</h1>
              </div>
              <LockKeyhole size={18} className="text-[var(--color-accent)]" />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 rounded-lg bg-[var(--color-panel-subtle)] p-1">
              <button
                className={tabClass(authMode === "setup")}
                onClick={() => setAuthMode("setup")}
                type="button"
              >
                Setup
              </button>
              <button
                className={tabClass(authMode === "login")}
                onClick={() => setAuthMode("login")}
                type="button"
              >
                Login
              </button>
              <button
                className={tabClass(authMode === "reset")}
                onClick={() => setAuthMode("reset")}
                type="button"
              >
                Reset
              </button>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={
                authMode === "setup"
                  ? handleLocalSetup
                  : authMode === "reset"
                    ? handlePasswordReset
                    : handleLogin
              }
            >
              <Field
                label="Email"
                onChange={(value) => setAuthForm((current) => ({ ...current, email: value }))}
                type="email"
                value={authForm.email}
              />
              {authMode === "setup" ? (
                <Field
                  label="Display name"
                  onChange={(value) =>
                    setAuthForm((current) => ({ ...current, displayName: value }))
                  }
                  value={authForm.displayName}
                />
              ) : null}
              {authMode === "reset" ? (
                <Field
                  label="Reset token"
                  onChange={(value) =>
                    setAuthForm((current) => ({ ...current, resetToken: value }))
                  }
                  value={authForm.resetToken}
                />
              ) : null}
              <Field
                label={authMode === "reset" ? "New password" : "Password"}
                onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
                type="password"
                value={authForm.password}
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Button disabled={isBusy} type="submit">
                <ShieldCheck size={15} />
                {authMode === "setup"
                  ? "Create local reviewer"
                  : authMode === "reset"
                    ? authForm.resetToken
                      ? "Reset password"
                      : "Send reset email"
                    : "Login"}
              </Button>
            </form>
          </Panel>

          <Panel>
            <SectionTitle icon={<Activity size={16} />} label="Runtime" />
            <div className="mt-4 space-y-3">
              <RuntimeRow label="Worker" value="/api" />
              <RuntimeRow label="Environment" value={runtimeEnvironment} />
              <RuntimeRow label="Session" value={notice} />
              <RuntimeRow label="Database" value="D1 local" />
            </div>
          </Panel>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      actions={
        <>
          <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => void loadWorkspace()}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button disabled={isBusy} size="sm" variant="ghost" onClick={() => void handleLogout()}>
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
                <StatusBadge tone="active">{user.email}</StatusBadge>
                <h1 className="mt-3 text-xl font-semibold tracking-normal">Review console</h1>
                <div className="mt-2 text-xs text-[var(--color-text-muted)]">{notice}</div>
              </div>
              <LockKeyhole size={17} className="text-[var(--color-accent)]" />
            </div>
            {error ? <ErrorText>{error}</ErrorText> : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Kpi label="Pending" value={counts.pending} />
              <Kpi label="Approved" value={counts.approved} />
              <Kpi label="Rejected" value={counts.rejected} />
              <Kpi label="Committed" value={counts.committed} />
            </div>
            <div className="mt-4 rounded-lg bg-[var(--color-panel-subtle)] p-3">
              <TimeSeriesChart data={reviewTrend} height={120} label="Review status trend" />
            </div>
          </Panel>

          <Panel>
            <SectionTitle icon={<FileSpreadsheet size={16} />} label="Source files" />
            <div className="mt-4 space-y-3">
              <input
                ref={uploadInputRef}
                className="block w-full rounded-lg bg-[var(--color-panel-subtle)] px-3 py-2 text-sm"
                type="file"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={isBusy}
                  size="sm"
                  variant="secondary"
                  onClick={handleUploadSelected}
                >
                  <FileUp size={14} /> Upload selected
                </Button>
                <Button disabled={isBusy} size="sm" variant="ghost" onClick={handleUploadSample}>
                  <FileUp size={14} /> Upload sample
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {sourceFiles.length === 0 ? (
                <EmptyText>No source files yet.</EmptyText>
              ) : (
                sourceFiles.map((file) => (
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
              {runtimeEnvironment === "local" ? (
                <Button disabled={isBusy} size="sm" variant="ghost" onClick={processLocalQueue}>
                  <RefreshCw size={14} /> Process local queue
                </Button>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {importJobs.length === 0 ? (
                <EmptyText>No import jobs yet.</EmptyText>
              ) : (
                importJobs.map((job) => (
                  <JobStep
                    active={job.id === selectedJobId}
                    job={job}
                    key={job.id}
                    onSelect={() => void selectJob(job.id)}
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
                {selectedJob ? selectedJob.sourceFile.filename : "No import job selected"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canRetry ? (
                <Button disabled={isBusy} size="sm" variant="secondary" onClick={retrySelectedJob}>
                  <RefreshCw size={14} /> Retry job
                </Button>
              ) : null}
              <Button disabled={!canCommit || isBusy} size="sm" onClick={commitApproved}>
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
                {reviewRecords.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-sm text-[var(--color-text-muted)]" colSpan={5}>
                      No staged records are available yet.
                    </td>
                  </tr>
                ) : (
                  reviewRecords.map((record) => (
                    <ReviewRow
                      issue={issueForRecord(record, reviewIssues)}
                      key={record.id}
                      onApprove={() => void decide(record.id, "approved")}
                      onReject={() => void decide(record.id, "rejected")}
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
                disabled={!selectedJobId || isBusy}
                size="sm"
                variant="ghost"
                onClick={generateAdvisory}
              >
                <Sparkles size={14} /> Generate
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {aiAdvisories.length === 0 ? (
                <EmptyText>No advisory yet.</EmptyText>
              ) : (
                aiAdvisories.map((advisory) => (
                  <AiAdvisoryItem
                    advisory={advisory}
                    disabled={isBusy}
                    key={advisory.id}
                    onConfirm={() => void confirmAdvisory(advisory.id)}
                    onDismiss={() => void dismissAdvisory(advisory.id)}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <SectionTitle icon={<ListChecks size={16} />} label="Audit timeline" />
            <div className="mt-4 space-y-3">
              {auditEvents.length === 0 ? (
                <EmptyText>No audit events yet.</EmptyText>
              ) : (
                auditEvents.map((event) => <AuditItem event={event} key={event.id} />)
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

function Panel(props: { children: ReactNode }) {
  return <div className="qitu-card p-5">{props.children}</div>;
}

function SectionTitle(props: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <span className="text-[var(--color-accent)]">{props.icon}</span>
      {props.label}
    </div>
  );
}

function AuthLinkLayout(props: {
  badge: string;
  children: ReactNode;
  description: string;
  notice: string;
  title: string;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[1fr_0.8fr]">
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <StatusBadge tone="warning">{props.badge}</StatusBadge>
            <h1 className="mt-3 text-xl font-semibold tracking-normal">{props.title}</h1>
            <div className="mt-2 max-w-[36rem] text-sm leading-6 text-[var(--color-text-muted)]">
              {props.description}
            </div>
          </div>
          <LockKeyhole size={18} className="text-[var(--color-accent)]" />
        </div>
        {props.children}
      </Panel>

      <Panel>
        <SectionTitle icon={<Activity size={16} />} label="Runtime" />
        <div className="mt-4 space-y-3">
          <RuntimeRow label="Worker" value="/api" />
          <RuntimeRow label="Session" value={props.notice} />
        </div>
      </Panel>
    </div>
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

function RuntimeRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-panel-subtle)] px-3 py-2">
      <div className="text-sm text-[var(--color-text-muted)]">{props.label}</div>
      <div className="qitu-number text-xs">{props.value}</div>
    </div>
  );
}

function Field(props: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--color-text-muted)]">{props.label}</span>
      <input
        className="mt-2 block w-full rounded-lg bg-[var(--color-panel-subtle)] px-3 py-2 text-sm outline-none ring-0 focus:bg-white focus:shadow-[0_0_0_2px_var(--color-accent)]"
        onChange={(event) => props.onChange(event.target.value)}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

function ErrorText(props: { children: ReactNode }) {
  return <div className="mt-4 text-sm text-[var(--color-danger)]">{props.children}</div>;
}

function EmptyText(props: { children: ReactNode }) {
  return <div className="text-sm text-[var(--color-text-muted)]">{props.children}</div>;
}

function tabClass(active: boolean): string {
  return [
    "h-8 rounded-md text-sm transition-colors",
    active ? "bg-white text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-muted)]",
  ].join(" ");
}

function readAuthRoute(): AuthRoute {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const [kind, token] = segments;

  if (kind === "invite" && token) {
    return {
      kind: "invite",
      token: decodeURIComponent(token),
    };
  }

  if (kind === "reset-password" && token) {
    return {
      kind: "reset",
      token: decodeURIComponent(token),
    };
  }

  return {
    kind: "home",
  };
}

function replaceAuthPath(path: string, setAuthRoute: (route: AuthRoute) => void): void {
  window.history.replaceState(null, "", path);
  setAuthRoute(readAuthRoute());
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed.";
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
