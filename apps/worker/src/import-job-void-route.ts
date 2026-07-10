import type { Hono } from "hono";
import { readCurrentUser, requirePermission } from "./auth-routes";
import { authError } from "./http-utils";
import { getImportAdapter } from "./import-adapters";
import { readImportJobReview } from "./import-review-job-read";
import { voidImportJob } from "./import-job-void-statements";
import { parseRequestJson } from "./http-utils";
import { ReviewDecisionInputSchema } from "./import-review-decision-input";
import { isImportReviewMutationStale } from "./import-review-mutation-claim";

export function registerImportJobVoidRoute(app: Hono<{ Bindings: Env }>): void {
  app.post("/api/import-jobs/:jobId/void", async (context) => {
    const current = await readCurrentUser(context);
    if (!current) {
      return authError(context, "unauthorized", "Login is required.", 401);
    }

    const denied = await requirePermission(context, current, "review:decide");
    if (denied) return denied;

    let note: string | null = null;
    if (context.req.header("content-type")?.includes("application/json")) {
      const input = await parseRequestJson(context, ReviewDecisionInputSchema);
      if (!input.ok) return input.response;
      note = input.value.note ?? null;
    }

    const jobId = context.req.param("jobId");
    const job = await readImportJobReview(context.env, jobId);
    if (!job) {
      return authError(context, "import_job_not_found", "Import job was not found.", 404);
    }
    if (job.status === "committed") {
      return authError(
        context,
        "committed_import_job",
        "Committed import jobs require app-owned source cleanup and cannot be voided directly.",
        409,
      );
    }
    if (job.status === "processing" || job.status === "committing") {
      return authError(
        context,
        "import_job_processing",
        "Processing or committing jobs cannot be voided directly; delete the source through its cleanup path or retry after the active mutation stops.",
        409,
      );
    }
    if (job.status === "voided") {
      return context.json({ importJobId: job.id, status: "voided", duplicate: true });
    }
    if (
      job.mutation_token &&
      !isImportReviewMutationStale(job.mutation_started_at, job.mutation_kind)
    ) {
      return authError(
        context,
        "import_review_mutation_in_progress",
        "An active review change must finish before this import job can be voided.",
        409,
      );
    }

    const adapter = getImportAdapter(job.adapter_id);
    if (!adapter) {
      return authError(
        context,
        "import_adapter_not_found",
        "Import adapter is not registered for this job.",
        409,
      );
    }
    const committedRecords = await adapter.reviewStore.readCommittedRecords(context.env, job.id);
    if (committedRecords.length > 0) {
      return authError(
        context,
        "committed_import_job",
        "Jobs with committed records require app-owned source cleanup and cannot be voided directly.",
        409,
      );
    }

    const voidedAt = new Date().toISOString();
    const voided = await voidImportJob(context.env, {
      actorUserId: current.user.id,
      importJobId: job.id,
      note,
      reason: "user_requested",
      sourceFileId: job.source_file_id,
      statusFrom: job.status,
      voidedAt,
    });
    if (!voided) {
      const currentJob = await readImportJobReview(context.env, job.id);
      if (currentJob?.status === "voided") {
        return context.json({ importJobId: job.id, status: "voided", duplicate: true });
      }
      return authError(
        context,
        "import_job_state_changed",
        "Import job state changed before it could be voided; reload and retry.",
        409,
      );
    }

    return context.json({ importJobId: job.id, status: "voided", voidedAt });
  });
}
