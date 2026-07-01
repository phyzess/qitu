import type {
  AiAdvisoryArtifact,
  ApiUser,
  AuditEvent,
  ImportJobEvent,
  ImportJobListItem,
  ImportJobReview,
  InvitationSummary,
  ReviewIssue,
  SourceFile,
  StagedRecord,
} from "./types";

type RequestOptions = Omit<RequestInit, "credentials">;

type MockInvitation = InvitationSummary & {
  token: string;
};

type MockState = {
  advisoriesByJobId: Record<string, AiAdvisoryArtifact[]>;
  auditEvents: AuditEvent[];
  currentUserId: string | null;
  importJobEventsByJobId: Record<string, ImportJobEvent[]>;
  importJobs: ImportJobListItem[];
  invitations: MockInvitation[];
  issuesByJobId: Record<string, ReviewIssue[]>;
  recordsByJobId: Record<string, StagedRecord[]>;
  sourceFiles: SourceFile[];
  users: ApiUser[];
};

type MockApiIssue = {
  message: string;
  path?: string;
};

const storageKey = "qitu.demo.mockState.v1";
const demoWorkspaceId = "default";

class MockApiRequestError extends Error {
  code: string | null;
  issues: MockApiIssue[];
  status: number;

  constructor(input: {
    code?: string | null;
    issues?: MockApiIssue[];
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

export async function handleMockApiRequest<T>(
  requestUrl: string,
  options: RequestOptions = {},
): Promise<T> {
  const state = readState();
  const method = (options.method ?? "GET").toUpperCase();
  const url = new URL(requestUrl, window.location.origin);
  const segments = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/health") {
    return respond({
      environment: "demo",
      ok: true,
      service: "qitu-worker",
    });
  }

  if (method === "GET" && url.pathname === "/api/auth/me") {
    const user = currentUser(state);
    return respond({
      user,
      ...(user
        ? {
            session: {
              expiresAt: oneDayFromNow(),
              id: "demo-session",
            },
          }
        : {}),
    });
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const input = await readJsonBody<{ email?: string }>(options);
    const user = findOrCreateDemoUser(state, input.email);
    state.currentUserId = user.id;
    pushAudit(state, "auth.login_succeeded", { id: user.id, kind: "user" }, { demo: true });
    writeState(state);
    return respond({
      session: {
        expiresAt: oneDayFromNow(),
        id: "demo-session",
      },
      user,
    });
  }

  if (method === "POST" && url.pathname === "/api/auth/logout") {
    const user = currentUser(state);
    if (user) {
      pushAudit(state, "auth.logout", { id: user.id, kind: "user" }, { demo: true });
    }
    state.currentUserId = null;
    writeState(state);
    return respond({ ok: true });
  }

  if (method === "POST" && url.pathname === "/api/auth/password-reset/request") {
    const input = await readJsonBody<{ email?: string }>(options);
    const resetToken = `demo-reset-${shortId()}`;
    pushAudit(
      state,
      "password_reset.requested",
      { id: normalizedEmail(input.email) ?? "unknown", kind: "user" },
      { delivery: "mock", email: normalizedEmail(input.email) },
    );
    writeState(state);
    return respond({
      delivery: "mock",
      emailDelivery: mockEmailDelivery("stored"),
      ok: true,
      resetToken,
      resetUrl: new URL(`/reset-password/${resetToken}`, window.location.origin).toString(),
    });
  }

  if (method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
    pushAudit(
      state,
      "password_reset.confirmed",
      { id: "demo-reset", kind: "user" },
      { demo: true },
    );
    writeState(state);
    return respond({ ok: true });
  }

  if (method === "POST" && url.pathname === "/api/bootstrap/local-admin") {
    return respond(bootstrapDemoUser(state, await readJsonBody(options), "admin"));
  }

  if (method === "POST" && url.pathname === "/api/bootstrap/local-reviewer") {
    return respond(bootstrapDemoUser(state, await readJsonBody(options), "reviewer"));
  }

  if (method === "POST" && url.pathname === "/api/bootstrap/invitations") {
    const result = createInvitationForState(state, await readJsonBody(options));
    return respond({
      ...result,
      delivery: "mock",
    });
  }

  if (segments[0] === "api" && segments[1] === "invitations") {
    if (method === "GET" && segments.length === 2) {
      return respond({
        invitations: limited(state.invitations, url).map(publicInvitation),
      });
    }

    if (method === "POST" && segments.length === 2) {
      return respond(createInvitationForState(state, await readJsonBody(options)));
    }

    if (method === "POST" && segments.length === 4 && segments[3] === "revoke") {
      const invitation = requireInvitation(state, segments[2]);
      invitation.status = "revoked";
      invitation.revokedAt = nowIso();
      pushAudit(
        state,
        "invitation.revoked",
        { id: invitation.id, kind: "invitation" },
        { email: invitation.email },
      );
      writeState(state);
      return respond({ invitation: publicInvitation(invitation) });
    }

    if (method === "POST" && segments.length === 4 && segments[3] === "resend") {
      const invitation = requireInvitation(state, segments[2]);
      invitation.latestEmailMessageId = `email-${shortId()}`;
      invitation.latestEmailProviderMessageId = `mock-${shortId()}`;
      invitation.latestEmailStatus = "stored";
      invitation.latestEmailErrorMessage = null;
      pushAudit(
        state,
        "invitation.email_requested",
        { id: invitation.id, kind: "invitation" },
        { delivery: "mock", email: invitation.email },
      );
      writeState(state);
      return respond(invitationResponse(invitation));
    }

    if (method === "DELETE" && segments.length === 3) {
      const invitation = requireInvitation(state, segments[2]);
      state.invitations = state.invitations.filter((item) => item.id !== invitation.id);
      pushAudit(
        state,
        "invitation.deleted",
        { id: invitation.id, kind: "invitation" },
        { email: invitation.email },
      );
      writeState(state);
      return respond({ deletedInvitationId: invitation.id, ok: true });
    }

    if (method === "POST" && segments.length === 4 && segments[3] === "accept") {
      const invitation = state.invitations.find((item) => item.token === segments[2]);
      if (!invitation) {
        throw requestError(404, "invitation_not_found", "Invitation was not found.");
      }

      const input = await readJsonBody<{ displayName?: string }>(options);
      const user = findOrCreateDemoUser(
        state,
        invitation.email,
        invitation.role,
        input.displayName,
      );
      invitation.status = "accepted";
      invitation.acceptedAt = nowIso();
      state.currentUserId = user.id;
      pushAudit(
        state,
        "invitation.accepted",
        { id: invitation.id, kind: "invitation" },
        { email: invitation.email, userId: user.id },
      );
      writeState(state);
      return respond({
        session: {
          expiresAt: oneDayFromNow(),
          id: "demo-session",
        },
        user,
      });
    }
  }

  if (method === "GET" && url.pathname === "/api/users") {
    requireUser(state);
    return respond({
      users: limited(state.users, url),
    });
  }

  if (method === "DELETE" && segments[0] === "api" && segments[1] === "users" && segments[2]) {
    const user = requireUser(state);
    const targetId = segments[2];
    if (targetId === user.id) {
      throw requestError(409, "current_user_delete", "The current demo user cannot be deleted.");
    }
    state.users = state.users.filter((item) => item.id !== targetId);
    pushAudit(state, "user.deleted", { id: targetId, kind: "user" }, { demo: true });
    writeState(state);
    return respond({ deletedUserId: targetId, ok: true });
  }

  if (method === "GET" && url.pathname === "/api/source-files") {
    requireUser(state);
    return respond({
      sourceFiles: limited(state.sourceFiles, url),
    });
  }

  if (method === "POST" && url.pathname === "/api/source-files") {
    const user = requireUser(state);
    const result = await uploadSourceFile(state, options, user);
    writeState(state);
    return respond(result);
  }

  if (method === "GET" && url.pathname === "/api/import-jobs") {
    requireUser(state);
    const status = url.searchParams.get("status");
    const jobs = status
      ? state.importJobs.filter((job) => job.status === status)
      : state.importJobs;
    return respond({
      importJobs: limited(jobs, url),
    });
  }

  if (method === "POST" && url.pathname === "/api/dev/import-jobs/drain") {
    requireUser(state);
    const queued = state.importJobs.filter((job) => job.status === "queued");
    for (const job of queued) {
      updateJobStatus(state, job, "needs_review", "Demo queue drained.");
    }
    writeState(state);
    return respond({
      processedCount: queued.length,
      processedJobIds: queued.map((job) => job.id),
    });
  }

  if (segments[0] === "api" && segments[1] === "import-jobs" && segments[2]) {
    const jobId = segments[2];

    if (method === "GET" && segments.length === 4 && segments[3] === "review") {
      const job = requireJob(state, jobId);
      const source = requireSource(state, job.sourceFileId);
      const review: ImportJobReview = {
        adapterId: job.adapterId,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        createdBy: job.createdBy,
        failureClass: job.failureClass,
        failureReason: job.failureReason,
        id: job.id,
        jobKind: job.jobKind,
        sourceFile: {
          contentType: source.contentType,
          filename: source.filename,
          objectKey: source.objectKey,
        },
        sourceFileId: source.id,
        status: job.status,
        updatedAt: job.updatedAt,
      };
      return respond({
        issues: state.issuesByJobId[jobId] ?? [],
        job: review,
        records: state.recordsByJobId[jobId] ?? [],
      });
    }

    if (method === "GET" && segments.length === 4 && segments[3] === "events") {
      requireJob(state, jobId);
      return respond({
        events: limited(state.importJobEventsByJobId[jobId] ?? [], url),
      });
    }

    if (segments[3] === "advisories") {
      if (method === "GET" && segments.length === 4) {
        requireJob(state, jobId);
        return respond({
          advisories: state.advisoriesByJobId[jobId] ?? [],
        });
      }

      if (method === "POST" && segments.length === 4) {
        const user = requireUser(state);
        const existing = (state.advisoriesByJobId[jobId] ?? []).find(
          (item) => item.status === "suggested",
        );
        if (existing) {
          return respond({ advisory: existing, duplicate: true });
        }
        const advisory = createAdvisory(state, jobId, user.id);
        writeState(state);
        return respond({ advisory });
      }

      if (method === "POST" && segments.length === 6) {
        const user = requireUser(state);
        const advisory = requireAdvisory(state, jobId, segments[4]);
        const action = segments[5];
        if (action === "confirm") {
          advisory.status = "confirmed";
          advisory.confirmedAt = nowIso();
          advisory.confirmedBy = user.id;
          pushAudit(
            state,
            "ai_advisory.confirmed",
            { id: advisory.id, kind: "ai_advisory" },
            { importJobId: jobId },
            user.id,
          );
          pushJobEvent(state, jobId, "ai_advisory.confirmed", "Advisory confirmed.", user.id);
          writeState(state);
          return respond({ advisory });
        }
        if (action === "dismiss") {
          advisory.status = "dismissed";
          advisory.dismissedAt = nowIso();
          advisory.dismissedBy = user.id;
          pushAudit(
            state,
            "ai_advisory.dismissed",
            { id: advisory.id, kind: "ai_advisory" },
            { importJobId: jobId },
            user.id,
          );
          pushJobEvent(state, jobId, "ai_advisory.dismissed", "Advisory dismissed.", user.id);
          writeState(state);
          return respond({ advisory });
        }
      }
    }

    if (method === "POST" && segments.length === 5 && segments[3] === "review") {
      if (segments[4] === "confirm-pending") {
        const user = requireUser(state);
        const result = confirmPendingRecords(state, jobId, user.id);
        writeState(state);
        return respond(result);
      }
    }

    if (method === "POST" && segments.length === 4 && segments[3] === "commit") {
      const user = requireUser(state);
      const result = commitJob(state, jobId, user.id);
      writeState(state);
      return respond(result);
    }

    if (method === "POST" && segments.length === 4 && segments[3] === "retry") {
      const user = requireUser(state);
      const job = requireJob(state, jobId);
      job.failureClass = null;
      job.failureReason = null;
      updateJobStatus(state, job, "needs_review", "Demo retry prepared records.", user.id);
      pushAudit(
        state,
        "import_job.retried",
        { id: job.id, kind: "import_job" },
        { demo: true },
        user.id,
      );
      writeState(state);
      return respond({
        importJobId: job.id,
        status: job.status,
      });
    }

    if (
      method === "POST" &&
      segments.length === 6 &&
      segments[3] === "staged-records" &&
      (segments[5] === "approve" || segments[5] === "reject")
    ) {
      const user = requireUser(state);
      const record = decideRecord(
        state,
        jobId,
        segments[4]!,
        segments[5] === "approve" ? "approved" : "rejected",
        user.id,
      );
      writeState(state);
      return respond({ record });
    }
  }

  if (method === "GET" && url.pathname === "/api/audit-events") {
    requireUser(state);
    return respond({
      auditEvents: limited(filterAuditEvents(state.auditEvents, url), url),
    });
  }

  throw requestError(404, "mock_route_not_found", `No mock route for ${method} ${url.pathname}.`);
}

function readState(): MockState {
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    const seeded = seedState();
    writeState(seeded);
    return seeded;
  }

  try {
    return normalizeState(JSON.parse(stored));
  } catch {
    const seeded = seedState();
    writeState(seeded);
    return seeded;
  }
}

function writeState(state: MockState): void {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function normalizeState(value: unknown): MockState {
  if (!isRecord(value)) return seedState();
  const seeded = seedState();
  return {
    advisoriesByJobId: isRecord(value.advisoriesByJobId)
      ? (value.advisoriesByJobId as MockState["advisoriesByJobId"])
      : seeded.advisoriesByJobId,
    auditEvents: Array.isArray(value.auditEvents) ? value.auditEvents : seeded.auditEvents,
    currentUserId:
      typeof value.currentUserId === "string" || value.currentUserId === null
        ? value.currentUserId
        : seeded.currentUserId,
    importJobEventsByJobId: isRecord(value.importJobEventsByJobId)
      ? (value.importJobEventsByJobId as MockState["importJobEventsByJobId"])
      : seeded.importJobEventsByJobId,
    importJobs: Array.isArray(value.importJobs) ? value.importJobs : seeded.importJobs,
    invitations: Array.isArray(value.invitations) ? value.invitations : seeded.invitations,
    issuesByJobId: isRecord(value.issuesByJobId)
      ? (value.issuesByJobId as MockState["issuesByJobId"])
      : seeded.issuesByJobId,
    recordsByJobId: isRecord(value.recordsByJobId)
      ? (value.recordsByJobId as MockState["recordsByJobId"])
      : seeded.recordsByJobId,
    sourceFiles: Array.isArray(value.sourceFiles) ? value.sourceFiles : seeded.sourceFiles,
    users: Array.isArray(value.users) ? value.users : seeded.users,
  };
}

function seedState(): MockState {
  const admin = user("demo-admin", "admin@example.com", "admin", "Demo Admin", hoursAgo(72));
  const reviewer = user(
    "demo-reviewer",
    "reviewer@example.com",
    "reviewer",
    "Demo Operator",
    hoursAgo(70),
  );
  const viewer = user("demo-viewer", "viewer@example.com", "viewer", "Demo Viewer", hoursAgo(68));
  const sourceA = sourceFile(
    "demo-source-1",
    "demo-intake-alpha.txt",
    "mock/source-files/demo-intake-alpha.txt",
    "mock-hash-alpha",
    1420,
    admin.id,
    hoursAgo(9),
  );
  const sourceB = sourceFile(
    "demo-source-2",
    "demo-intake-beta.json",
    "mock/source-files/demo-intake-beta.json",
    "mock-hash-beta",
    2088,
    reviewer.id,
    hoursAgo(5),
    "application/json",
  );
  const sourceC = sourceFile(
    "demo-source-3",
    "demo-intake-needs-adapter.csv",
    "mock/source-files/demo-intake-needs-adapter.csv",
    "mock-hash-gamma",
    912,
    reviewer.id,
    hoursAgo(2),
    "text/csv",
  );
  const jobA = importJob("demo-job-1", sourceA, "needs_review", admin.id, hoursAgo(8));
  const jobB = importJob("demo-job-2", sourceB, "approved", reviewer.id, hoursAgo(4));
  const jobC = importJob("demo-job-3", sourceC, "failed", reviewer.id, hoursAgo(2), {
    failureClass: "adapter_missing",
    failureReason: "No app-owned adapter was registered for this mock content type.",
  });
  const state: MockState = {
    advisoriesByJobId: {
      [jobA.id]: [
        {
          confirmedAt: null,
          confirmedBy: null,
          createdAt: hoursAgo(1.8),
          createdBy: "demo-reviewer",
          dismissedAt: null,
          dismissedBy: null,
          id: "demo-advisory-1",
          importJobId: jobA.id,
          kind: "import_review",
          model: "deterministic-demo",
          output: {
            recommendation: "confirm_valid_rows",
            reviewNotes: ["One row has a validation issue and should stay visible for review."],
          },
          promptVersion: "demo-v1",
          provider: "mock",
          status: "suggested",
          summary:
            "Two rows look ready for confirmation. One row should stay under human review because its numeric value is outside the starter rule.",
        },
      ],
      [jobB.id]: [],
      [jobC.id]: [],
    },
    auditEvents: [],
    currentUserId: admin.id,
    importJobEventsByJobId: {
      [jobA.id]: [
        jobEvent(jobA, "source_file.uploaded", null, "queued", "Source accepted.", hoursAgo(8.9)),
        jobEvent(
          jobA,
          "import_job.queued",
          "queued",
          "processing",
          "Import job queued.",
          hoursAgo(8.8),
        ),
        jobEvent(
          jobA,
          "import_job.needs_review",
          "processing",
          "needs_review",
          "Three staged records are ready for confirmation.",
          hoursAgo(8.4),
        ),
      ],
      [jobB.id]: [
        jobEvent(jobB, "source_file.uploaded", null, "queued", "Source accepted.", hoursAgo(4.8)),
        jobEvent(
          jobB,
          "import_review.records_approved",
          "needs_review",
          "approved",
          "All staged records confirmed.",
          hoursAgo(4.1),
        ),
      ],
      [jobC.id]: [
        jobEvent(jobC, "source_file.uploaded", null, "queued", "Source accepted.", hoursAgo(2.5)),
        jobEvent(
          jobC,
          "import_job.failed",
          "processing",
          "failed",
          "Adapter registration is missing in this mock scenario.",
          hoursAgo(2.1),
        ),
      ],
    },
    importJobs: [jobC, jobB, jobA],
    invitations: [
      invitation(
        "demo-invitation-1",
        "pending-operator@example.com",
        "reviewer",
        "pending",
        "demo-invite-token-1",
        hoursAgo(6),
      ),
      {
        ...invitation(
          "demo-invitation-2",
          "mail-failure@example.com",
          "viewer",
          "pending",
          "demo-invite-token-2",
          hoursAgo(12),
        ),
        latestEmailErrorMessage: "Mock delivery failure for demo visibility.",
        latestEmailStatus: "failed",
      },
    ],
    issuesByJobId: {
      [jobA.id]: [
        {
          code: "value_out_of_range",
          createdAt: hoursAgo(8.3),
          id: "demo-issue-1",
          importJobId: jobA.id,
          message: "Value is outside the starter adapter's accepted range.",
          severity: "warning",
          stagedRecordKey: "row:3",
          status: "open",
        },
      ],
      [jobB.id]: [],
      [jobC.id]: [],
    },
    recordsByJobId: {
      [jobA.id]: [
        stagedRecord(jobA, "demo-record-1", "row:1", { label: "Alpha", value: 1.12 }, "pending"),
        stagedRecord(jobA, "demo-record-2", "row:2", { label: "Beta", value: 0.87 }, "approved"),
        stagedRecord(jobA, "demo-record-3", "row:3", { label: "Gamma", value: 99.2 }, "pending"),
      ],
      [jobB.id]: [
        stagedRecord(jobB, "demo-record-4", "row:1", { label: "Delta", value: 2.41 }, "approved"),
        stagedRecord(jobB, "demo-record-5", "row:2", { label: "Epsilon", value: 3.02 }, "approved"),
      ],
      [jobC.id]: [],
    },
    sourceFiles: [sourceC, sourceB, sourceA],
    users: [admin, reviewer, viewer],
  };

  state.auditEvents = [
    auditEvent(
      "audit-demo-1",
      "ai_advisory.generated",
      admin.id,
      "ai_advisory",
      "demo-advisory-1",
      {
        importJobId: jobA.id,
        mode: "mock",
      },
    ),
    auditEvent(
      "audit-demo-2",
      "import_review.record_approved",
      reviewer.id,
      "example_staged_record",
      "demo-record-2",
      {
        importJobId: jobA.id,
        stagedRecordKey: "row:2",
      },
    ),
    auditEvent("audit-demo-3", "import_job.failed", reviewer.id, "import_job", jobC.id, {
      failureClass: "adapter_missing",
    }),
    auditEvent("audit-demo-4", "source_file.uploaded", admin.id, "source_file", sourceA.id, {
      contentHash: sourceA.contentHash,
    }),
    auditEvent(
      "audit-demo-5",
      "invitation.email_requested",
      admin.id,
      "invitation",
      "demo-invitation-1",
      {
        delivery: "mock",
      },
    ),
  ];

  return state;
}

function bootstrapDemoUser(
  state: MockState,
  input: { displayName?: string; email?: string },
  role: string,
) {
  const user = findOrCreateDemoUser(state, input.email, role, input.displayName);
  const created = !state.users.some((item) => item.id === user.id);
  state.currentUserId = user.id;
  pushAudit(state, "auth.local_bootstrap", { id: user.id, kind: "user" }, { role });
  writeState(state);
  return {
    created,
    session: {
      expiresAt: oneDayFromNow(),
      id: "demo-session",
    },
    user,
  };
}

function createInvitationForState(state: MockState, input: { email?: string; role?: string }) {
  const user = requireUser(state);
  const created = invitation(
    `demo-invitation-${shortId()}`,
    normalizedEmail(input.email) ?? "new-user@example.com",
    input.role ?? "viewer",
    "pending",
    `demo-invite-${shortId()}`,
    nowIso(),
  );
  created.createdBy = user.id;
  state.invitations = [created, ...state.invitations];
  pushAudit(
    state,
    "invitation.created",
    { id: created.id, kind: "invitation" },
    { delivery: "mock", email: created.email, role: created.role },
    user.id,
  );
  writeState(state);
  return invitationResponse(created);
}

async function uploadSourceFile(state: MockState, options: RequestOptions, user: ApiUser) {
  const headers = new Headers(options.headers);
  const body = options.body;
  const filename = headers.get("x-filename")?.trim() || `demo-upload-${shortId()}.txt`;
  const contentType = headers.get("content-type") || "application/octet-stream";
  const workspaceId = headers.get("x-workspace-id") || demoWorkspaceId;
  const contentText = await bodyText(body);
  const size = bodySize(body, contentText);
  const contentHash = `mock-${hashString(`${filename}:${size}:${contentText}`)}`;
  const duplicate = state.sourceFiles.find((file) => file.contentHash === contentHash);
  if (duplicate) {
    const existingJob = state.importJobs.find((job) => job.sourceFileId === duplicate.id);
    pushAudit(
      state,
      "source_file.duplicate_detected",
      { id: duplicate.id, kind: "source_file" },
      { contentHash, filename },
      user.id,
    );
    return {
      duplicate: true,
      importJobId: existingJob?.id ?? "",
      objectKey: duplicate.objectKey,
      sourceFileId: duplicate.id,
      status: existingJob?.status ?? "stored",
    };
  }

  const source = sourceFile(
    `demo-source-${shortId()}`,
    filename,
    `mock/source-files/${Date.now()}-${filename}`,
    contentHash,
    size,
    user.id,
    nowIso(),
    contentType,
    workspaceId,
  );
  const job = importJob(`demo-job-${shortId()}`, source, "needs_review", user.id, nowIso());
  const records = recordsFromContent(job, contentText);
  state.sourceFiles = [source, ...state.sourceFiles];
  state.importJobs = [job, ...state.importJobs];
  state.recordsByJobId[job.id] = records;
  state.issuesByJobId[job.id] = records
    .filter((record) => record.reviewStatus === "pending")
    .slice(0, 1)
    .map((record) => ({
      code: "demo_review_required",
      createdAt: nowIso(),
      id: `demo-issue-${shortId()}`,
      importJobId: job.id,
      message: "Demo upload created a visible review item.",
      severity: "info",
      stagedRecordKey: record.stagedRecordKey,
      status: "open",
    }));
  state.advisoriesByJobId[job.id] = [];
  state.importJobEventsByJobId[job.id] = [
    jobEvent(job, "source_file.uploaded", null, "queued", "Source accepted by mock API.", nowIso()),
    jobEvent(
      job,
      "import_job.needs_review",
      "queued",
      "needs_review",
      "Mock parser staged records for confirmation.",
      nowIso(),
    ),
  ];
  pushAudit(
    state,
    "source_file.uploaded",
    { id: source.id, kind: "source_file" },
    { contentHash, filename, mode: "mock" },
    user.id,
  );
  return {
    importJobId: job.id,
    objectKey: source.objectKey,
    sourceFileId: source.id,
    status: job.status,
  };
}

function confirmPendingRecords(state: MockState, jobId: string, userId: string) {
  const job = requireJob(state, jobId);
  const records = state.recordsByJobId[jobId] ?? [];
  let confirmedCount = 0;
  for (const record of records) {
    if (record.reviewStatus === "pending") {
      record.reviewStatus = "approved";
      record.updatedAt = nowIso();
      confirmedCount += 1;
    }
  }
  recalculateJobStatus(state, job, userId);
  pushAudit(
    state,
    "import_review.records_approved",
    { id: job.id, kind: "import_job" },
    { confirmedCount },
    userId,
  );
  pushJobEvent(
    state,
    jobId,
    "import_review.records_approved",
    "Pending records approved in demo.",
    userId,
  );
  return {
    confirmedCount,
    importJobId: job.id,
    records,
    status: job.status,
  };
}

function decideRecord(
  state: MockState,
  jobId: string,
  recordId: string,
  reviewStatus: "approved" | "rejected",
  userId: string,
): StagedRecord {
  const job = requireJob(state, jobId);
  const record = (state.recordsByJobId[jobId] ?? []).find((item) => item.id === recordId);
  if (!record) {
    throw requestError(404, "staged_record_not_found", "Staged record was not found.");
  }
  record.reviewStatus = reviewStatus;
  record.updatedAt = nowIso();
  recalculateJobStatus(state, job, userId);
  pushAudit(
    state,
    `import_review.record_${reviewStatus}`,
    { id: record.id, kind: "example_staged_record" },
    { importJobId: jobId, stagedRecordKey: record.stagedRecordKey },
    userId,
  );
  pushJobEvent(
    state,
    jobId,
    `import_review.record_${reviewStatus}`,
    `Staged record ${reviewStatus}.`,
    userId,
  );
  return record;
}

function commitJob(state: MockState, jobId: string, userId: string) {
  const job = requireJob(state, jobId);
  const records = state.recordsByJobId[jobId] ?? [];
  const committedRecords = [];
  for (const record of records) {
    if (record.reviewStatus === "approved") {
      record.reviewStatus = "committed";
      record.committedRecordId = `demo-committed-${shortId()}`;
      record.updatedAt = nowIso();
      committedRecords.push(record.payload);
    }
  }
  recalculateJobStatus(state, job, userId);
  pushAudit(
    state,
    "import_job.committed",
    { id: job.id, kind: "import_job" },
    { committedCount: committedRecords.length },
    userId,
  );
  pushJobEvent(state, jobId, "import_job.committed", "Confirmed records committed.", userId);
  return {
    committedRecords,
    importJobId: job.id,
    status: job.status,
  };
}

function recalculateJobStatus(state: MockState, job: ImportJobListItem, userId: string): void {
  const previous = job.status;
  const records = state.recordsByJobId[job.id] ?? [];
  if (records.some((record) => record.reviewStatus === "pending")) {
    job.status = "needs_review";
    job.completedAt = null;
  } else if (records.some((record) => record.reviewStatus === "approved")) {
    job.status = "approved";
    job.completedAt = null;
  } else {
    job.status = "done";
    job.completedAt = nowIso();
  }
  job.updatedAt = nowIso();
  if (previous !== job.status) {
    pushJobEvent(state, job.id, "import_job.status_changed", "Demo status recalculated.", userId, {
      statusFrom: previous,
      statusTo: job.status,
    });
  }
}

function updateJobStatus(
  state: MockState,
  job: ImportJobListItem,
  status: string,
  message: string,
  actorUserId: string | null = null,
): void {
  const previous = job.status;
  job.status = status;
  job.updatedAt = nowIso();
  job.completedAt = status === "done" ? nowIso() : null;
  pushJobEvent(state, job.id, "import_job.status_changed", message, actorUserId, {
    statusFrom: previous,
    statusTo: status,
  });
}

function createAdvisory(state: MockState, jobId: string, userId: string): AiAdvisoryArtifact {
  const records = state.recordsByJobId[jobId] ?? [];
  const pending = records.filter((record) => record.reviewStatus === "pending").length;
  const approved = records.filter((record) => record.reviewStatus === "approved").length;
  const advisory: AiAdvisoryArtifact = {
    confirmedAt: null,
    confirmedBy: null,
    createdAt: nowIso(),
    createdBy: userId,
    dismissedAt: null,
    dismissedBy: null,
    id: `demo-advisory-${shortId()}`,
    importJobId: jobId,
    kind: "import_review",
    model: "deterministic-demo",
    output: {
      approved,
      pending,
      recommendation: pending > 0 ? "review_pending_rows" : "commit_confirmed_rows",
    },
    promptVersion: "demo-v1",
    provider: "mock",
    status: "suggested",
    summary:
      pending > 0
        ? `${pending} pending row(s) still need human confirmation before commit.`
        : `${approved} confirmed row(s) look ready to commit.`,
  };
  state.advisoriesByJobId[jobId] = [advisory, ...(state.advisoriesByJobId[jobId] ?? [])];
  pushAudit(
    state,
    "ai_advisory.generated",
    { id: advisory.id, kind: "ai_advisory" },
    { importJobId: jobId, provider: "mock" },
    userId,
  );
  pushJobEvent(state, jobId, "ai_advisory.generated", "Mock advisory generated.", userId);
  return advisory;
}

function filterAuditEvents(events: AuditEvent[], url: URL): AuditEvent[] {
  const action = url.searchParams.get("action");
  const actorId = url.searchParams.get("actorId");
  const subjectId = url.searchParams.get("subjectId");
  const subjectKind = url.searchParams.get("subjectKind");
  const occurredAfter = url.searchParams.get("occurredAfter");
  const occurredBefore = url.searchParams.get("occurredBefore");
  return events.filter((event) => {
    if (action && event.action !== action) return false;
    if (actorId && event.actor.id !== actorId) return false;
    if (subjectId && event.subject.id !== subjectId) return false;
    if (subjectKind && event.subject.kind !== subjectKind) return false;
    if (occurredAfter && event.occurredAt < occurredAfter) return false;
    if (occurredBefore && event.occurredAt >= occurredBefore) return false;
    return true;
  });
}

function findOrCreateDemoUser(
  state: MockState,
  emailInput?: string,
  role = "admin",
  displayName?: string,
): ApiUser {
  const email = normalizedEmail(emailInput) ?? "admin@example.com";
  const existing = state.users.find((item) => item.email === email);
  if (existing) {
    return existing;
  }
  const created = user(
    `demo-user-${shortId()}`,
    email,
    role,
    displayName || displayNameFromEmail(email),
    nowIso(),
  );
  state.users = [created, ...state.users];
  return created;
}

function requireUser(state: MockState): ApiUser {
  const user = currentUser(state);
  if (!user) {
    throw requestError(401, "unauthorized", "Login is required.");
  }
  return user;
}

function currentUser(state: MockState): ApiUser | null {
  return state.users.find((user) => user.id === state.currentUserId) ?? null;
}

function requireInvitation(state: MockState, invitationId: string | undefined): MockInvitation {
  const invitation = state.invitations.find((item) => item.id === invitationId);
  if (!invitation) {
    throw requestError(404, "invitation_not_found", "Invitation was not found.");
  }
  return invitation;
}

function requireJob(state: MockState, jobId: string): ImportJobListItem {
  const job = state.importJobs.find((item) => item.id === jobId);
  if (!job) {
    throw requestError(404, "import_job_not_found", "Import job was not found.");
  }
  return job;
}

function requireSource(state: MockState, sourceFileId: string): SourceFile {
  const source = state.sourceFiles.find((item) => item.id === sourceFileId);
  if (!source) {
    throw requestError(404, "source_file_not_found", "Source file was not found.");
  }
  return source;
}

function requireAdvisory(
  state: MockState,
  jobId: string,
  advisoryId: string | undefined,
): AiAdvisoryArtifact {
  const advisory = (state.advisoriesByJobId[jobId] ?? []).find((item) => item.id === advisoryId);
  if (!advisory) {
    throw requestError(404, "advisory_not_found", "Advisory was not found.");
  }
  return advisory;
}

function user(
  id: string,
  email: string,
  role: string,
  displayName: string,
  createdAt: string,
): ApiUser {
  return {
    createdAt,
    displayName,
    email,
    id,
    role,
  };
}

function sourceFile(
  id: string,
  filename: string,
  objectKey: string,
  contentHash: string,
  size: number,
  uploadedBy: string,
  uploadedAt: string,
  contentType = "text/plain",
  workspaceId = demoWorkspaceId,
): SourceFile {
  return {
    contentHash,
    contentType,
    filename,
    id,
    objectKey,
    size,
    uploadedAt,
    uploadedBy,
    workspaceId,
  };
}

function importJob(
  id: string,
  source: SourceFile,
  status: string,
  createdBy: string,
  createdAt: string,
  failure?: {
    failureClass: string;
    failureReason: string;
  },
): ImportJobListItem {
  return {
    adapterId: "starter-demo-adapter",
    attemptCount: failure ? 2 : 1,
    completedAt: status === "done" ? createdAt : null,
    createdAt,
    createdBy,
    failureClass: failure?.failureClass ?? null,
    failureReason: failure?.failureReason ?? null,
    id,
    jobKind: "import_review",
    processingStartedAt: createdAt,
    sourceFile: {
      contentType: source.contentType,
      filename: source.filename,
      workspaceId: source.workspaceId,
    },
    sourceFileId: source.id,
    status,
    updatedAt: createdAt,
  };
}

function stagedRecord(
  job: ImportJobListItem,
  id: string,
  sourceRowKey: string,
  payload: unknown,
  reviewStatus: string,
): StagedRecord {
  return {
    committedRecordId: null,
    createdAt: job.createdAt,
    id,
    importJobId: job.id,
    payload,
    reviewStatus,
    sourceFileId: job.sourceFileId,
    sourceRowKey,
    stagedRecordKey: sourceRowKey,
    updatedAt: job.updatedAt,
  };
}

function recordsFromContent(job: ImportJobListItem, contentText: string): StagedRecord[] {
  const lines = contentText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("label,"));
  const rows = lines.length > 0 ? lines.slice(0, 6) : ["Sample Record,1.1992"];
  return rows.map((line, index) => {
    const [label = `Record ${index + 1}`, rawValue = String(index + 1)] = line.split(",");
    const value = Number.parseFloat(rawValue);
    return stagedRecord(
      job,
      `demo-record-${shortId()}-${index + 1}`,
      `row:${index + 1}`,
      {
        label,
        value: Number.isFinite(value) ? value : rawValue,
      },
      index === 0 ? "pending" : "approved",
    );
  });
}

function invitation(
  id: string,
  email: string,
  role: string,
  status: string,
  token: string,
  createdAt: string,
): MockInvitation {
  return {
    acceptedAt: null,
    createdAt,
    createdBy: "demo-admin",
    email,
    expiresAt: hoursFrom(createdAt, 72),
    id,
    latestEmailErrorMessage: null,
    latestEmailMessageId: `email-${id}`,
    latestEmailProviderMessageId: `mock-${id}`,
    latestEmailStatus: "stored",
    revokedAt: null,
    role,
    status,
    token,
  };
}

function invitationResponse(invitation: MockInvitation) {
  return {
    delivery: "mock",
    emailDelivery: mockEmailDelivery(invitation.latestEmailStatus ?? "stored"),
    invitation: publicInvitation(invitation),
    inviteToken: invitation.token,
    inviteUrl: new URL(`/invite/${invitation.token}`, window.location.origin).toString(),
  };
}

function publicInvitation(invitation: MockInvitation): InvitationSummary {
  const { token: _token, ...publicShape } = invitation;
  return publicShape;
}

function mockEmailDelivery(status: string) {
  return {
    emailMessageId: `email-${shortId()}`,
    mode: "mock",
    provider: "browser-local-state",
    providerMessageId: `mock-${shortId()}`,
    sentAt: nowIso(),
    status,
  };
}

function jobEvent(
  job: ImportJobListItem,
  eventType: string,
  statusFrom: string | null,
  statusTo: string | null,
  message: string,
  createdAt: string,
): ImportJobEvent {
  return {
    actorUserId: null,
    createdAt,
    eventType,
    id: `event-${shortId()}`,
    importJobId: job.id,
    message,
    metadata: {},
    requestId: null,
    sourceFileId: job.sourceFileId,
    statusFrom,
    statusTo,
  };
}

function pushJobEvent(
  state: MockState,
  jobId: string,
  eventType: string,
  message: string,
  actorUserId: string | null,
  options: {
    statusFrom?: string | null;
    statusTo?: string | null;
  } = {},
): void {
  const job = requireJob(state, jobId);
  const event: ImportJobEvent = {
    actorUserId,
    createdAt: nowIso(),
    eventType,
    id: `event-${shortId()}`,
    importJobId: job.id,
    message,
    metadata: { demo: true },
    requestId: null,
    sourceFileId: job.sourceFileId,
    statusFrom: options.statusFrom ?? null,
    statusTo: options.statusTo ?? null,
  };
  state.importJobEventsByJobId[jobId] = [event, ...(state.importJobEventsByJobId[jobId] ?? [])];
}

function pushAudit(
  state: MockState,
  action: string,
  subject: AuditEvent["subject"],
  metadata: unknown,
  actorId = state.currentUserId ?? "demo-system",
): void {
  state.auditEvents = [
    auditEvent(`audit-${shortId()}`, action, actorId, subject.kind, subject.id, metadata),
    ...state.auditEvents,
  ];
}

function auditEvent(
  id: string,
  action: string,
  actorId: string,
  subjectKind: string,
  subjectId: string,
  metadata: unknown,
): AuditEvent {
  return {
    action,
    actor: {
      id: actorId,
      kind: "user",
    },
    id,
    metadata,
    occurredAt: nowIso(),
    subject: {
      id: subjectId,
      kind: subjectKind,
    },
  };
}

async function readJsonBody<T>(options: RequestOptions): Promise<T> {
  const body = options.body;
  if (!body) return {} as T;
  if (typeof body === "string") return JSON.parse(body) as T;
  if (body instanceof Blob) return JSON.parse(await body.text()) as T;
  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries()) as T;
  }
  return {} as T;
}

async function bodyText(body: BodyInit | null | undefined): Promise<string> {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body instanceof Blob) return body.text();
  if (body instanceof URLSearchParams) return body.toString();
  return "";
}

function bodySize(body: BodyInit | null | undefined, text: string): number {
  if (body instanceof Blob) return body.size;
  return new TextEncoder().encode(text).byteLength;
}

function limited<T>(items: T[], url: URL): T[] {
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  return items.slice(0, Number.isFinite(limit) && limit > 0 ? limit : items.length);
}

function respond<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requestError(status: number, code: string, message: string): MockApiRequestError {
  return new MockApiRequestError({
    code,
    message,
    status,
  });
}

function normalizedEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

function displayNameFromEmail(email: string): string {
  return email
    .split("@")[0]!
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function nowIso(): string {
  return new Date().toISOString();
}

function oneDayFromNow(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function hoursFrom(value: string, hours: number): string {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
