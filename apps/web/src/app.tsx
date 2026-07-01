import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { minimumPasswordLength } from "@qitu/auth";
import type { ChartDatum } from "@qitu/charts";
import {
  AnimatedIcon,
  AppShell,
  Button,
  QituMark,
  StatusBadge,
  Surface,
  type AppShellNavItem,
} from "@qitu/ui";
import { ChevronDown } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  acceptInvitation,
  bootstrapLocalAdmin,
  approveStagedRecord,
  bootstrapLocalReviewer,
  commitImportJob,
  confirmAiAdvisory,
  confirmPendingStagedRecords,
  confirmPasswordReset,
  createInvitation,
  deleteInvitation,
  deleteUser,
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
  resendInvitation,
  revokeInvitation,
  retryImportJob,
  uploadSourceFile,
} from "./api";
import {
  auditFilterQuery,
  defaultAuditFilters,
  hasAuditFilters,
  type AuditFilters,
} from "./audit-filters";
import {
  type AppNavigationPath,
  appRouteFromPath,
  defaultAuthenticatedPath,
  isProtectedRoute,
  loginPath,
  routePath,
  type AppRoute,
} from "./app-routes";
import { authRouteFromPath } from "./auth-route";
import {
  type AppNavigationModel,
  buildNavigation,
  ErrorText,
  Field,
  Panel,
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
import { createUploadQueueEntries } from "./upload-queue-state";
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
  UploadQueueEntry,
} from "./types";
import { buildWebPermissions, defaultWebPermissions, type WebPermissions } from "./web-permissions";
import { AccountPage, AuditPage, ImportsPage, SourcesPage, UsersPage } from "./workspace-pages";
import { WorkspaceHomeSlot } from "./workspace-home";

const defaultAuthForm = {
  email: "",
  displayName: "",
  password: "",
  resetToken: "",
};
const localDemoPassword = "correct horse battery staple";

const defaultInvitationForm = {
  email: "new-user@example.com",
  role: "viewer",
};

type NoticeDescriptor = {
  key: MessageKey;
  values?: Record<string, number | string>;
};
type WorkspaceReviewCounts = {
  approvedForCommit: number;
  failed: number;
  reviewQueue: number;
};
type SessionBootstrap = {
  runtimeEnvironment: string | null;
  user: ApiUser | null;
};

let sessionBootstrapCache: SessionBootstrap | null = null;
let sessionBootstrapPromise: Promise<SessionBootstrap> | null = null;

const localDemoProfiles = {
  admin: {
    displayName: "Admin",
    email: "admin@example.com",
  },
  reviewer: {
    displayName: "Operator",
    email: "reviewer@example.com",
  },
} as const;

function loadSessionBootstrap(): Promise<SessionBootstrap> {
  if (sessionBootstrapCache) {
    return Promise.resolve(sessionBootstrapCache);
  }

  sessionBootstrapPromise ??= Promise.all([health().catch(() => null), me()])
    .then(([runtime, session]) => {
      const snapshot = {
        runtimeEnvironment: runtime?.environment ?? null,
        user: session.user,
      };
      sessionBootstrapCache = snapshot;
      return snapshot;
    })
    .finally(() => {
      sessionBootstrapPromise = null;
    });

  return sessionBootstrapPromise;
}

function resetSessionBootstrap(): void {
  sessionBootstrapCache = null;
  sessionBootstrapPromise = null;
}

function selectedJobDataNeededForRoute(route: AppRoute): boolean {
  return route === "reviews" || route === "imports";
}

export function App() {
  const { formatBytes, formatStatus, roleLabel, t } = useI18n();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const loadedJobDataIdRef = useRef<string | null>(null);
  const loadingJobDataIdRef = useRef<string | null>(null);
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [authMode, setAuthMode] = useState<"login" | "setup" | "reset">("login");
  const [setupRole, setSetupRole] = useState<"admin" | "reviewer">("reviewer");
  const authRoute = useMemo(() => authRouteFromPath(location.pathname), [location.pathname]);
  const route = useMemo(() => appRouteFromPath(location.pathname), [location.pathname]);
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
  const [uploadQueue, setUploadQueue] = useState<UploadQueueEntry[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJobListItem[]>([]);
  const [importJobEvents, setImportJobEvents] = useState<ImportJobEvent[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditPageEvents, setAuditPageEvents] = useState<AuditEvent[]>([]);
  const [auditFilters, setAuditFilters] = useState<AuditFilters>(defaultAuditFilters);
  const [auditFilterDraft, setAuditFilterDraft] = useState<AuditFilters>(defaultAuditFilters);
  const [selectedAuditEventId, setSelectedAuditEventId] = useState<string | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [hasLoadedUserManagement, setHasLoadedUserManagement] = useState(false);
  const [isLoadingUserManagement, setIsLoadingUserManagement] = useState(false);
  const [invitationForm, setInvitationForm] = useState(defaultInvitationForm);
  const [createdInvitationUrl, setCreatedInvitationUrl] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [reviewRecords, setReviewRecords] = useState<StagedRecord[]>([]);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [aiAdvisories, setAiAdvisories] = useState<AiAdvisoryArtifact[]>([]);
  const permissions = useMemo<WebPermissions>(() => {
    return user ? buildWebPermissions(user) : defaultWebPermissions;
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const session = await loadSessionBootstrap();
        if (cancelled) return;
        if (session.runtimeEnvironment) {
          setRuntimeEnvironment(session.runtimeEnvironment);
        }
        setUser(session.user);
        if (session.user) {
          await loadWorkspace(undefined, {
            loadSelectedJobData: selectedJobDataNeededForRoute(route),
            updateReviewNotice: route === "reviews",
          });
          if (cancelled) return;
          setNotice({
            key: selectedJobDataNeededForRoute(route)
              ? "notice.reviewQueueReady"
              : "notice.workspaceReady",
          });
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
    if (isLoadingSession || authRoute.kind !== "home") return;

    if (!user && isProtectedRoute(route)) {
      navigate(loginPath, { replace: true });
      return;
    }

    if (user && location.pathname === "/") {
      navigate(defaultAuthenticatedPath, { replace: true });
      return;
    }

    if (user && route === "login") {
      navigate(defaultAuthenticatedPath, { replace: true });
    }
  }, [authRoute.kind, isLoadingSession, location.pathname, route, user]);

  useEffect(() => {
    if (route !== "users" || !user || !permissions.canManageUsers) return;
    void loadUserManagement();
  }, [permissions.canManageUsers, route, user]);

  useEffect(() => {
    if (!user || !selectedJobId || !selectedJobDataNeededForRoute(route)) return;
    if (loadedJobDataIdRef.current === selectedJobId) return;

    void runAction(async () => {
      await loadReview(selectedJobId, {
        updateNotice: route === "reviews",
      });
    });
  }, [route, selectedJobId, user]);

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
  const workspaceReviewCounts = useMemo<WorkspaceReviewCounts>(() => {
    return importJobs.reduce(
      (accumulator, job) => {
        if (job.status === "needs_review") accumulator.reviewQueue += 1;
        if (job.status === "approved") accumulator.approvedForCommit += 1;
        if (job.status === "failed") accumulator.failed += 1;
        return accumulator;
      },
      {
        approvedForCommit: 0,
        failed: 0,
        reviewQueue: 0,
      },
    );
  }, [importJobs]);
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
  const retryAvailable = Boolean(selectedJobId && selectedJob?.status === "failed");
  const canCommit = Boolean(selectedJobId && counts.approved > 0 && permissions.canCommitImports);
  const canRetry = Boolean(retryAvailable && permissions.canRetryImports);
  const isInitialUserManagementLoad = Boolean(
    route === "users" && permissions.canManageUsers && !hasLoadedUserManagement,
  );
  const noticeText = t(notice.key, notice.values);
  const navigationModel = useMemo<AppNavigationModel>(
    () =>
      buildNavigation(route, {
        authenticated: Boolean(user),
        canManageUsers: permissions.canManageUsers,
        onNavigate: (path) => navigate(path),
        t,
      }),
    [permissions.canManageUsers, route, t, user],
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
        canManageUsers={permissions.canManageUsers}
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
  const localSetupAvailable = runtimeEnvironment === "local";

  useEffect(() => {
    if (!localSetupAvailable && authMode === "setup") {
      setAuthMode("login");
    }
  }, [authMode, localSetupAvailable]);

  function navigate(path: AppNavigationPath, options: { replace?: boolean } = {}) {
    if (location.pathname === path) return;

    const navigateOptions =
      options.replace === undefined ? { to: path } : { replace: options.replace, to: path };

    void routerNavigate(navigateOptions);
  }

  function openSearch() {
    setSearchOpen(true);
    setUserPanelOpen(false);
  }

  function toggleUserPanel() {
    setUserPanelOpen((current) => !current);
    setSearchOpen(false);
  }

  async function loadWorkspace(
    preferredJobId?: string,
    options: {
      loadSelectedJobData?: boolean;
      updateReviewNotice?: boolean;
    } = {},
  ) {
    const loadSelectedJobData = options.loadSelectedJobData ?? true;
    const updateReviewNotice = options.updateReviewNotice ?? true;
    const [sourceFileResponse, importJobResponse, auditResponse] = await Promise.all([
      listSourceFiles({ limit: 20 }),
      listImportJobs({ limit: 20 }),
      listAuditEvents({ limit: 20 }),
    ]);

    setSourceFiles(sourceFileResponse.sourceFiles);
    setImportJobs(importJobResponse.importJobs);
    setAuditEvents(auditResponse.auditEvents);
    if (!hasAuditFilters(auditFilters)) {
      setAuditPageEvents(auditResponse.auditEvents);
      setSelectedAuditEventId((current) =>
        current && auditResponse.auditEvents.some((event) => event.id === current)
          ? current
          : (auditResponse.auditEvents[0]?.id ?? null),
      );
    }

    const nextJobId =
      preferredJobId ?? selectedJobId ?? importJobResponse.importJobs[0]?.id ?? null;
    setSelectedJobId(nextJobId);

    if (nextJobId && loadSelectedJobData) {
      await loadReview(nextJobId, { updateNotice: updateReviewNotice });
    } else {
      loadedJobDataIdRef.current = null;
      setReviewRecords([]);
      setReviewIssues([]);
      setAiAdvisories([]);
      setImportJobEvents([]);
    }
  }

  async function loadAuditPageEvents(filters: AuditFilters) {
    const response = await listAuditEvents({
      ...auditFilterQuery(filters),
      limit: 50,
    });
    setAuditPageEvents(response.auditEvents);
    setSelectedAuditEventId(response.auditEvents[0]?.id ?? null);
  }

  async function handleApplyAuditFilters() {
    await runAction(async () => {
      setAuditFilters(auditFilterDraft);
      await loadAuditPageEvents(auditFilterDraft);
      setNotice({ key: "notice.auditFiltersApplied" });
    });
  }

  async function handleClearAuditFilters() {
    await runAction(async () => {
      setAuditFilters(defaultAuditFilters);
      setAuditFilterDraft(defaultAuditFilters);
      await loadAuditPageEvents(defaultAuditFilters);
      setNotice({ key: "notice.auditFiltersCleared" });
    });
  }

  async function handleRefreshWorkspace() {
    await runAction(async () => {
      await loadWorkspace(undefined, {
        loadSelectedJobData: selectedJobDataNeededForRoute(route),
        updateReviewNotice: route === "reviews",
      });
      if (route === "users") {
        await loadUserManagement();
      }
      if (route === "audit") {
        await loadAuditPageEvents(auditFilters);
      }
      setNotice({ key: "notice.workspaceRefreshed" });
    });
  }

  async function loadUserManagement() {
    if (!user || !permissions.canManageUsers) return;

    setIsLoadingUserManagement(true);
    setAdminError(null);
    try {
      const [userResponse, invitationResponse] = await Promise.all([
        listUsers({ limit: 50 }),
        listInvitations({ limit: 50 }),
      ]);
      setUsers(userResponse.users);
      setInvitations(invitationResponse.invitations);
      setHasLoadedUserManagement(true);
    } catch (caught) {
      setAdminError(errorMessage(caught));
      setHasLoadedUserManagement(true);
    } finally {
      setIsLoadingUserManagement(false);
    }
  }

  async function loadReview(
    jobId: string,
    options: {
      updateNotice?: boolean;
    } = {},
  ) {
    if (loadingJobDataIdRef.current === jobId) return;
    loadingJobDataIdRef.current = jobId;
    const updateNotice = options.updateNotice ?? true;
    try {
      const [reviewResult, advisoryResult, eventResult] = await Promise.allSettled([
        getImportJobReview(jobId),
        listAiAdvisories(jobId),
        listImportJobEvents(jobId, { limit: 30 }),
      ]);

      if (eventResult.status === "fulfilled") {
        setImportJobEvents(eventResult.value.events);
      } else {
        setImportJobEvents([]);
        if (!String(eventResult.reason).includes("404")) {
          setError(errorMessage(eventResult.reason));
        }
      }

      if (advisoryResult.status === "fulfilled") {
        setAiAdvisories(advisoryResult.value.advisories);
      } else {
        setAiAdvisories([]);
      }

      if (reviewResult.status === "fulfilled") {
        const review = reviewResult.value;
        setReviewRecords(review.records);
        setReviewIssues(review.issues);
        loadedJobDataIdRef.current = jobId;
        if (updateNotice) {
          setNotice({
            key: "notice.reviewLoaded",
            values: { filename: review.job.sourceFile.filename },
          });
        }
        return;
      }

      loadedJobDataIdRef.current = null;
      setReviewRecords([]);
      setReviewIssues([]);
      if (updateNotice) {
        setNotice({ key: "notice.reviewWaiting" });
      }
      if (!String(reviewResult.reason).includes("404")) {
        setError(errorMessage(reviewResult.reason));
      }
    } finally {
      if (loadingJobDataIdRef.current === jobId) {
        loadingJobDataIdRef.current = null;
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
    setAuditPageEvents([]);
    setAuditFilters(defaultAuditFilters);
    setAuditFilterDraft(defaultAuditFilters);
    setSelectedAuditEventId(null);
    setUsers([]);
    setInvitations([]);
    setHasLoadedUserManagement(false);
    setIsLoadingUserManagement(false);
    setCreatedInvitationUrl(null);
    setReviewRecords([]);
    setReviewIssues([]);
    setAiAdvisories([]);
    setUploadQueue([]);
    setImportJobEvents([]);
    setSelectedJobId(null);
    loadedJobDataIdRef.current = null;
    loadingJobDataIdRef.current = null;
  }

  async function handleLocalSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const policyError = passwordPolicyError(authForm.password, t);
    if (policyError) {
      setError(policyError);
      return;
    }

    await runAction(async () => {
      const bootstrapDemoUser =
        setupRole === "admin" ? bootstrapLocalAdmin : bootstrapLocalReviewer;
      const response = await bootstrapDemoUser({
        email: authForm.email,
        password: authForm.password,
        ...(authForm.displayName ? { displayName: authForm.displayName } : {}),
      });
      resetSessionBootstrap();
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
      password: current.password || localDemoPassword,
    }));
  }

  function selectAuthMode(mode: "login" | "setup" | "reset") {
    if (mode === "setup" && !localSetupAvailable) {
      return;
    }

    setAuthMode(mode);
    if (mode === "setup") {
      const profile = localDemoProfiles[setupRole];
      setAuthForm((current) => ({
        ...current,
        displayName: profile.displayName,
        email: profile.email,
        password: current.password || localDemoPassword,
        resetToken: "",
      }));
    }
  }

  async function handleInviteAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authRoute.kind !== "invite") return;
    const policyError = passwordPolicyError(authForm.password, t);
    if (policyError) {
      setError(policyError);
      return;
    }

    await runAction(async () => {
      const accepted = await acceptInvitation({
        token: authRoute.token,
        password: authForm.password,
        ...(authForm.displayName ? { displayName: authForm.displayName } : {}),
      });
      resetSessionBootstrap();
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
      resetSessionBootstrap();
      setUser(response.user);
      setNotice({ key: "notice.signedIn" });
      await loadWorkspace();
      navigate(defaultAuthenticatedPath, { replace: true });
    });
  }

  async function handleRoutePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authRoute.kind !== "reset") return;
    const policyError = passwordPolicyError(authForm.password, t);
    if (policyError) {
      setError(policyError);
      return;
    }

    await runAction(async () => {
      await confirmPasswordReset({
        token: authRoute.token,
        password: authForm.password,
      });
      resetSessionBootstrap();
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

      const policyError = passwordPolicyError(authForm.password, t);
      if (policyError) {
        setError(policyError);
        return;
      }

      await confirmPasswordReset({
        token: authForm.resetToken,
        password: authForm.password,
      });
      resetSessionBootstrap();
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
      resetSessionBootstrap();
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
        key:
          response.emailDelivery?.status === "failed"
            ? "notice.invitationEmailFailed"
            : response.inviteUrl
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

  async function handleResendInvitation(invitationId: string) {
    setIsBusy(true);
    setError(null);
    setAdminError(null);
    try {
      const response = await resendInvitation(invitationId);
      setCreatedInvitationUrl(response.inviteUrl ?? null);
      setNotice({
        key:
          response.emailDelivery?.status === "failed"
            ? "notice.invitationEmailFailed"
            : response.inviteUrl
              ? "notice.localInvitationCreated"
              : "notice.invitationResent",
      });
      await loadUserManagement();
    } catch (caught) {
      setAdminError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    setIsBusy(true);
    setError(null);
    setAdminError(null);
    try {
      await revokeInvitation(invitationId);
      setCreatedInvitationUrl(null);
      setNotice({ key: "notice.invitationRevoked" });
      await loadUserManagement();
    } catch (caught) {
      setAdminError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteInvitation(invitationId: string) {
    setIsBusy(true);
    setError(null);
    setAdminError(null);
    try {
      await deleteInvitation(invitationId);
      setCreatedInvitationUrl(null);
      setNotice({ key: "notice.invitationDeleted" });
      await loadUserManagement();
    } catch (caught) {
      setAdminError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    setIsBusy(true);
    setError(null);
    setAdminError(null);
    try {
      await deleteUser(userId);
      setNotice({ key: "notice.userDeleted" });
      await loadUserManagement();
    } catch (caught) {
      setAdminError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  function handleUploadFilesSelected(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    setUploadQueue((current) => [...current, ...createUploadQueueEntries(selectedFiles)]);
    setNotice({
      key: "notice.filesQueued",
      values: { count: String(selectedFiles.length) },
    });
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  }

  async function handleUploadSelected() {
    const queued = uploadQueue.filter((item) => item.status === "queued");
    if (queued.length > 0) {
      await uploadQueueEntries(queued);
      return;
    }

    const selectedFiles = Array.from(uploadInputRef.current?.files ?? []);
    if (selectedFiles.length === 0) {
      setError(t("notice.noFileChosen"));
      return;
    }

    const entries = createUploadQueueEntries(selectedFiles);
    setUploadQueue((current) => [...current, ...entries]);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
    await uploadQueueEntries(entries);
  }

  async function handleUploadSample() {
    const file = new File(["label,value\nSample Record,1.1992\n"], `sample-${Date.now()}.txt`, {
      type: "text/plain",
    });
    const entries = createUploadQueueEntries([file]);
    setUploadQueue((current) => [...current, ...entries]);
    await uploadQueueEntries(entries);
  }

  async function retryUploadItem(itemId: string) {
    const item = uploadQueue.find((entry) => entry.id === itemId);
    if (!item) return;
    await uploadQueueEntries([item]);
  }

  function removeUploadItem(itemId: string) {
    setUploadQueue((current) => current.filter((item) => item.id !== itemId));
  }

  async function uploadQueueEntries(entries: UploadQueueEntry[]) {
    setIsBusy(true);
    setError(null);

    let lastImportJobId: string | null = null;
    let duplicateCount = 0;
    let failedCount = 0;
    let uploadedCount = 0;
    const completedEntryIds: string[] = [];

    try {
      for (const entry of entries) {
        updateUploadQueueEntry(entry.id, {
          error: undefined,
          status: "uploading",
        });

        try {
          const upload = await uploadSourceFile({
            file: entry.file,
            workspaceId: "default",
          });
          lastImportJobId = upload.importJobId;
          completedEntryIds.push(entry.id);
          uploadedCount += 1;
          if (upload.duplicate) duplicateCount += 1;
          updateUploadQueueEntry(entry.id, {
            importJobId: upload.importJobId,
            status: upload.duplicate ? "duplicate" : "uploaded",
          });
        } catch (caught) {
          failedCount += 1;
          updateUploadQueueEntry(entry.id, {
            error: errorMessage(caught),
            status: "failed",
          });
        }
      }

      if (lastImportJobId) {
        await loadWorkspace(lastImportJobId);
      }

      if (completedEntryIds.length > 0) {
        const completedEntryIdSet = new Set(completedEntryIds);
        setUploadQueue((current) => current.filter((item) => !completedEntryIdSet.has(item.id)));
      }

      if (failedCount > 0) {
        setError(t("notice.uploadBatchFailed", { count: String(failedCount) }));
      }
      if (uploadedCount > 0) {
        setNotice({
          key:
            duplicateCount > 0 && duplicateCount === uploadedCount
              ? "notice.duplicateSource"
              : "notice.sourceUploaded",
        });
      }
    } finally {
      setIsBusy(false);
    }
  }

  function updateUploadQueueEntry(
    itemId: string,
    patch: Partial<Omit<UploadQueueEntry, "file" | "id">>,
  ) {
    setUploadQueue((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  }

  async function selectJob(jobId: string) {
    setSelectedJobId(jobId);
    await runAction(async () => {
      await loadReview(jobId);
    });
  }

  async function openReviewForJob(jobId: string) {
    setSelectedJobId(jobId);
    navigate(routePath("reviews"));
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

  async function confirmPendingRecords() {
    if (!selectedJobId) return;

    const pendingRecords = reviewRecords.filter((record) => record.reviewStatus === "pending");
    if (pendingRecords.length === 0) return;

    await runAction(async () => {
      const response = await confirmPendingStagedRecords({
        jobId: selectedJobId,
        note: "Confirmed in web console.",
      });
      const updatedRecords = new Map(response.records.map((record) => [record.id, record]));

      setReviewRecords((current) =>
        current.map((record) => updatedRecords.get(record.id) ?? record),
      );
      setNotice({
        key: "notice.recordsConfirmed",
        values: { count: String(response.confirmedCount) },
      });
      await loadWorkspace(selectedJobId);
    });
  }

  async function confirmSourceJobs(jobIds: string[]) {
    const uniqueJobIds = [...new Set(jobIds)];
    if (uniqueJobIds.length === 0) return;

    await runAction(async () => {
      let confirmedCount = 0;
      for (const jobId of uniqueJobIds) {
        const response = await confirmPendingStagedRecords({
          jobId,
          note: "Confirmed from source list.",
        });
        confirmedCount += response.confirmedCount;
      }

      setNotice({
        key: "notice.sourceJobsConfirmed",
        values: {
          count: String(uniqueJobIds.length),
          records: String(confirmedCount),
        },
      });
      await loadWorkspace(uniqueJobIds.at(-1), {
        loadSelectedJobData: selectedJobDataNeededForRoute(route),
        updateReviewNotice: route === "reviews",
      });
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

  async function commitSourceJobs(jobIds: string[]) {
    const uniqueJobIds = [...new Set(jobIds)];
    if (uniqueJobIds.length === 0) return;

    await runAction(async () => {
      for (const jobId of uniqueJobIds) {
        await commitImportJob(jobId);
      }

      setNotice({
        key: "notice.sourceJobsCommitted",
        values: { count: String(uniqueJobIds.length) },
      });
      await loadWorkspace(uniqueJobIds.at(-1), {
        loadSelectedJobData: selectedJobDataNeededForRoute(route),
        updateReviewNotice: route === "reviews",
      });
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

  if (authRoute.kind === "home" && isProtectedRoute(route) && (isLoadingSession || !user)) {
    return <ProtectedWorkspaceLoading notice={noticeText} route={route} />;
  }

  if (isLoadingSession) {
    return (
      <AuthPageFrame eyebrow={t("auth.secureAccess")} notice={noticeText}>
        <div className="qitu-auth-card">
          <StatusBadge tone="info">{t("loading.session")}</StatusBadge>
          <h1 className="qitu-auth-card-title">{t("auth.loadingTitle")}</h1>
          <p className="qitu-auth-card-copy">{t("auth.loadingDescription")}</p>
          <div className="qitu-auth-skeleton-stack" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </AuthPageFrame>
    );
  }

  if (authRoute.kind === "invite") {
    return (
      <AuthPageFrame eyebrow={t("auth.invitationBadge")} notice={noticeText}>
        <div className="qitu-auth-card">
          <AuthCardHeader
            badge={t("auth.invitationBadge")}
            description={t("auth.acceptInvitationDescription")}
            title={t("auth.acceptInvitation")}
          />
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
              <AnimatedIcon name="audit" size={15} /> {t("auth.acceptInvitation")}
            </Button>
          </form>
        </div>
      </AuthPageFrame>
    );
  }

  if (authRoute.kind === "reset") {
    return (
      <AuthPageFrame eyebrow={t("auth.passwordResetBadge")} notice={noticeText}>
        <div className="qitu-auth-card">
          <AuthCardHeader
            badge={t("auth.passwordResetBadge")}
            description={t("auth.resetDescription")}
            title={t("action.resetPassword")}
          />
          <form className="mt-5 space-y-4" onSubmit={handleRoutePasswordReset}>
            <Field
              label={t("auth.newPassword")}
              onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
              type="password"
              value={authForm.password}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button disabled={isBusy} type="submit">
              <AnimatedIcon name="audit" size={15} /> {t("action.resetPassword")}
            </Button>
          </form>
        </div>
      </AuthPageFrame>
    );
  }

  if (!user) {
    return (
      <AuthPageFrame eyebrow={t("auth.secureAccess")} notice={noticeText}>
        <div className="qitu-auth-card">
          <AuthCardHeader
            badge={t("auth.protectedWorkspace")}
            description={t("auth.loginDescription")}
            title={t("auth.loginTitle")}
          />

          <div
            className={`qitu-segment-track mt-6 grid gap-2 ${
              localSetupAvailable ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <button
              className={tabClass(authMode === "login")}
              onClick={() => selectAuthMode("login")}
              type="button"
            >
              {t("auth.loginTab")}
            </button>
            <button
              className={tabClass(authMode === "reset")}
              onClick={() => selectAuthMode("reset")}
              type="button"
            >
              {t("auth.resetTab")}
            </button>
            {localSetupAvailable ? (
              <button
                className={tabClass(authMode === "setup")}
                onClick={() => selectAuthMode("setup")}
                type="button"
              >
                {t("auth.setupTab")}
              </button>
            ) : null}
          </div>

          {authMode === "setup" && localSetupAvailable ? (
            <div className="mt-4">
              <div className="mb-3 flex items-center gap-2">
                <StatusBadge tone="warning">{t("auth.localDemo")}</StatusBadge>
                <span className="text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
                  {t("auth.localDemoDescription")}
                </span>
              </div>
              <div className="qitu-segment-track grid grid-cols-2 gap-2">
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
            </div>
          ) : null}

          <form
            className="mt-5 space-y-4"
            onSubmit={
              authMode === "setup" && localSetupAvailable
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
            {authMode === "setup" && localSetupAvailable ? (
              <Field
                label={t("field.displayName")}
                onChange={(value) => setAuthForm((current) => ({ ...current, displayName: value }))}
                value={authForm.displayName}
              />
            ) : null}
            {authMode === "reset" ? (
              <Field
                label={t("auth.resetToken")}
                onChange={(value) => setAuthForm((current) => ({ ...current, resetToken: value }))}
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
            <Button className="w-full" disabled={isBusy} size="lg" type="submit">
              <AnimatedIcon name={authMode === "login" ? "login" : "audit"} size={15} />
              {authMode === "setup" && localSetupAvailable
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
        </div>
      </AuthPageFrame>
    );
  }

  if (route === "reviews") {
    return (
      <>
        <ReviewConsole
          actions={shellActions}
          aiAdvisories={aiAdvisories}
          auditEvents={auditEvents}
          canDecideReviews={permissions.canDecideReviews}
          canCommit={canCommit}
          canProcessImports={permissions.canProcessImports}
          canRetry={canRetry}
          canUploadSources={permissions.canUploadSources}
          canWriteAiAdvisories={permissions.canWriteAiAdvisories}
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
          onConfirmPendingRecords={() => void confirmPendingRecords()}
          onConfirmAdvisory={(advisoryId) => void confirmAdvisory(advisoryId)}
          onDecide={(recordId, status) => void decide(recordId, status)}
          onDismissAdvisory={(advisoryId) => void dismissAdvisory(advisoryId)}
          onGenerateAdvisory={() => void generateAdvisory()}
          onProcessLocalQueue={() => void processLocalQueue()}
          onRemoveUploadItem={removeUploadItem}
          onRetrySelectedJob={() => void retrySelectedJob()}
          onRetryUploadItem={(itemId) => void retryUploadItem(itemId)}
          onSelectJob={(jobId) => void selectJob(jobId)}
          onUploadFilesSelected={handleUploadFilesSelected}
          onUploadSample={() => void handleUploadSample()}
          onUploadSelected={() => void handleUploadSelected()}
          reviewIssues={reviewIssues}
          reviewRecords={reviewRecords}
          reviewTrend={reviewTrend}
          runtimeEnvironment={runtimeEnvironment}
          retryAvailable={retryAvailable}
          selectedJob={selectedJob}
          selectedJobId={selectedJobId}
          sourceFiles={sourceFiles}
          uploadQueue={uploadQueue}
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
        error={error}
        navigation={navigationModel.primaryNavigation}
        notice={noticeText}
        subNavigation={navigationModel.subNavigation}
        onCommand={openSearch}
      >
        {route === "overview" ? (
          <WorkspaceHomeSlot
            importJobs={importJobs}
            onNavigate={(path) => navigate(path)}
            sourceFiles={sourceFiles}
            workspaceReviewCounts={workspaceReviewCounts}
          />
        ) : null}
        {route === "sources" ? (
          <SourcesPage
            canCommitImports={permissions.canCommitImports}
            canDecideReviews={permissions.canDecideReviews}
            canUploadSources={permissions.canUploadSources}
            importJobs={importJobs}
            isBusy={isBusy}
            onCommitSourceJobs={(jobIds) => void commitSourceJobs(jobIds)}
            onConfirmSourceJobs={(jobIds) => void confirmSourceJobs(jobIds)}
            onRemoveUploadItem={removeUploadItem}
            onRetryUploadItem={(itemId) => void retryUploadItem(itemId)}
            onUploadFilesSelected={handleUploadFilesSelected}
            onUploadSample={() => void handleUploadSample()}
            onUploadSelected={() => void handleUploadSelected()}
            sourceFiles={sourceFiles}
            uploadQueue={uploadQueue}
            uploadInputRef={uploadInputRef}
          />
        ) : null}
        {route === "imports" ? (
          <ImportsPage
            canProcessImports={permissions.canProcessImports}
            canRetry={canRetry}
            importJobEvents={importJobEvents}
            importJobs={importJobs}
            isBusy={isBusy}
            retryAvailable={retryAvailable}
            onProcessLocalQueue={() => void processLocalQueue()}
            onOpenReview={(jobId) => void openReviewForJob(jobId)}
            onRetrySelectedJob={() => void retrySelectedJob()}
            onSelectJob={(jobId) => void selectJob(jobId)}
            runtimeEnvironment={runtimeEnvironment}
            selectedJob={selectedJob}
            selectedJobId={selectedJobId}
            sourceFiles={sourceFiles}
          />
        ) : null}
        {route === "audit" ? (
          <AuditPage
            auditEvents={auditPageEvents}
            filters={auditFilterDraft}
            isBusy={isBusy}
            selectedEventId={selectedAuditEventId}
            onApplyFilters={() => void handleApplyAuditFilters()}
            onClearFilters={() => void handleClearAuditFilters()}
            onFiltersChange={setAuditFilterDraft}
            onSelectEvent={setSelectedAuditEventId}
          />
        ) : null}
        {route === "users" ? (
          <UsersPage
            adminError={adminError}
            canManageUsers={permissions.canManageUsers}
            createdInvitationUrl={createdInvitationUrl}
            invitationForm={invitationForm}
            invitations={invitations}
            isBusy={isBusy || isLoadingUserManagement}
            isLoading={isInitialUserManagementLoad}
            onCreateInvitation={() => void handleCreateInvitation()}
            onDeleteInvitation={(invitationId) => void handleDeleteInvitation(invitationId)}
            onDeleteUser={(userId) => void handleDeleteUser(userId)}
            onInvitationFormChange={setInvitationForm}
            onRefreshUsers={() => void loadUserManagement()}
            onResendInvitation={(invitationId) => void handleResendInvitation(invitationId)}
            onRevokeInvitation={(invitationId) => void handleRevokeInvitation(invitationId)}
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
            <SectionTitle
              icon={<AnimatedIcon name="activity" size={16} />}
              label={t("route.notFound")}
            />
            <div className="mt-4">
              <Button onClick={() => navigate(defaultAuthenticatedPath)}>
                <AnimatedIcon name="workbench" size={15} /> {t("action.openWorkspace")}
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
  error: string | null;
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
      {props.error ? (
        <Surface className="mb-[var(--qitu-layout-gutter)] p-[var(--qitu-space-s1)]">
          <StatusBadge tone="danger">{t("error.requestFailed")}</StatusBadge>
          <div className="mt-3 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-red)]">
            {props.error}
          </div>
        </Surface>
      ) : null}
      {props.children}
    </AppShell>
  );
}

function ProtectedWorkspaceLoading(props: { notice: string; route: AppRoute }) {
  const { t } = useI18n();
  const navigationModel = useMemo<AppNavigationModel>(
    () =>
      buildNavigation(props.route, {
        authenticated: true,
        canManageUsers: true,
        onNavigate: () => undefined,
        t,
      }),
    [props.route, t],
  );

  return (
    <AppShell
      actions={<WorkspaceLoadingActions />}
      brand="qitu"
      commandLabel={t("command.findSourceJobUserAudit")}
      commandShortcutLabel="Cmd K"
      eyebrow={props.notice}
      navigation={navigationModel.primaryNavigation}
      subNavigation={navigationModel.subNavigation}
    >
      <div className="grid gap-[var(--qitu-layout-gutter)] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Surface className="p-[var(--qitu-space-s1)]">
          <StatusBadge tone="info">{t("loading.session")}</StatusBadge>
          <h1 className="mt-3 text-[length:var(--qitu-text-heading-20)] font-semibold leading-[var(--qitu-leading-heading-20)]">
            {t("workspace.loadingTitle")}
          </h1>
          <p className="mt-2 max-w-[34rem] text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
            {t("workspace.loadingDescription")}
          </p>
          <div className="mt-[var(--qitu-space-s1)] grid gap-3" aria-hidden="true">
            <span className="qitu-skeleton h-9 rounded-[var(--qitu-radius-md)]" />
            <span className="qitu-skeleton h-20 rounded-[var(--qitu-radius-md)]" />
            <span className="qitu-skeleton h-20 rounded-[var(--qitu-radius-md)]" />
          </div>
        </Surface>
        <Surface className="p-[var(--qitu-space-s1)]">
          <div className="grid gap-3" aria-hidden="true">
            <span className="qitu-skeleton h-8 rounded-[var(--qitu-radius-md)]" />
            <span className="qitu-skeleton h-24 rounded-[var(--qitu-radius-md)]" />
            <span className="qitu-skeleton h-24 rounded-[var(--qitu-radius-md)]" />
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}

function AuthPageFrame(props: { children: ReactNode; eyebrow: string; notice: string }) {
  const { t } = useI18n();

  return (
    <main className="qitu-auth-page">
      <header className="qitu-auth-header">
        <div className="qitu-auth-brand">
          <span aria-hidden="true" className="qitu-auth-mark">
            <QituMark />
          </span>
          <span className="qitu-auth-wordmark">qitu</span>
        </div>
        <div className="qitu-auth-actions">
          <LanguageSelector className="qitu-topbar-control" compact />
          <ThemeToggleButton className="qitu-topbar-control" compact />
        </div>
      </header>

      <section className="qitu-auth-shell" aria-label={t("auth.pageLabel")}>
        <div className="qitu-auth-intro">
          <StatusBadge tone="active">{props.eyebrow}</StatusBadge>
          <h1>{t("auth.heroTitle")}</h1>
          <p>{t("auth.heroDescription")}</p>
          <div className="qitu-auth-proof-list" aria-label={t("auth.guardrails")}>
            <AuthProof icon="key" title={t("auth.proofSession")} />
            <AuthProof icon="reviews" title={t("auth.proofReview")} />
            <AuthProof icon="audit" title={t("auth.proofAudit")} />
          </div>
          <div className="qitu-auth-status-line">
            <span aria-hidden="true" />
            <strong>{t("common.session")}</strong>
            <em>{props.notice}</em>
          </div>
        </div>

        <div className="qitu-auth-content">{props.children}</div>
      </section>
    </main>
  );
}

function AuthProof(props: { icon: "audit" | "key" | "reviews"; title: string }) {
  return (
    <div className="qitu-auth-proof">
      <AnimatedIcon name={props.icon} size={15} />
      <span>{props.title}</span>
    </div>
  );
}

function AuthCardHeader(props: { badge: string; description: string; title: string }) {
  return (
    <div className="min-w-0">
      <StatusBadge tone="info">{props.badge}</StatusBadge>
      <h2 className="qitu-auth-card-title">{props.title}</h2>
      <p className="qitu-auth-card-copy">{props.description}</p>
    </div>
  );
}

function WorkspaceLoadingActions() {
  const { t } = useI18n();

  return (
    <>
      <Button
        aria-label={t("action.refreshWorkspace")}
        className="qitu-topbar-control"
        disabled
        size="sm"
        title={t("action.refreshWorkspace")}
        variant="ghost"
      >
        <AnimatedIcon name="refresh" size={15} />
        <span className="sr-only">{t("action.refresh")}</span>
      </Button>
      <LanguageSelector className="qitu-topbar-control" compact />
      <ThemeToggleButton className="qitu-topbar-control" compact />
      <Button
        aria-label={t("workspace.loadingTitle")}
        className="qitu-account-trigger"
        disabled
        size="sm"
        title={t("workspace.loadingTitle")}
        variant="ghost"
      >
        <span className="qitu-avatar-mark qitu-skeleton size-8" aria-hidden="true" />
        <ChevronDown size={14} className="text-[var(--qitu-dim)]" />
      </Button>
    </>
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
        <AnimatedIcon name="refresh" size={15} />
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
  onNavigate: (path: AppNavigationPath) => void;
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
      onSelect: () => props.onNavigate(routePath("account")),
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
      onSelect: () => props.onNavigate(routePath("sources")),
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
        props.onNavigate(routePath("imports"));
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
      onSelect: () => props.onNavigate(routePath("users")),
    });
  }

  for (const event of props.auditEvents.slice(0, 8)) {
    entries.push({
      description: `${event.subject.kind}:${event.subject.id}`,
      group: props.t("search.auditGroup"),
      id: `audit:${event.id}`,
      label: event.action,
      onSelect: () => props.onNavigate(routePath("audit")),
    });
  }

  return entries;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed.";
}

function passwordPolicyError(password: string, t: Translate): string | null {
  return password.length < minimumPasswordLength
    ? t("auth.passwordMinLength", { count: String(minimumPasswordLength) })
    : null;
}
