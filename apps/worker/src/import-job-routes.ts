import type { Hono } from "hono";
import { registerImportJobDevRoutes } from "./import-job-dev-routes";
import { registerImportJobEventsRoute } from "./import-job-events-route";
import { registerImportJobListRoute } from "./import-job-list-route";
import { registerImportJobRedispatchRoute } from "./import-job-redispatch-route";
import { retryImportJobResponse } from "./import-job-retry-route";
import { registerImportJobVoidRoute } from "./import-job-void-route";

export function registerImportJobRoutes(app: Hono<{ Bindings: Env }>): void {
  registerImportJobDevRoutes(app);
  registerImportJobListRoute(app);
  registerImportJobEventsRoute(app);
  registerImportJobRedispatchRoute(app);
  registerImportJobVoidRoute(app);

  app.post("/api/import-jobs/:jobId/retry", async (context) => {
    return retryImportJobResponse(context);
  });
}
