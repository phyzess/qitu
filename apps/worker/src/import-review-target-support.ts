import type { CurrentUser } from "./auth-types";
import { readCurrentUser, requirePermission } from "./auth-routes";
import { authError, type AppContext } from "./http-utils";
import { getImportAdapter, type WorkerImportAdapter } from "./import-adapters";
import { readImportJobReview } from "./import-review-job-read";
import type { ImportJobReviewRow } from "./import-review-row-types";

type TargetFailure = {
  ok: false;
  response: Response;
};

export type ImportReviewAuthorizedUserResult =
  | {
      ok: true;
      current: CurrentUser;
    }
  | TargetFailure;

export type ImportReviewJobAdapterResult =
  | {
      ok: true;
      adapter: WorkerImportAdapter;
      job: ImportJobReviewRow;
      jobId: string;
    }
  | TargetFailure;

export async function readImportReviewAuthorizedUser(
  context: AppContext,
  permission: "import_job:commit" | "review:decide",
): Promise<ImportReviewAuthorizedUserResult> {
  const current = await readCurrentUser(context);
  if (!current) {
    return {
      ok: false,
      response: authError(context, "unauthorized", "Login is required.", 401),
    };
  }

  const denied = await requirePermission(context, current, permission);
  if (denied) {
    return {
      ok: false,
      response: denied,
    };
  }

  return {
    ok: true,
    current,
  };
}

export async function readImportReviewJobAdapter(
  context: AppContext,
  jobId: string,
): Promise<ImportReviewJobAdapterResult> {
  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return {
      ok: false,
      response: authError(context, "import_job_not_found", "Import job was not found.", 404),
    };
  }

  if (job.status === "voided") {
    return {
      ok: false,
      response: authError(
        context,
        "import_job_voided",
        "Voided import jobs are retained for reporting and cannot be changed.",
        409,
      ),
    };
  }
  if (job.deletion_started_at || job.deleted_at) {
    return {
      ok: false,
      response: authError(
        context,
        "source_file_deleting",
        "Review changes are unavailable while the source is being deleted.",
        409,
      ),
    };
  }
  if (job.status === "queued" || job.status === "processing" || job.status === "committing") {
    return {
      ok: false,
      response: authError(
        context,
        "import_job_not_reviewable",
        "Queued, processing, or committing import jobs cannot be changed through review routes.",
        409,
      ),
    };
  }

  const adapter = getImportAdapter(job.adapter_id);
  if (!adapter) {
    return {
      ok: false,
      response: authError(
        context,
        "import_adapter_not_found",
        "Import adapter is not registered for this job.",
        409,
      ),
    };
  }

  return {
    ok: true,
    adapter,
    job,
    jobId,
  };
}
