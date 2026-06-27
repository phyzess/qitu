import type {
  AiAdvisoryArtifact,
  ApiUser,
  AuditEvent,
  ImportJobListItem,
  ImportJobReview,
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

export type HealthResponse = {
  ok: true;
  service: string;
  environment: string;
};

export type BootstrapInvitationResponse = {
  delivery: string;
  inviteToken: string;
  inviteUrl: string;
  invitation: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
    createdAt: string;
  };
};

export type RequestPasswordResetResponse = {
  ok: true;
  delivery?: string;
  resetToken?: string;
  resetUrl?: string;
};

export type SourceFilesResponse = {
  sourceFiles: SourceFile[];
};

export type ImportJobsResponse = {
  importJobs: ImportJobListItem[];
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
    subjectId?: string;
    subjectKind?: string;
    actorId?: string;
    limit?: number;
  } = {},
): Promise<AuditEventsResponse> {
  const search = new URLSearchParams();
  if (input.subjectId) search.set("subjectId", input.subjectId);
  if (input.subjectKind) search.set("subjectKind", input.subjectKind);
  if (input.actorId) search.set("actorId", input.actorId);
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
  const response = await fetch(url, {
    ...options,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function withSearch(path: string, search: URLSearchParams): string {
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
