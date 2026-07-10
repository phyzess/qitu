import type { CurrentUser } from "./auth-types";
import { authError, type AppContext } from "./http-utils";
import { getImportAdapter, type WorkerImportAdapter } from "./import-adapters";
import { readImportJobReview } from "./import-review-job-read";
import { isImportReviewMutationStale } from "./import-review-mutation-claim";
import type { ImportJobReviewRow } from "./import-review-row-types";
import {
  readImportReviewAuthorizedUser,
  readImportReviewJobAdapter,
} from "./import-review-target-support";

type CommitTargetResult =
  | {
      ok: true;
      adapter: WorkerImportAdapter;
      current: CurrentUser;
      job: ImportJobReviewRow;
      jobId: string;
    }
  | {
      ok: false;
      response: Response;
    };

export async function readImportReviewCommitTarget(
  context: AppContext,
): Promise<CommitTargetResult> {
  const reviewer = await readImportReviewAuthorizedUser(context, "import_job:commit");
  if (!reviewer.ok) {
    return reviewer;
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
  if (job.status === "committing") {
    if (
      job.mutation_kind !== "commit" ||
      !isImportReviewMutationStale(job.mutation_started_at, job.mutation_kind)
    ) {
      return {
        ok: false,
        response: authError(
          context,
          "import_commit_in_progress",
          "This import commit is still active or belongs to the automatic commit path.",
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
          "The source is being deleted and its commit cannot be resumed.",
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
      current: reviewer.current,
      job,
      jobId,
    };
  }

  const target = await readImportReviewJobAdapter(context, jobId);
  if (!target.ok) {
    return target;
  }

  return {
    ok: true,
    adapter: target.adapter,
    current: reviewer.current,
    job: target.job,
    jobId,
  };
}
