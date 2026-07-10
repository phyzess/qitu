import { parseImportJobMessage, type ImportJobMessage } from "@qitu/jobs";
import { Hono } from "hono";
import { registerAiAdvisoryRoutes } from "./ai-advisory-routes";
import { registerAuditRoutes } from "./audit-routes";
import { registerAuthRoutes } from "./auth-routes";
import { registerImportJobRoutes } from "./import-job-routes";
import { processImportJob } from "./import-job-runner";
import { registerImportReviewRoutes } from "./import-review-routes";
import { handleInboundEmail } from "./inbound-email";
import { runtimeConfig } from "./runtime";
import { registerSourceRoutes } from "./source-routes";
import { recoverPendingSourceDeletions } from "./source-deletion-recovery";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (context) => {
  const runtime = runtimeConfig(context.env);

  return context.json({
    ok: true,
    service: "qitu-worker",
    environment: runtime.APP_ENV,
  });
});

registerAuthRoutes(app);
registerSourceRoutes(app);
registerImportJobRoutes(app);
registerAuditRoutes(app);
registerImportReviewRoutes(app);
registerAiAdvisoryRoutes(app);

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = parseImportJobMessage(message.body);
      const result = await processImportJob(env, body, { mode: "queue" });
      if (result.retryDelaySeconds !== undefined) {
        message.retry({ delaySeconds: result.retryDelaySeconds });
      }
    }
  },
  async email(message, env) {
    await handleInboundEmail(message, env);
  },
  async scheduled(_controller, env) {
    const summary = await recoverPendingSourceDeletions(env);
    if (summary.scanned > 0) {
      console.log(
        JSON.stringify({
          message: "Source deletion recovery completed.",
          ...summary,
        }),
      );
    }
  },
} satisfies ExportedHandler<Env, ImportJobMessage>;
