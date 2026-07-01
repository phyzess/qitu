import { generateLocalImportReviewAdvisory, requiresHumanConfirmation } from "@qitu/ai-advisory";
import { createAuditEvent } from "@qitu/audit";
import { buildSourceFileKey, hashSourceContent } from "@qitu/files";
import { parseImportJobMessage, type ImportJobMessage } from "@qitu/jobs";
import { Hono } from "hono";
import { prepareAuditInsert } from "./audit-store";
import {
  prepareAiAdvisoryInsert,
  publicAiAdvisoryArtifact,
  readAiAdvisoryArtifacts,
  type AiAdvisoryArtifactRow,
} from "./ai-advisory-store";
import { readCurrentUser, registerAuthRoutes, requirePermission } from "./auth-routes";
import {
  prepareImportJobEventInsert,
  publicImportJobEvent,
  readImportJobEvents,
  requestFingerprint,
} from "./event-store";
import { authError, parseQueryLimit, type AppContext } from "./http-utils";
import { selectImportAdapter } from "./import-adapters";
import { markImportJobFailed, processImportJob } from "./import-job-runner";
import { readImportReviewStats } from "./import-review-stats";
import { readImportJobReview, registerImportReviewRoutes } from "./import-review-routes";
import { isLocalAppEnv, runtimeConfig } from "./runtime";

const app = new Hono<{ Bindings: Env }>();

type DuplicateSourceFileRow = {
  source_file_id: string;
  object_key: string;
  import_job_id: string | null;
  status: string | null;
};

type SourceFileRow = {
  id: string;
  workspace_id: string;
  object_key: string;
  filename: string;
  content_type: string;
  content_hash: string | null;
  size: number | null;
  uploaded_by: string;
  uploaded_at: string;
};

type ImportJobListRow = {
  id: string;
  source_file_id: string;
  status: string;
  job_kind: string | null;
  adapter_id: string | null;
  attempt_count: number | null;
  failure_reason: string | null;
  failure_class: string | null;
  processing_started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  filename: string;
  content_type: string;
  workspace_id: string;
};

type PendingImportJobRow = {
  id: string;
  source_file_id: string;
  object_key: string;
  created_by: string;
};

type AuditEventRow = {
  id: string;
  action: string;
  actor_id: string;
  actor_kind: string;
  subject_id: string;
  subject_kind: string;
  metadata_json: string | null;
  occurred_at: string;
};

app.get("/health", (context) => {
  const runtime = runtimeConfig(context.env);

  return context.json({
    ok: true,
    service: "qitu-worker",
    environment: runtime.APP_ENV,
  });
});

registerAuthRoutes(app);

app.get("/api/source-files", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const workspaceId = context.req.query("workspaceId") ?? "default";
  const limit = parseQueryLimit(context.req.query("limit"), 50);
  const result = await context.env.DB.prepare(
    `
      SELECT
        id,
        workspace_id,
        object_key,
        filename,
        content_type,
        content_hash,
        size,
        uploaded_by,
        uploaded_at
      FROM source_files
      WHERE workspace_id = ?
      ORDER BY uploaded_at DESC
      LIMIT ?
    `,
  )
    .bind(workspaceId, limit)
    .all<SourceFileRow>();

  return context.json({
    sourceFiles: result.results.map(publicSourceFile),
  });
});

app.get("/api/import-jobs", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const workspaceId = context.req.query("workspaceId") ?? "default";
  const status = context.req.query("status") ?? null;
  const limit = parseQueryLimit(context.req.query("limit"), 50);
  const result = await context.env.DB.prepare(
    `
      SELECT
        import_jobs.id,
        import_jobs.source_file_id,
        import_jobs.status,
        import_jobs.job_kind,
        import_jobs.adapter_id,
        import_jobs.attempt_count,
        import_jobs.failure_reason,
        import_jobs.failure_class,
        import_jobs.processing_started_at,
        import_jobs.completed_at,
        import_jobs.created_by,
        import_jobs.created_at,
        import_jobs.updated_at,
        source_files.filename,
        source_files.content_type,
        source_files.workspace_id
      FROM import_jobs
      INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
      WHERE source_files.workspace_id = ?
        AND (? IS NULL OR import_jobs.status = ?)
      ORDER BY import_jobs.created_at DESC
      LIMIT ?
    `,
  )
    .bind(workspaceId, status, status, limit)
    .all<ImportJobListRow>();

  return context.json({
    importJobs: result.results.map(publicImportJobListItem),
  });
});

app.get("/api/import-jobs/:jobId/events", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const limit = parseQueryLimit(context.req.query("limit"), 50);
  const events = await readImportJobEvents(context.env, {
    importJobId: jobId,
    limit,
  });

  return context.json({
    events: events.map(publicImportJobEvent),
  });
});

app.get("/api/audit-events", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const subjectId = context.req.query("subjectId") ?? null;
  const subjectKind = context.req.query("subjectKind") ?? null;
  const actorId = context.req.query("actorId") ?? null;
  const action = context.req.query("action") ?? null;
  const occurredAfter = parseIsoDateTimeQuery(context.req.query("occurredAfter"));
  const occurredBefore = parseIsoDateTimeQuery(context.req.query("occurredBefore"));
  if (occurredAfter === false || occurredBefore === false) {
    return context.json(
      {
        error: {
          code: "invalid_audit_date_filter",
          message: "Audit date filters must be valid ISO date-time values.",
        },
      },
      400,
    );
  }
  const limit = parseQueryLimit(context.req.query("limit"), 50);
  const result = await context.env.DB.prepare(
    `
      SELECT
        id,
        action,
        actor_id,
        actor_kind,
        subject_id,
        subject_kind,
        metadata_json,
        occurred_at
      FROM audit_events
      WHERE (? IS NULL OR subject_id = ?)
        AND (? IS NULL OR subject_kind = ?)
        AND (? IS NULL OR actor_id = ?)
        AND (? IS NULL OR action = ?)
        AND (? IS NULL OR occurred_at >= ?)
        AND (? IS NULL OR occurred_at < ?)
      ORDER BY occurred_at DESC
      LIMIT ?
    `,
  )
    .bind(
      subjectId,
      subjectId,
      subjectKind,
      subjectKind,
      actorId,
      actorId,
      action,
      action,
      occurredAfter,
      occurredAfter,
      occurredBefore,
      occurredBefore,
      limit,
    )
    .all<AuditEventRow>();

  return context.json({
    auditEvents: result.results.map(publicAuditEvent),
  });
});

app.post("/api/source-files", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "source_file:upload");
  if (denied) return denied;

  if (!context.req.raw.body) {
    return context.json(
      {
        error: {
          code: "missing_body",
          message: "Request body is required.",
        },
      },
      400,
    );
  }

  const content = await context.req.arrayBuffer();
  if (content.byteLength === 0) {
    return context.json(
      {
        error: {
          code: "empty_body",
          message: "Request body must not be empty.",
        },
      },
      400,
    );
  }

  const sourceFileId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const filename = context.req.header("x-filename") ?? "source.bin";
  const contentType = context.req.header("content-type") ?? "application/octet-stream";
  const adapter = selectImportAdapter({
    filename,
    contentType,
  });
  if (!adapter) {
    return context.json(
      {
        error: {
          code: "unsupported_source_file",
          message: "No import adapter can handle this source file.",
        },
      },
      415,
    );
  }

  const workspaceId = context.req.header("x-workspace-id") ?? "default";
  const size = content.byteLength;
  const contentHash = await hashSourceContent(content);
  const idempotencyKey = `${workspaceId}:${contentHash}`;
  const now = new Date().toISOString();
  const duplicate = await findDuplicateSourceFile(context.env, {
    workspaceId,
    contentHash,
  });

  if (duplicate) {
    return context.json({
      sourceFileId: duplicate.source_file_id,
      importJobId: duplicate.import_job_id,
      objectKey: duplicate.object_key,
      status: duplicate.status,
      duplicate: true,
    });
  }

  const objectKey = buildSourceFileKey({
    workspaceId,
    sourceFileId,
    filename,
  });
  const fingerprint = await requestFingerprint(context);

  await context.env.SOURCE_FILES.put(objectKey, content, {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      contentHash,
      uploadedBy: current.user.id,
    },
  });

  const message: ImportJobMessage = {
    kind: "import.source_file",
    jobId,
    sourceFileId,
    objectKey,
    requestedBy: current.user.id,
  };

  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `
          INSERT INTO source_files (
            id, workspace_id, object_key, filename, content_type, content_hash, size, uploaded_by, uploaded_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        sourceFileId,
        workspaceId,
        objectKey,
        filename,
        contentType,
        contentHash,
        size,
        current.user.id,
        now,
      ),
      context.env.DB.prepare(
        `
          INSERT INTO import_jobs (
            id,
            source_file_id,
            status,
            job_kind,
            adapter_id,
            idempotency_key,
            attempt_count,
            created_by,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        jobId,
        sourceFileId,
        "queued",
        adapter.jobKind,
        adapter.id,
        idempotencyKey,
        0,
        current.user.id,
        now,
        now,
      ),
      prepareAuditInsert(
        context.env,
        createAuditEvent({
          action: "source_file.uploaded",
          actor: {
            id: current.user.id,
            kind: "user",
          },
          subject: {
            id: sourceFileId,
            kind: "source_file",
          },
          metadata: {
            workspaceId,
            objectKey,
            filename,
            contentType,
            contentHash,
            importJobId: jobId,
          },
        }),
      ),
      prepareImportJobEventInsert(context.env, {
        importJobId: jobId,
        sourceFileId,
        eventType: "source_file.uploaded",
        statusTo: "stored",
        actorUserId: current.user.id,
        message: "Source file stored.",
        requestId: fingerprint.requestId,
        createdAt: now,
        metadata: {
          workspaceId,
          filename,
          contentType,
          contentHash,
        },
      }),
      prepareAuditInsert(
        context.env,
        createAuditEvent({
          action: "import_job.queued",
          actor: {
            id: current.user.id,
            kind: "user",
          },
          subject: {
            id: jobId,
            kind: "import_job",
          },
          metadata: {
            sourceFileId,
            objectKey,
            adapterId: adapter.id,
            jobKind: adapter.jobKind,
          },
        }),
      ),
      prepareImportJobEventInsert(context.env, {
        importJobId: jobId,
        sourceFileId,
        eventType: "import_job.queued",
        statusTo: "queued",
        actorUserId: current.user.id,
        message: "Import job queued.",
        requestId: fingerprint.requestId,
        createdAt: now,
        metadata: {
          objectKey,
          adapterId: adapter.id,
          jobKind: adapter.jobKind,
        },
      }),
    ]);
  } catch (error) {
    await context.env.SOURCE_FILES.delete(objectKey);
    throw error;
  }

  try {
    await context.env.IMPORT_JOBS.send(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Queue dispatch failed.";
    await markImportJobFailed(context.env, {
      jobId,
      sourceFileId,
      reason,
      action: "import_job.dispatch_failed",
      failureClass: "queue_dispatch",
    });

    return context.json(
      {
        error: {
          code: "queue_dispatch_failed",
          message: "Source file was stored, but import job dispatch failed.",
        },
        sourceFileId,
        importJobId: jobId,
        objectKey,
        status: "failed",
      },
      503,
    );
  }

  return context.json(
    {
      sourceFileId,
      importJobId: jobId,
      objectKey,
      status: "queued",
    },
    202,
  );
});

app.post("/api/dev/import-jobs/drain", async (context) => {
  if (!isLocalRuntime(context)) {
    return authError(context, "dev_route_disabled", "This route is only available locally.", 403);
  }

  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "import_job:process");
  if (denied) return denied;

  const limit = parseQueryLimit(context.req.query("limit"), 10);
  const queuedJobs = await context.env.DB.prepare(
    `
      SELECT
        import_jobs.id,
        import_jobs.source_file_id,
        import_jobs.created_by,
        source_files.object_key
      FROM import_jobs
      INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
      WHERE import_jobs.status = 'queued'
      ORDER BY import_jobs.created_at ASC
      LIMIT ?
    `,
  )
    .bind(limit)
    .all<PendingImportJobRow>();

  const processedJobIds: string[] = [];
  for (const job of queuedJobs.results) {
    await processImportJob(context.env, {
      kind: "import.source_file",
      jobId: job.id,
      sourceFileId: job.source_file_id,
      objectKey: job.object_key,
      requestedBy: job.created_by,
    });
    processedJobIds.push(job.id);
  }

  return context.json({
    processedCount: processedJobIds.length,
    processedJobIds,
  });
});

app.post("/api/import-jobs/:jobId/retry", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "import_job:retry");
  if (denied) return denied;

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  if (job.status !== "failed") {
    return authError(
      context,
      "import_job_not_failed",
      "Only failed import jobs can be retried.",
      409,
    );
  }

  const now = new Date().toISOString();
  const fingerprint = await requestFingerprint(context);
  const message: ImportJobMessage = {
    kind: "import.source_file",
    jobId,
    sourceFileId: job.source_file_id,
    objectKey: job.object_key,
    requestedBy: current.user.id,
  };

  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        UPDATE import_jobs
        SET
          status = 'queued',
          failure_reason = NULL,
          failure_class = NULL,
          processing_started_at = NULL,
          completed_at = NULL,
          updated_at = ?
        WHERE id = ? AND status = 'failed'
      `,
    ).bind(now, jobId),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "import_job.retry_queued",
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: jobId,
          kind: "import_job",
        },
        metadata: {
          sourceFileId: job.source_file_id,
          objectKey: job.object_key,
          previousFailureClass: job.failure_class,
        },
      }),
    ),
    prepareImportJobEventInsert(context.env, {
      importJobId: jobId,
      sourceFileId: job.source_file_id,
      eventType: "import_job.retry_queued",
      statusFrom: "failed",
      statusTo: "queued",
      actorUserId: current.user.id,
      message: "Import job retry queued.",
      requestId: fingerprint.requestId,
      createdAt: now,
      metadata: {
        previousFailureClass: job.failure_class,
      },
    }),
  ]);

  try {
    await context.env.IMPORT_JOBS.send(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Queue dispatch failed.";
    await markImportJobFailed(context.env, {
      jobId,
      sourceFileId: job.source_file_id,
      reason,
      action: "import_job.retry_dispatch_failed",
      failureClass: "queue_dispatch",
    });

    return context.json(
      {
        error: {
          code: "queue_dispatch_failed",
          message: "Import job retry was queued in D1, but queue dispatch failed.",
        },
      },
      503,
    );
  }

  return context.json({
    importJobId: jobId,
    status: "queued",
  });
});

registerImportReviewRoutes(app);

app.get("/api/import-jobs/:jobId/advisories", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const advisories = await readAiAdvisoryArtifacts(context.env, jobId);
  return context.json({
    advisories: advisories.map(publicAiAdvisoryArtifact),
  });
});

app.post("/api/import-jobs/:jobId/advisories", async (context) => {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "ai_advisory:write");
  if (denied) return denied;

  const jobId = context.req.param("jobId");
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return authError(context, "import_job_not_found", "Import job was not found.", 404);
  }

  const stats = await readImportReviewStats(context.env, jobId);
  const artifact = await generateLocalImportReviewAdvisory({
    importJobId: jobId,
    createdBy: current.user.id,
    recordCount: stats.recordCount,
    issueCount: stats.issueCount,
    pendingCount: stats.pending,
    approvedCount: stats.approved,
    rejectedCount: stats.rejected,
    committedCount: stats.committed,
  });

  await context.env.DB.batch([
    prepareAiAdvisoryInsert(context.env, artifact),
    prepareImportJobEventInsert(context.env, {
      importJobId: job.id,
      sourceFileId: job.source_file_id,
      eventType: "ai_advisory.generated",
      actorUserId: current.user.id,
      message: "AI advisory generated for import review.",
      createdAt: artifact.createdAt,
      metadata: {
        provider: artifact.provider,
        model: artifact.model,
        promptVersion: artifact.promptVersion,
        humanConfirmationRequired: requiresHumanConfirmation(artifact),
      },
    }),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: "ai_advisory.generated",
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: artifact.id,
          kind: "ai_advisory_artifact",
        },
        metadata: {
          importJobId: job.id,
          provider: artifact.provider,
          model: artifact.model,
          promptVersion: artifact.promptVersion,
          humanConfirmationRequired: requiresHumanConfirmation(artifact),
        },
      }),
    ),
  ]);

  return context.json(
    {
      advisory: artifact,
    },
    201,
  );
});

app.post("/api/import-jobs/:jobId/advisories/:advisoryId/confirm", async (context) => {
  return updateAiAdvisoryStatusResponse(context, "confirmed");
});

app.post("/api/import-jobs/:jobId/advisories/:advisoryId/dismiss", async (context) => {
  return updateAiAdvisoryStatusResponse(context, "dismissed");
});

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = parseImportJobMessage(message.body);
      await processImportJob(env, body);
    }
  },
} satisfies ExportedHandler<Env, ImportJobMessage>;

async function updateAiAdvisoryStatusResponse(
  context: AppContext,
  targetStatus: "confirmed" | "dismissed",
): Promise<Response> {
  const current = await readCurrentUser(context);
  if (!current) {
    return authError(context, "unauthorized", "Login is required.", 401);
  }
  const denied = await requirePermission(context, current, "ai_advisory:write");
  if (denied) return denied;

  const jobId = context.req.param("jobId");
  const advisoryId = context.req.param("advisoryId");
  if (!jobId || !advisoryId) {
    return authError(context, "ai_advisory_not_found", "AI advisory was not found.", 404);
  }

  const advisory = await context.env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        kind,
        status,
        provider,
        model,
        prompt_version,
        summary,
        output_json,
        created_by,
        created_at,
        confirmed_by,
        confirmed_at,
        dismissed_by,
        dismissed_at
      FROM ai_advisory_artifacts
      WHERE id = ? AND import_job_id = ?
      LIMIT 1
    `,
  )
    .bind(advisoryId, jobId)
    .first<AiAdvisoryArtifactRow>();

  if (!advisory) {
    return authError(context, "ai_advisory_not_found", "AI advisory was not found.", 404);
  }

  if (advisory.status === targetStatus) {
    return context.json({
      advisory: publicAiAdvisoryArtifact(advisory),
      duplicate: true,
    });
  }

  if (advisory.status !== "suggested") {
    return authError(
      context,
      "ai_advisory_not_suggested",
      "Only suggested AI advisories can be updated.",
      409,
    );
  }

  const now = new Date().toISOString();
  const columnPrefix = targetStatus === "confirmed" ? "confirmed" : "dismissed";
  await context.env.DB.batch([
    context.env.DB.prepare(
      `
        UPDATE ai_advisory_artifacts
        SET status = ?, ${columnPrefix}_by = ?, ${columnPrefix}_at = ?
        WHERE id = ? AND import_job_id = ? AND status = 'suggested'
      `,
    ).bind(targetStatus, current.user.id, now, advisoryId, jobId),
    prepareImportJobEventInsert(context.env, {
      importJobId: jobId,
      eventType: `ai_advisory.${targetStatus}`,
      actorUserId: current.user.id,
      message: `AI advisory ${targetStatus}.`,
      createdAt: now,
      metadata: {
        advisoryId,
      },
    }),
    prepareAuditInsert(
      context.env,
      createAuditEvent({
        action: `ai_advisory.${targetStatus}`,
        actor: {
          id: current.user.id,
          kind: "user",
        },
        subject: {
          id: advisoryId,
          kind: "ai_advisory_artifact",
        },
        metadata: {
          importJobId: jobId,
        },
      }),
    ),
  ]);

  return context.json({
    advisory: publicAiAdvisoryArtifact({
      ...advisory,
      status: targetStatus,
      ...(targetStatus === "confirmed"
        ? {
            confirmed_by: current.user.id,
            confirmed_at: now,
          }
        : {
            dismissed_by: current.user.id,
            dismissed_at: now,
          }),
    }),
  });
}

async function findDuplicateSourceFile(
  env: Env,
  input: { workspaceId: string; contentHash: string },
): Promise<DuplicateSourceFileRow | null> {
  return env.DB.prepare(
    `
      SELECT
        source_files.id AS source_file_id,
        source_files.object_key,
        import_jobs.id AS import_job_id,
        import_jobs.status
      FROM source_files
      LEFT JOIN import_jobs ON import_jobs.source_file_id = source_files.id
      WHERE source_files.workspace_id = ?
        AND source_files.content_hash = ?
      ORDER BY import_jobs.created_at DESC
      LIMIT 1
    `,
  )
    .bind(input.workspaceId, input.contentHash)
    .first<DuplicateSourceFileRow>();
}

function publicSourceFile(row: SourceFileRow): Record<string, unknown> {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    objectKey: row.object_key,
    filename: row.filename,
    contentType: row.content_type,
    contentHash: row.content_hash,
    size: row.size,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

function publicImportJobListItem(row: ImportJobListRow): Record<string, unknown> {
  return {
    id: row.id,
    sourceFileId: row.source_file_id,
    status: row.status,
    jobKind: row.job_kind,
    adapterId: row.adapter_id,
    attemptCount: row.attempt_count ?? 0,
    failureReason: row.failure_reason,
    failureClass: row.failure_class,
    processingStartedAt: row.processing_started_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceFile: {
      filename: row.filename,
      contentType: row.content_type,
      workspaceId: row.workspace_id,
    },
  };
}

function publicAuditEvent(row: AuditEventRow): Record<string, unknown> {
  return {
    id: row.id,
    action: row.action,
    actor: {
      id: row.actor_id,
      kind: row.actor_kind,
    },
    subject: {
      id: row.subject_id,
      kind: row.subject_kind,
    },
    metadata: row.metadata_json ? parseJsonValue(row.metadata_json) : {},
    occurredAt: row.occurred_at,
  };
}

function parseIsoDateTimeQuery(value: string | undefined): string | null | false {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? false : new Date(timestamp).toISOString();
}

function parseJsonValue(value: string): unknown {
  return JSON.parse(value);
}

function isLocalRuntime(context: AppContext): boolean {
  return isLocalAppEnv(context.env);
}
