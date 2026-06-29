import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ChartDatum } from "@qitu/charts";
import { AppShell, Button, StatusBadge, type AppShellNavItem } from "@qitu/ui";
import { Activity, ChevronDown, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import {
  acceptInvitation,
  bootstrapLocalAdmin,
  approveStagedRecord,
  bootstrapLocalReviewer,
  commitImportJob,
  confirmAiAdvisory,
  confirmPasswordReset,
  createInvitation,
  dismissAiAdvisory,
  drainLocalImportJobs,
  generateAiAdvisory,
  getImportJobReview,
  health,
  listAiAdvisories,
  listAuditEvents,
  listInvitations,
  listImportJobEvents,
  listImportJobs,
  listSourceFiles,
  listUsers,
  login,
  logout,
  me,
  rejectStagedRecord,
  requestPasswordReset,
  retryImportJob,
  uploadSourceFile,
} from "./api";
import {
  type AppPrimaryRoute,
  defaultAuthenticatedPath,
  isWorkspaceAppRoute,
  isProtectedRoute,
  loginPath,
  primaryRouteFor,
  readAppRoute,
  type AppRoute,
  type WorkspaceAppRoute,
} from "./app-routes";
import { readAuthRoute } from "./auth-route";
import {
  AuthLinkLayout,
  type AppNavigationModel,
  buildNavigation,
  ErrorText,
  Field,
  Panel,
  RuntimeRow,
  SectionTitle,
  tabClass,
  type WorkspaceRouteEntry,
} from "./app-ui";
import { ReviewConsole } from "./review-console";
import {
  LanguageSelector,
  type SearchEntry,
  ThemeToggleButton,
  UserPanel,
  WorkspaceSearchDialog,
} from "./shell-controls";
import { useI18n, type MessageKey, type Translate } from "./i18n";
import type {
  AiAdvisoryArtifact,
  ApiUser,
  AuditEvent,
  ImportJobEvent,
  ImportJobListItem,
  InvitationSummary,
  ReviewIssue,
  SourceFile,
  StagedRecord,
} from "./types";
import {
  AccountPage,
  AuditPage,
  ImportsPage,
  OverviewPage,
  SourcesPage,
  UsersPage,
} from "./workspace-pages";

const defaultAuthForm = {
  email: "reviewer@example.com",
  displayName: "Reviewer",
  password: "correct horse battery staple",
  resetToken: "",
};

const defaultInvitationForm = {
  email: "new-user@example.com",
  role: "viewer",
};

type RouteMemory = Partial<Record<AppPrimaryRoute, WorkspaceAppRoute>>;
type NoticeDescriptor = {
  key: MessageKey;
  values?: Record<string, number | string>;
};

const routeMemoryStorageKey = "qitu.route-memory";

const localDemoProfiles = {
  admin: {
    displayName: "Admin",
    email: "admin@example.com",
  },
  reviewer: {
    displayName: "Reviewer",
    email: "reviewer@example.com",
  },
} as const;

export function App() {
  const { formatBytes, formatStatus, roleLabel, t } = useI18n();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [authMode, setAuthMode] = useState<"login" | "setup" | "reset">("setup");
  const [setupRole, setSetupRole] = useState<"admin" | "reviewer">("reviewer");
  const [authRoute, setAuthRoute] = useState(readAuthRoute);
  const [route, setRoute] = useState<AppRoute>(readAppRoute);
  const [routeMemory, setRouteMemory] = useState<RouteMemory>(() => readRouteMemory());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [runtimeEnvironment, setRuntimeEnvironment] = useState("unknown");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeDescriptor>({ key: "notice.connectWorker" });
  const [error, setError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJobListItem[]>([]);
  const [importJobEvents, setImportJobEvents] = useState<ImportJobEvent[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [invitationForm, setInvitationForm] = useState(defaultInvitationForm);
  const [createdInvitationUrl, setCreatedInvitationUrl] = useState<string | null>(null);
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
          setNotice({ key: "notice.reviewQueueReady" });
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
      syncRouteState();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k" || !user) return;

      event.preventDefault();
      setSearchOpen(true);
      setUserPanelOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [user]);

  useEffect(() => {
    setSearchOpen(false);
    setUserPanelOpen(false);
  }, [route]);

  useEffect(() => {
    if (!user || !isWorkspaceAppRoute(route)) return;
    if (route === "users" && !canManageUsers(user)) return;

    const primaryRoute = primaryRouteFor(route);
    if (!primaryRoute) return;

    setRouteMemory((current) => {
      if (current[primaryRoute] === route) return current;

      const next = {
        ...current,
        [primaryRoute]: route,
      };
      writeRouteMemory(next);
      return next;
    });
  }, [route, user]);

  useEffect(() => {
    if (isLoadingSession || authRoute.kind !== "home") return;

    if (!user && isProtectedRoute(route)) {
      navigate(loginPath, { replace: true });
      return;
    }

    if (user && route === "login") {
      navigate(defaultAuthenticatedPath, { replace: true });
    }
  }, [authRoute.kind, isLoadingSession, route, user]);

  useEffect(() => {
    if (route !== "users" || !user || !canManageUsers(user)) return;
    void loadUserManagement();
  }, [route, user]);

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
      { x: 0, y: counts.pending, label: formatStatus("pending") },
      { x: 1, y: counts.approved, label: formatStatus("approved") },
      { x: 2, y: counts.rejected, label: formatStatus("rejected") },
      { x: 3, y: counts.committed, label: formatStatus("committed") },
    ],
    [counts, formatStatus],
  );

  const selectedJob = importJobs.find((job) => job.id === selectedJobId) ?? null;
  const canCommit = Boolean(selectedJobId && counts.approved > 0);
  const canRetry = Boolean(selectedJobId && selectedJob?.status === "failed");
  const noticeText = t(notice.key, notice.values);
  const navigationModel = useMemo<AppNavigationModel>(
    () =>
      buildNavigation(route, {
        authenticated: Boolean(user),
        canManageUsers: user ? canManageUsers(user) : false,
        onNavigate: (path) => navigate(path),
        resolvePrimaryRoute: (primaryRoute, fallbackRoute) =>
          routeMemory[primaryRoute] ?? fallbackRoute,
        t,
      }),
    [route, routeMemory, t, user],
  );
  const searchEntries = useMemo(
    () =>
      buildSearchEntries({
        auditEvents,
        formatBytes,
        formatStatus,
        importJobs,
        onNavigate: (path) => navigate(path),
        onSelectJob: (jobId) => void selectJob(jobId),
        roleLabel,
        routeEntries: navigationModel.routeEntries,
        sourceFiles,
        t,
        user,
        users,
      }),
    [
      auditEvents,
      formatBytes,
      formatStatus,
      importJobs,
      navigationModel.routeEntries,
      roleLabel,
      sourceFiles,
      t,
      user,
      users,
    ],
  );
  const shellActions = user ? (
    <ShellActions
      disabled={isBusy}
      onOpenUserPanel={toggleUserPanel}
      onRefresh={() => void handleRefreshWorkspace()}
      user={user}
    />
  ) : (
    <GuestActions />
  );
  const shellOverlays = user ? (
    <>
      <WorkspaceSearchDialog
        entries={searchEntries}
        open={searchOpen}
        query={searchQuery}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (open) setUserPanelOpen(false);
        }}
        onQueryChange={setSearchQuery}
      />
      <UserPanel
        canManageUsers={canManageUsers(user)}
        notice={noticeText}
        open={userPanelOpen}
        runtimeEnvironment={runtimeEnvironment}
        user={user}
        onClose={() => setUserPanelOpen(false)}
        onLogout={() => {
          setUserPanelOpen(false);
          void handleLogout();
        }}
        onNavigate={(path) => navigate(path)}
      />
    </>
  ) : null;

  function syncRouteState() {
    setAuthRoute(readAuthRoute());
    setRoute(readAppRoute());
  }

  function navigate(path: string, options: { replace?: boolean } = {}) {
    if (window.location.pathname !== path) {
      const method = options.replace ? "replaceState" : "pushState";
      window.history[method](null, "", path);
    }
    syncRouteState();
  }

  function openSearch() {
    setSearchOpen(true);
    setUserPanelOpen(false);
  }

  function toggleUserPanel() {
    setUserPanelOpen((current) => !current);
    setSearchOpen(false);
  }

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

  async function handleRefreshWorkspace() {
    await runAction(async () => {
      await loadWorkspace();
      if (route === "users") {
        await loadUserManagement();
      }
      setNotice({ key: "notice.workspaceRefreshed" });
    });
  }

  async function loadUserManagement() {
    if (!user || !canManageUsers(user)) return;

    setAdminError(null);
    try {
      const [userResponse, invitationResponse] = await Promise.all([
        listUsers({ limit: 50 }),
        listInvitations({ limit: 50 }),
      ]);
      setUsers(userResponse.users);
      setInvitations(invitationResponse.invitations);
    } catch (caught) {
      setAdminError(errorMessage(caught));
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
      setNotice({
        key: "notice.reviewLoaded",
        values: { filename: review.job.sourceFile.filename },
      });
    } catch (caught) {
      setReviewRecords([]);
      setReviewIssues([]);
      setAiAdvisories([]);
      setImportJobEvents([]);
      setNotice({ key: "notice.reviewWaiting" });
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

  function clearWorkspace() {
    setSourceFiles([]);
    setImportJobs([]);
    setAuditEvents([]);
    setUsers([]);
    setInvitations([]);
    setCreatedInvitationUrl(null);
    setReviewRecords([]);
    setReviewIssues([]);
    setAiAdvisories([]);
    setImportJobEvents([]);
    setSelectedJobId(null);
  }

  async function handleLocalSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const bootstrapDemoUser =
        setupRole === "admin" ? bootstrapLocalAdmin : bootstrapLocalReviewer;
      const response = await bootstrapDemoUser({
        email: authForm.email,
        password: authForm.password,
        ...(authForm.displayName ? { displayName: authForm.displayName } : {}),
      });
      setUser(response.user);
      setNotice({
        key:
          setupRole === "admin"
            ? response.created
              ? "notice.localDemoAdminCreated"
              : "notice.localDemoAdminReset"
            : response.created
              ? "notice.localDemoReviewerCreated"
              : "notice.localDemoReviewerReset",
      });
      await loadWorkspace();
      navigate(defaultAuthenticatedPath, { replace: true });
    });
  }

  function selectSetupRole(role: "admin" | "reviewer") {
    const profile = localDemoProfiles[role];
    setSetupRole(role);
    setAuthForm((current) => ({
      ...current,
      displayName: profile.displayName,
      email: profile.email,
    }));
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
      setNotice({ key: "notice.invitationAccepted" });
      await loadWorkspace();
      navigate(defaultAuthenticatedPath, { replace: true });
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
      setNotice({ key: "notice.signedIn" });
      await loadWorkspace();
      navigate(defaultAuthenticatedPath, { replace: true });
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
      clearWorkspace();
      setAuthMode("login");
      setNotice({ key: "notice.passwordResetCompleteSignIn" });
      navigate(loginPath, { replace: true });
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
        setNotice({
          key: response.resetToken
            ? "notice.localResetTokenCreated"
            : "notice.passwordResetEmailSent",
        });
        return;
      }

      await confirmPasswordReset({
        token: authForm.resetToken,
        password: authForm.password,
      });
      setAuthMode("login");
      setNotice({ key: "notice.passwordResetComplete" });
      navigate(loginPath, { replace: true });
    });
  }

  async function handleLogout() {
    setSearchOpen(false);
    setSearchQuery("");
    setUserPanelOpen(false);

    await runAction(async () => {
      await logout();
      setUser(null);
      clearWorkspace();
      setNotice({ key: "notice.signedOut" });
      navigate(loginPath, { replace: true });
    });
  }

  async function handleCreateInvitation() {
    setIsBusy(true);
    setError(null);
    setAdminError(null);
    try {
      const response = await createInvitation({
        email: invitationForm.email,
        role: invitationForm.role,
      });
      setCreatedInvitationUrl(response.inviteUrl ?? null);
      setNotice({
        key: response.inviteUrl
          ? "notice.localInvitationCreated"
          : "notice.invitationEmailRequested",
      });
      await loadUserManagement();
    } catch (caught) {
      setAdminError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUploadSelected() {
    const file = uploadInputRef.current?.files?.[0];
    if (!file) {
      setError(t("notice.noFileChosen"));
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
      setNotice({
        key: upload.duplicate ? "notice.duplicateSource" : "notice.sourceUploaded",
      });
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
      setNotice({
        key: "notice.processedLocalJobs",
        values: { count: result.processedCount },
      });
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
      setNotice({ key: status === "approved" ? "notice.recordApproved" : "notice.recordRejected" });
      await loadWorkspace(selectedJobId);
    });
  }

  async function commitApproved() {
    if (!selectedJobId) return;

    await runAction(async () => {
      await commitImportJob(selectedJobId);
      setNotice({ key: "notice.recordsCommitted" });
      await loadWorkspace(selectedJobId);
    });
  }

  async function retrySelectedJob() {
    if (!selectedJobId) return;

    await runAction(async () => {
      const response = await retryImportJob(selectedJobId);
      setNotice({
        key: "notice.importJobStatus",
        values: { status: formatStatus(response.status) },
      });
      await loadWorkspace(selectedJobId);
    });
  }

  async function generateAdvisory() {
    if (!selectedJobId) return;

    await runAction(async () => {
      await generateAiAdvisory(selectedJobId);
      setNotice({ key: "notice.advisoryGenerated" });
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
      setNotice({ key: "notice.advisoryConfirmed" });
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
      setNotice({ key: "notice.advisoryDismissed" });
      await loadWorkspace(selectedJobId);
    });
  }

  if (isLoadingSession) {
    return (
      <AppShell
        actions={<GuestActions />}
        brand="qitu"
        commandLabel={t("command.loadingWorkspace")}
        navigation={navigationModel.primaryNavigation}
        subNavigation={navigationModel.subNavigation}
      >
        <Panel>
          <div className="text-sm text-[var(--qitu-muted)]">{t("loading.session")}</div>
        </Panel>
      </AppShell>
    );
  }

  if (authRoute.kind === "invite") {
    return (
      <AppShell
        actions={<GuestActions />}
        brand="qitu"
        commandLabel={t("auth.acceptInvitation")}
        navigation={navigationModel.primaryNavigation}
        subNavigation={navigationModel.subNavigation}
      >
        <AuthLinkLayout
          badge={t("auth.invitationBadge")}
          description={t("auth.acceptInvitationDescription")}
          notice={noticeText}
          title={t("auth.acceptInvitation")}
        >
          <form className="mt-5 space-y-4" onSubmit={handleInviteAccept}>
            <Field
              label={t("field.displayName")}
              onChange={(value) => setAuthForm((current) => ({ ...current, displayName: value }))}
              value={authForm.displayName}
            />
            <Field
              label={t("auth.password")}
              onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
              type="password"
              value={authForm.password}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button disabled={isBusy} type="submit">
              <ShieldCheck size={15} /> {t("auth.acceptInvitation")}
            </Button>
          </form>
        </AuthLinkLayout>
      </AppShell>
    );
  }

  if (authRoute.kind === "reset") {
    return (
      <AppShell
        actions={<GuestActions />}
        brand="qitu"
        commandLabel={t("action.resetPassword")}
        navigation={navigationModel.primaryNavigation}
        subNavigation={navigationModel.subNavigation}
      >
        <AuthLinkLayout
          badge={t("auth.passwordResetBadge")}
          description={t("auth.resetDescription")}
          notice={noticeText}
          title={t("action.resetPassword")}
        >
          <form className="mt-5 space-y-4" onSubmit={handleRoutePasswordReset}>
            <Field
              label={t("auth.newPassword")}
              onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
              type="password"
              value={authForm.password}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button disabled={isBusy} type="submit">
              <ShieldCheck size={15} /> {t("action.resetPassword")}
            </Button>
          </form>
        </AuthLinkLayout>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell
        actions={<GuestActions />}
        brand="qitu"
        commandLabel={t("command.searchSignedOut")}
        navigation={navigationModel.primaryNavigation}
        subNavigation={navigationModel.subNavigation}
      >
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[1fr_0.8fr]">
          <Panel>
            <div className="flex items-start justify-between gap-4">
              <div>
                <StatusBadge tone="warning">{t("auth.localDemo")}</StatusBadge>
                <h1 className="mt-3 text-xl font-semibold tracking-normal">
                  {t("auth.reviewerAccess")}
                </h1>
              </div>
              <LockKeyhole size={18} className="text-[var(--qitu-green)]" />
            </div>

            <div className="qitu-segment-track mt-6 grid grid-cols-3 gap-2">
              <button
                className={tabClass(authMode === "setup")}
                onClick={() => setAuthMode("setup")}
                type="button"
              >
                {t("auth.setupTab")}
              </button>
              <button
                className={tabClass(authMode === "login")}
                onClick={() => setAuthMode("login")}
                type="button"
              >
                {t("auth.loginTab")}
              </button>
              <button
                className={tabClass(authMode === "reset")}
                onClick={() => setAuthMode("reset")}
                type="button"
              >
                {t("auth.resetTab")}
              </button>
            </div>

            {authMode === "setup" ? (
              <div className="qitu-segment-track mt-3 grid grid-cols-2 gap-2">
                <button
                  className={tabClass(setupRole === "reviewer")}
                  onClick={() => selectSetupRole("reviewer")}
                  type="button"
                >
                  {t("auth.reviewer")}
                </button>
                <button
                  className={tabClass(setupRole === "admin")}
                  onClick={() => selectSetupRole("admin")}
                  type="button"
                >
                  {t("auth.admin")}
                </button>
              </div>
            ) : null}

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
                label={t("field.email")}
                onChange={(value) => setAuthForm((current) => ({ ...current, email: value }))}
                type="email"
                value={authForm.email}
              />
              {authMode === "setup" ? (
                <Field
                  label={t("field.displayName")}
                  onChange={(value) =>
                    setAuthForm((current) => ({ ...current, displayName: value }))
                  }
                  value={authForm.displayName}
                />
              ) : null}
              {authMode === "reset" ? (
                <Field
                  label={t("auth.resetToken")}
                  onChange={(value) =>
                    setAuthForm((current) => ({ ...current, resetToken: value }))
                  }
                  value={authForm.resetToken}
                />
              ) : null}
              <Field
                label={authMode === "reset" ? t("auth.newPassword") : t("auth.password")}
                onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
                type="password"
                value={authForm.password}
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Button disabled={isBusy} type="submit">
                <ShieldCheck size={15} />
                {authMode === "setup"
                  ? setupRole === "admin"
                    ? t("action.useLocalDemoAdmin")
                    : t("action.useLocalDemoReviewer")
                  : authMode === "reset"
                    ? authForm.resetToken
                      ? t("action.resetPassword")
                      : t("action.sendResetEmail")
                    : t("action.login")}
              </Button>
            </form>
          </Panel>

          <Panel>
            <SectionTitle icon={<Activity size={16} />} label={t("auth.protectedWorkspace")} />
            <div className="mt-4 space-y-3">
              <RuntimeRow label={t("auth.routes")} value={t("auth.routesValue")} />
              <RuntimeRow label={t("auth.reviewer")} value="reviewer@example.com" />
              <RuntimeRow label={t("auth.admin")} value="admin@example.com" />
              <RuntimeRow label={t("auth.password")} value={defaultAuthForm.password} />
              <RuntimeRow label={t("common.environment")} value={runtimeEnvironment} />
              <RuntimeRow label={t("common.session")} value={noticeText} />
            </div>
          </Panel>
        </div>
      </AppShell>
    );
  }

  if (route === "reviews") {
    return (
      <>
        <ReviewConsole
          actions={shellActions}
          aiAdvisories={aiAdvisories}
          auditEvents={auditEvents}
          canCommit={canCommit}
          canRetry={canRetry}
          counts={counts}
          error={error}
          importJobEvents={importJobEvents}
          importJobs={importJobs}
          isBusy={isBusy}
          navigation={navigationModel.primaryNavigation}
          notice={noticeText}
          subNavigation={navigationModel.subNavigation}
          onCommand={openSearch}
          onCommitApproved={() => void commitApproved()}
          onConfirmAdvisory={(advisoryId) => void confirmAdvisory(advisoryId)}
          onDecide={(recordId, status) => void decide(recordId, status)}
          onDismissAdvisory={(advisoryId) => void dismissAdvisory(advisoryId)}
          onGenerateAdvisory={() => void generateAdvisory()}
          onProcessLocalQueue={() => void processLocalQueue()}
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
        {shellOverlays}
      </>
    );
  }

  return (
    <>
      <WorkspaceShell
        actions={shellActions}
        navigation={navigationModel.primaryNavigation}
        notice={noticeText}
        subNavigation={navigationModel.subNavigation}
        onCommand={openSearch}
      >
        {route === "overview" ? (
          <OverviewPage
            auditEvents={auditEvents}
            counts={counts}
            importJobs={importJobs}
            onNavigate={(path) => navigate(path)}
            sourceFiles={sourceFiles}
          />
        ) : null}
        {route === "sources" ? (
          <SourcesPage
            importJobs={importJobs}
            isBusy={isBusy}
            onUploadSample={() => void handleUploadSample()}
            onUploadSelected={() => void handleUploadSelected()}
            sourceFiles={sourceFiles}
            uploadInputRef={uploadInputRef}
          />
        ) : null}
        {route === "imports" ? (
          <ImportsPage
            canRetry={canRetry}
            importJobs={importJobs}
            isBusy={isBusy}
            onNavigate={(path) => navigate(path)}
            onProcessLocalQueue={() => void processLocalQueue()}
            onRetrySelectedJob={() => void retrySelectedJob()}
            onSelectJob={(jobId) => void selectJob(jobId)}
            runtimeEnvironment={runtimeEnvironment}
            selectedJobId={selectedJobId}
          />
        ) : null}
        {route === "audit" ? <AuditPage auditEvents={auditEvents} /> : null}
        {route === "users" ? (
          <UsersPage
            adminError={adminError}
            createdInvitationUrl={createdInvitationUrl}
            invitationForm={invitationForm}
            invitations={invitations}
            isBusy={isBusy}
            onCreateInvitation={() => void handleCreateInvitation()}
            onInvitationFormChange={setInvitationForm}
            onRefreshUsers={() => void loadUserManagement()}
            user={user}
            users={users}
          />
        ) : null}
        {route === "account" ? (
          <AccountPage
            notice={noticeText}
            onLogout={() => void handleLogout()}
            runtimeEnvironment={runtimeEnvironment}
            user={user}
          />
        ) : null}
        {route === "not-found" ? (
          <Panel>
            <SectionTitle icon={<Activity size={16} />} label={t("route.notFound")} />
            <div className="mt-4">
              <Button onClick={() => navigate(defaultAuthenticatedPath)}>
                <ShieldCheck size={15} /> {t("action.openReviews")}
              </Button>
            </div>
          </Panel>
        ) : null}
      </WorkspaceShell>
      {shellOverlays}
    </>
  );
}

function WorkspaceShell(props: {
  actions: ReactNode;
  children: ReactNode;
  navigation: AppShellNavItem[];
  notice: string;
  subNavigation: AppShellNavItem[];
  onCommand: () => void;
}) {
  const { t } = useI18n();

  return (
    <AppShell
      actions={props.actions}
      brand="qitu"
      commandLabel={t("command.findSourceJobUserAudit")}
      commandShortcutLabel="Cmd K"
      eyebrow={props.notice}
      navigation={props.navigation}
      subNavigation={props.subNavigation}
      onCommand={props.onCommand}
    >
      {props.children}
    </AppShell>
  );
}

function GuestActions() {
  return (
    <>
      <LanguageSelector className="qitu-topbar-control" compact />
      <ThemeToggleButton className="qitu-topbar-control" compact />
    </>
  );
}

function ShellActions(props: {
  disabled: boolean;
  onOpenUserPanel: () => void;
  onRefresh: () => void;
  user: ApiUser;
}) {
  const { t } = useI18n();
  const displayName = props.user.displayName ?? props.user.email;
  const initial = displayName.slice(0, 1).toUpperCase();
  const userPanelTitle = t("user.openPanel", { name: displayName });

  return (
    <>
      <Button
        aria-label={t("action.refreshWorkspace")}
        className="qitu-topbar-control"
        disabled={props.disabled}
        size="sm"
        title={t("action.refreshWorkspace")}
        variant="ghost"
        onClick={props.onRefresh}
      >
        <RefreshCw size={15} />
        <span className="sr-only">{t("action.refresh")}</span>
      </Button>
      <LanguageSelector className="qitu-topbar-control" compact />
      <ThemeToggleButton className="qitu-topbar-control" compact />
      <Button
        aria-label={userPanelTitle}
        className="qitu-account-trigger"
        size="sm"
        title={userPanelTitle}
        variant="ghost"
        onClick={props.onOpenUserPanel}
      >
        <span className="qitu-avatar-mark size-8 text-[length:var(--qitu-text-label-12)] font-semibold">
          {initial}
        </span>
        <ChevronDown size={14} className="text-[var(--qitu-dim)]" />
      </Button>
    </>
  );
}

function buildSearchEntries(props: {
  auditEvents: AuditEvent[];
  formatBytes: (value: number | null) => string;
  formatStatus: (status: string) => string;
  importJobs: ImportJobListItem[];
  onNavigate: (path: string) => void;
  onSelectJob: (jobId: string) => void;
  roleLabel: (role: string) => string;
  routeEntries: WorkspaceRouteEntry[];
  sourceFiles: SourceFile[];
  t: Translate;
  user: ApiUser | null;
  users: ApiUser[];
}): SearchEntry[] {
  const entries: SearchEntry[] = props.routeEntries.map((entry) => ({
    description: entry.description,
    group: entry.group,
    id: `route:${entry.path}`,
    label: entry.label,
    onSelect: () => props.onNavigate(entry.path),
  }));

  if (props.user) {
    entries.push({
      description: props.t("search.accountDescription", {
        role: props.roleLabel(props.user.role),
      }),
      group: props.t("nav.account"),
      id: `account:${props.user.id}`,
      label: props.user.email,
      onSelect: () => props.onNavigate("/account"),
    });
  }

  for (const file of props.sourceFiles.slice(0, 8)) {
    entries.push({
      description:
        file.size === null
          ? props.t("search.sourceDescription")
          : props.t("search.sourceDescriptionWithSize", { size: props.formatBytes(file.size) }),
      group: props.t("search.sourcesGroup"),
      id: `source:${file.id}`,
      label: file.filename,
      onSelect: () => props.onNavigate("/sources"),
    });
  }

  for (const job of props.importJobs.slice(0, 8)) {
    entries.push({
      description: props.t("search.importDescription", {
        status: props.formatStatus(job.status),
      }),
      group: props.t("nav.imports"),
      id: `job:${job.id}`,
      label: job.sourceFile.filename,
      onSelect: () => {
        props.onNavigate("/imports");
        props.onSelectJob(job.id);
      },
    });
  }

  for (const apiUser of props.users.slice(0, 8)) {
    entries.push({
      description: props.t("search.userDescription", {
        role: props.roleLabel(apiUser.role),
      }),
      group: props.t("search.usersGroup"),
      id: `user:${apiUser.id}`,
      label: apiUser.email,
      onSelect: () => props.onNavigate("/users"),
    });
  }

  for (const event of props.auditEvents.slice(0, 8)) {
    entries.push({
      description: `${event.subject.kind}:${event.subject.id}`,
      group: props.t("search.auditGroup"),
      id: `audit:${event.id}`,
      label: event.action,
      onSelect: () => props.onNavigate("/audit"),
    });
  }

  return entries;
}

function readRouteMemory(): RouteMemory {
  try {
    const raw = window.sessionStorage.getItem(routeMemoryStorageKey);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Partial<Record<AppPrimaryRoute, string>>;
    const memory: RouteMemory = {};
    for (const primaryRoute of primaryRoutes) {
      const route = parsed[primaryRoute];
      if (route && isWorkspaceRouteName(route)) {
        memory[primaryRoute] = route;
      }
    }

    return memory;
  } catch {
    return {};
  }
}

function writeRouteMemory(memory: RouteMemory) {
  window.sessionStorage.setItem(routeMemoryStorageKey, JSON.stringify(memory));
}

const primaryRoutes: AppPrimaryRoute[] = ["workbench", "intake", "governance", "account"];
const workspaceRouteNames: WorkspaceAppRoute[] = [
  "overview",
  "sources",
  "imports",
  "reviews",
  "audit",
  "users",
  "account",
];

function isWorkspaceRouteName(route: string): route is WorkspaceAppRoute {
  return workspaceRouteNames.includes(route as WorkspaceAppRoute);
}

function canManageUsers(user: ApiUser): boolean {
  return user.role === "owner" || user.role === "admin";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed.";
}
