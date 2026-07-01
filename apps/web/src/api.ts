import type {
  AiAdvisoryArtifact,
  ApiUser,
  AuditEvent,
  EmailDeliverySummary,
  ImportJobEvent,
  ImportJobListItem,
  ImportJobReview,
  InvitationSummary,
  ReviewIssue,
  SourceFile,
  StagedRecord,
} from "./types";

export type MeResponse = {
  user: ApiUser | null;
  session?: {
    id: string;
    expiresAt: string;
  };
};

export type LoginResponse = {
  user: ApiUser;
  session: {
    id: string;
    expiresAt: string;
  };
};

export type LocalUserBootstrapResponse = LoginResponse & {
  created: boolean;
};

export type HealthResponse = {
  ok: true;
  service: string;
  environment: string;
};

export type BootstrapInvitationResponse = {
  delivery: string;
  emailDelivery?: EmailDeliverySummary;
  inviteToken: string;
  inviteUrl: string;
  invitation: InvitationSummary;
};

export type CreateInvitationResponse = {
  delivery: string;
  emailDelivery?: EmailDeliverySummary;
  inviteToken?: string;
  inviteUrl?: string;
  invitation: InvitationSummary;
};

export type ResendInvitationResponse = CreateInvitationResponse;

export type RevokeInvitationResponse = {
  invitation: InvitationSummary;
};

export type DeleteInvitationResponse = {
  deletedInvitationId: string;
  ok: true;
};

export type UsersResponse = {
  users: ApiUser[];
};

export type InvitationsResponse = {
  invitations: InvitationSummary[];
};

export type RequestPasswordResetResponse = {
  ok: true;
  delivery?: string;
  emailDelivery?: EmailDeliverySummary;
  resetToken?: string;
  resetUrl?: string;
};

export type DeleteUserResponse = {
  deletedUserId: string;
  ok: true;
};

export type SourceFilesResponse = {
  sourceFiles: SourceFile[];
};

export type ImportJobsResponse = {
  importJobs: ImportJobListItem[];
};

export type ImportJobEventsResponse = {
  events: ImportJobEvent[];
};

export type ReviewResponse = {
  job: ImportJobReview;
  records: StagedRecord[];
  issues: ReviewIssue[];
};

export type AuditEventsResponse = {
  auditEvents: AuditEvent[];
};

export type AiAdvisoriesResponse = {
  advisories: AiAdvisoryArtifact[];
};

export type AiAdvisoryResponse = {
  advisory: AiAdvisoryArtifact;
  duplicate?: boolean;
};

export type DrainLocalImportJobsResponse = {
  processedCount: number;
  processedJobIds: string[];
};

type RequestOptions = Omit<RequestInit, "credentials">;
const localeStorageKey = "qitu.locale";
const localeHeaderName = "x-qitu-locale";

export type ApiErrorIssue = {
  message: string;
  path?: string;
};

export class ApiRequestError extends Error {
  code: string | null;
  issues: ApiErrorIssue[];
  status: number;

  constructor(input: {
    code?: string | null;
    issues?: ApiErrorIssue[];
    message: string;
    status: number;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.code = input.code ?? null;
    this.issues = input.issues ?? [];
    this.status = input.status;
  }
}

export async function me(): Promise<MeResponse> {
  return apiJson<MeResponse>("/api/auth/me");
}

export async function health(): Promise<HealthResponse> {
  return apiJson<HealthResponse>("/health");
}

export async function login(input: { email: string; password: string }): Promise<LoginResponse> {
  return apiJson<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function requestPasswordReset(input: {
  email: string;
}): Promise<RequestPasswordResetResponse> {
  return apiJson<RequestPasswordResetResponse>("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function confirmPasswordReset(input: {
  token: string;
  password: string;
}): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>("/api/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function createLocalInvitation(input: {
  email: string;
  role?: string;
}): Promise<BootstrapInvitationResponse> {
  return apiJson<BootstrapInvitationResponse>("/api/bootstrap/invitations", {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function createInvitation(input: {
  email: string;
  role?: string;
}): Promise<CreateInvitationResponse> {
  return apiJson<CreateInvitationResponse>("/api/invitations", {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function revokeInvitation(invitationId: string): Promise<RevokeInvitationResponse> {
  return apiJson<RevokeInvitationResponse>(`/api/invitations/${invitationId}/revoke`, {
    method: "POST",
  });
}

export async function resendInvitation(invitationId: string): Promise<ResendInvitationResponse> {
  return apiJson<ResendInvitationResponse>(`/api/invitations/${invitationId}/resend`, {
    method: "POST",
  });
}

export async function deleteInvitation(invitationId: string): Promise<DeleteInvitationResponse> {
  return apiJson<DeleteInvitationResponse>(`/api/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

export async function deleteUser(userId: string): Promise<DeleteUserResponse> {
  return apiJson<DeleteUserResponse>(`/api/users/${userId}`, {
    method: "DELETE",
  });
}

export async function listUsers(input: { limit?: number } = {}): Promise<UsersResponse> {
  const search = new URLSearchParams();
  if (input.limit) search.set("limit", String(input.limit));
  return apiJson<UsersResponse>(withSearch("/api/users", search));
}

export async function listInvitations(
  input: { limit?: number } = {},
): Promise<InvitationsResponse> {
  const search = new URLSearchParams();
  if (input.limit) search.set("limit", String(input.limit));
  return apiJson<InvitationsResponse>(withSearch("/api/invitations", search));
}

export async function bootstrapLocalReviewer(input: {
  email: string;
  displayName?: string;
  password: string;
}): Promise<LocalUserBootstrapResponse> {
  return apiJson<LocalUserBootstrapResponse>("/api/bootstrap/local-reviewer", {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function bootstrapLocalAdmin(input: {
  email: string;
  displayName?: string;
  password: string;
}): Promise<LocalUserBootstrapResponse> {
  return apiJson<LocalUserBootstrapResponse>("/api/bootstrap/local-admin", {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function acceptInvitation(input: {
  token: string;
  displayName?: string;
  password: string;
}): Promise<LoginResponse> {
  return apiJson<LoginResponse>(`/api/invitations/${input.token}/accept`, {
    method: "POST",
    body: JSON.stringify({
      displayName: input.displayName,
      password: input.password,
    }),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function logout(): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function listSourceFiles(
  input: {
    workspaceId?: string;
    limit?: number;
  } = {},
): Promise<SourceFilesResponse> {
  const search = new URLSearchParams();
  if (input.workspaceId) search.set("workspaceId", input.workspaceId);
  if (input.limit) search.set("limit", String(input.limit));
  return apiJson<SourceFilesResponse>(withSearch("/api/source-files", search));
}

export async function listImportJobs(
  input: {
    workspaceId?: string;
    status?: string;
    limit?: number;
  } = {},
): Promise<ImportJobsResponse> {
  const search = new URLSearchParams();
  if (input.workspaceId) search.set("workspaceId", input.workspaceId);
  if (input.status) search.set("status", input.status);
  if (input.limit) search.set("limit", String(input.limit));
  return apiJson<ImportJobsResponse>(withSearch("/api/import-jobs", search));
}

export async function drainLocalImportJobs(): Promise<DrainLocalImportJobsResponse> {
  return apiJson<DrainLocalImportJobsResponse>("/api/dev/import-jobs/drain", {
    method: "POST",
  });
}

export async function uploadSourceFile(input: { file: File; workspaceId?: string }): Promise<{
  sourceFileId: string;
  importJobId: string;
  objectKey: string;
  status: string;
  duplicate?: boolean;
}> {
  return apiJson("/api/source-files", {
    method: "POST",
    body: input.file,
    headers: {
      "content-type": input.file.type || "application/octet-stream",
      "x-filename": input.file.name,
      "x-workspace-id": input.workspaceId ?? "default",
    },
  });
}

export async function getImportJobReview(jobId: string): Promise<ReviewResponse> {
  return apiJson<ReviewResponse>(`/api/import-jobs/${jobId}/review`);
}

export async function listImportJobEvents(
  jobId: string,
  input: {
    limit?: number;
  } = {},
): Promise<ImportJobEventsResponse> {
  const search = new URLSearchParams();
  if (input.limit) search.set("limit", String(input.limit));
  return apiJson<ImportJobEventsResponse>(withSearch(`/api/import-jobs/${jobId}/events`, search));
}

export async function listAiAdvisories(jobId: string): Promise<AiAdvisoriesResponse> {
  return apiJson<AiAdvisoriesResponse>(`/api/import-jobs/${jobId}/advisories`);
}

export async function generateAiAdvisory(jobId: string): Promise<AiAdvisoryResponse> {
  return apiJson<AiAdvisoryResponse>(`/api/import-jobs/${jobId}/advisories`, {
    method: "POST",
  });
}

export async function confirmAiAdvisory(input: {
  jobId: string;
  advisoryId: string;
}): Promise<AiAdvisoryResponse> {
  return apiJson<AiAdvisoryResponse>(
    `/api/import-jobs/${input.jobId}/advisories/${input.advisoryId}/confirm`,
    {
      method: "POST",
    },
  );
}

export async function dismissAiAdvisory(input: {
  jobId: string;
  advisoryId: string;
}): Promise<AiAdvisoryResponse> {
  return apiJson<AiAdvisoryResponse>(
    `/api/import-jobs/${input.jobId}/advisories/${input.advisoryId}/dismiss`,
    {
      method: "POST",
    },
  );
}

export async function approveStagedRecord(input: {
  jobId: string;
  recordId: string;
  note?: string;
}): Promise<{ record: StagedRecord }> {
  return decideStagedRecord(input, "approve");
}

export async function rejectStagedRecord(input: {
  jobId: string;
  recordId: string;
  note?: string;
}): Promise<{ record: StagedRecord }> {
  return decideStagedRecord(input, "reject");
}

export async function confirmPendingStagedRecords(input: {
  jobId: string;
  note?: string;
}): Promise<{
  confirmedCount: number;
  importJobId: string;
  records: StagedRecord[];
  status: string;
  duplicate?: boolean;
}> {
  return apiJson(`/api/import-jobs/${input.jobId}/review/confirm-pending`, {
    method: "POST",
    body: JSON.stringify({
      note: input.note,
    }),
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function commitImportJob(jobId: string): Promise<{
  importJobId: string;
  status: string;
  committedRecords: unknown[];
}> {
  return apiJson(`/api/import-jobs/${jobId}/commit`, {
    method: "POST",
  });
}

export async function retryImportJob(jobId: string): Promise<{
  importJobId: string;
  status: string;
}> {
  return apiJson(`/api/import-jobs/${jobId}/retry`, {
    method: "POST",
  });
}

export async function listAuditEvents(
  input: {
    action?: string;
    subjectId?: string;
    subjectKind?: string;
    actorId?: string;
    occurredAfter?: string;
    occurredBefore?: string;
    limit?: number;
  } = {},
): Promise<AuditEventsResponse> {
  const search = new URLSearchParams();
  if (input.action) search.set("action", input.action);
  if (input.subjectId) search.set("subjectId", input.subjectId);
  if (input.subjectKind) search.set("subjectKind", input.subjectKind);
  if (input.actorId) search.set("actorId", input.actorId);
  if (input.occurredAfter) search.set("occurredAfter", input.occurredAfter);
  if (input.occurredBefore) search.set("occurredBefore", input.occurredBefore);
  if (input.limit) search.set("limit", String(input.limit));
  return apiJson<AuditEventsResponse>(withSearch("/api/audit-events", search));
}

async function decideStagedRecord(
  input: { jobId: string; recordId: string; note?: string },
  action: "approve" | "reject",
): Promise<{ record: StagedRecord }> {
  return apiJson(`/api/import-jobs/${input.jobId}/staged-records/${input.recordId}/${action}`, {
    method: "POST",
    body: JSON.stringify({
      note: input.note,
    }),
    headers: {
      "content-type": "application/json",
    },
  });
}

async function apiJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  if (import.meta.env.VITE_QITU_API_MODE === "mock") {
    const { handleMockApiRequest } = await import("./mock-api");
    return handleMockApiRequest<T>(url, options);
  }

  const headers = new Headers(options.headers);
  const locale = readLocalePreference();
  if (locale && !headers.has(localeHeaderName)) {
    headers.set(localeHeaderName, locale);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch {
    throw apiNetworkError();
  }

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return response.json() as Promise<T>;
}

export async function apiErrorFromResponse(response: Response): Promise<ApiRequestError> {
  const fallback = `Request failed with ${response.status}`;
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return new ApiRequestError({
      message: fallback,
      status: response.status,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiRequestError({
      message: fallback,
      status: response.status,
    });
  }

  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const message = typeof error?.message === "string" ? error.message : fallback;
  const code = typeof error?.code === "string" ? error.code : null;
  const issues = Array.isArray(error?.issues)
    ? error.issues.flatMap((issue): ApiErrorIssue[] => {
        if (!isRecord(issue) || typeof issue.message !== "string") {
          return [];
        }

        return [
          {
            message: issue.message,
            ...(typeof issue.path === "string" ? { path: issue.path } : {}),
          },
        ];
      })
    : [];

  return new ApiRequestError({
    code,
    issues,
    message,
    status: response.status,
  });
}

export function apiNetworkError(): ApiRequestError {
  return new ApiRequestError({
    message: "Network request failed. Check the Worker connection and try again.",
    status: 0,
  });
}

function readLocalePreference(): string | null {
  return window.localStorage.getItem(localeStorageKey);
}

function withSearch(path: string, search: URLSearchParams): string {
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
