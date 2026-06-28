import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ChartDatum } from "@qitu/charts";
import { AppShell, Button, StatusBadge } from "@qitu/ui";
import { Activity, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  acceptInvitation,
  approveStagedRecord,
  bootstrapLocalReviewer,
  commitImportJob,
  confirmAiAdvisory,
  confirmPasswordReset,
  dismissAiAdvisory,
  drainLocalImportJobs,
  generateAiAdvisory,
  getImportJobReview,
  health,
  listAiAdvisories,
  listAuditEvents,
  listImportJobEvents,
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
import { readAuthRoute, replaceAuthPath } from "./auth-route";
import {
  AuthLinkLayout,
  ErrorText,
  Field,
  Panel,
  RuntimeRow,
  SectionTitle,
  nav,
  tabClass,
} from "./app-ui";
import { ReviewConsole } from "./review-console";
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

const defaultAuthForm = {
  email: "reviewer@example.com",
  displayName: "Reviewer",
  password: "correct horse battery staple",
  resetToken: "",
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
  const [importJobEvents, setImportJobEvents] = useState<ImportJobEvent[]>([]);
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
      setImportJobEvents([]);
    }
  }

  async function loadReview(jobId: string) {
    try {
      const [review, advisoryResponse, eventResponse] = await Promise.all([
        getImportJobReview(jobId),
        listAiAdvisories(jobId),
        listImportJobEvents(jobId, { limit: 30 }),
      ]);
      setReviewRecords(review.records);
      setReviewIssues(review.issues);
      setAiAdvisories(advisoryResponse.advisories);
      setImportJobEvents(eventResponse.events);
      setNotice(`Review loaded for ${review.job.sourceFile.filename}`);
    } catch (caught) {
      setReviewRecords([]);
      setReviewIssues([]);
      setAiAdvisories([]);
      setImportJobEvents([]);
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
      const response = await bootstrapLocalReviewer({
        email: authForm.email,
        password: authForm.password,
        ...(authForm.displayName ? { displayName: authForm.displayName } : {}),
      });
      setUser(response.user);
      setNotice(response.created ? "Local demo reviewer created" : "Local demo reviewer reset");
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
      setImportJobEvents([]);
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
      setImportJobEvents([]);
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
                <StatusBadge tone="warning">local demo</StatusBadge>
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
                  ? "Use local demo reviewer"
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
    <ReviewConsole
      aiAdvisories={aiAdvisories}
      auditEvents={auditEvents}
      canCommit={canCommit}
      canRetry={canRetry}
      counts={counts}
      error={error}
      importJobEvents={importJobEvents}
      importJobs={importJobs}
      isBusy={isBusy}
      notice={notice}
      onCommitApproved={() => void commitApproved()}
      onConfirmAdvisory={(advisoryId) => void confirmAdvisory(advisoryId)}
      onDecide={(recordId, status) => void decide(recordId, status)}
      onDismissAdvisory={(advisoryId) => void dismissAdvisory(advisoryId)}
      onGenerateAdvisory={() => void generateAdvisory()}
      onLogout={() => void handleLogout()}
      onProcessLocalQueue={() => void processLocalQueue()}
      onRefresh={() => void loadWorkspace()}
      onRetrySelectedJob={() => void retrySelectedJob()}
      onSelectJob={(jobId) => void selectJob(jobId)}
      onUploadSample={() => void handleUploadSample()}
      onUploadSelected={() => void handleUploadSelected()}
      reviewIssues={reviewIssues}
      reviewRecords={reviewRecords}
      reviewTrend={reviewTrend}
      runtimeEnvironment={runtimeEnvironment}
      selectedJob={selectedJob}
      selectedJobId={selectedJobId}
      sourceFiles={sourceFiles}
      uploadInputRef={uploadInputRef}
      user={user}
    />
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed.";
}
