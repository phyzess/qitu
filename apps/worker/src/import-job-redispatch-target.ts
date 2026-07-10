import type { CurrentUser } from "./auth-types";
import { readCurrentUser, requirePermission } from "./auth-routes";
import { authError, type AppContext } from "./http-utils";
import { readImportJobReview } from "./import-review-job-read";
import type { ImportJobReviewRow } from "./import-review-row-types";

type ImportJobRedispatchTargetResult =
  | {
      current: CurrentUser;
      job: ImportJobReviewRow;
      jobId: string;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

export async function readImportJobRedispatchTarget(
  context: AppContext,
): Promise<ImportJobRedispatchTargetResult> {
  const current = await readCurrentUser(context);
  if (!current) {
    return {
      ok: false,
      response: authError(context, "unauthorized", "Login is required.", 401),
    };
  }

  const denied = await requirePermission(context, current, "import_job:retry");
  if (denied) {
    return {
      ok: false,
      response: denied,
    };
  }

  const jobId = context.req.param("jobId");
  if (!jobId) {
    return {
      ok: false,
      response: authError(context, "import_job_not_found", "Import job was not found.", 404),
    };
  }

  const job = await readImportJobReview(context.env, jobId);
  if (!job) {
    return {
      ok: false,
      response: authError(context, "import_job_not_found", "Import job was not found.", 404),
    };
  }

  if (job.status !== "queued") {
    return {
      ok: false,
      response: authError(
        context,
        "import_job_not_queued",
        "Only queued import jobs can be dispatched again.",
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
        "Queued jobs cannot be dispatched while their source is being deleted.",
        409,
      ),
    };
  }

  return {
    current,
    job,
    jobId,
    ok: true,
  };
}
