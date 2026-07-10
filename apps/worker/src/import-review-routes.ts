import type { Hono } from "hono";
import { registerImportReviewAdjustmentRoute } from "./import-review-adjustment-route";
import { commitApprovedReviewRecordsResponse } from "./import-review-commit-route";
import { confirmPendingReviewRecordsResponse } from "./import-review-confirm-pending-route";
import { recordReviewDecisionResponse } from "./import-review-decision-routes";
import { registerImportReviewDetailRoute } from "./import-review-detail-route";

export function registerImportReviewRoutes(app: Hono<{ Bindings: Env }>): void {
  registerImportReviewDetailRoute(app);
  registerImportReviewAdjustmentRoute(app);

  app.post("/api/import-jobs/:jobId/staged-records/:recordId/approve", async (context) => {
    return recordReviewDecisionResponse(context, "approve");
  });

  app.post("/api/import-jobs/:jobId/staged-records/:recordId/reject", async (context) => {
    return recordReviewDecisionResponse(context, "reject");
  });

  app.post("/api/import-jobs/:jobId/review/confirm-pending", async (context) => {
    return confirmPendingReviewRecordsResponse(context);
  });

  app.post("/api/import-jobs/:jobId/commit", async (context) => {
    return commitApprovedReviewRecordsResponse(context);
  });
}
