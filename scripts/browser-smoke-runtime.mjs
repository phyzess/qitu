import { join } from "node:path";
import process from "node:process";
import { launchChromium } from "./browser-smoke-browser-launch.mjs";
import {
  cleanupBrowserSmokeDatabase,
  prepareBrowserSmokeDatabase,
} from "./browser-smoke-database.mjs";
import { startBrowserSmokeDevServer } from "./browser-smoke-dev-server.mjs";
import { findOpenPort, postWorkerJson, waitForHttp } from "./browser-smoke-network.mjs";

export async function createBrowserSmokeRuntime(root = process.cwd()) {
  const webPort = process.env.QITU_WEB_PORT ?? (await findOpenPort());
  const webUrl = `http://localhost:${webPort}`;
  const workerPort = process.env.QITU_WORKER_PORT ?? (await findOpenPort());
  const workerUrl = `http://127.0.0.1:${workerPort}`;
  const workerHealthUrl = `${workerUrl}/health`;
  const d1PersistTo =
    process.env.QITU_BROWSER_SMOKE_PERSIST_TO ??
    join(root, ".tmp", `browser-smoke-wrangler-${process.pid}`);
  await prepareBrowserSmokeDatabase({
    persistTo: d1PersistTo,
    root,
  });
  const devServer = startBrowserSmokeDevServer({
    d1PersistTo,
    root,
    webPort,
    webUrl,
    workerPort,
    workerUrl,
  });

  return {
    dumpServerLog: devServer.dumpServerLog,
    launchChromium,
    postWorkerJson: (path, body) => postWorkerJson(workerUrl, path, body),
    async stopServer() {
      try {
        await devServer.stopServer();
      } finally {
        await cleanupBrowserSmokeDatabase(d1PersistTo);
      }
    },
    waitForReady: () => Promise.all([waitForHttp(webUrl), waitForHttp(workerHealthUrl)]),
    webUrl,
  };
}
