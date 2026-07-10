import type { ImportJobMessage } from "@qitu/jobs";
import type { AppContext } from "./http-utils";
import { processImportJob } from "./import-job-runner";
import { isLocalAppEnv } from "./runtime";

export function scheduleFastImportProcessing(context: AppContext, message: ImportJobMessage): void {
  if (isLocalAppEnv(context.env) && context.req.header("x-disable-fast-import") === "1") {
    return;
  }

  context.executionCtx.waitUntil(
    processImportJob(context.env, message, { mode: "fast" }).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          error: error instanceof Error ? error.message : "unknown error",
          importJobId: message.jobId,
          message: "Fast import processing failed before the queue fallback.",
          sourceFileId: message.sourceFileId,
        }),
      );
    }),
  );
}
