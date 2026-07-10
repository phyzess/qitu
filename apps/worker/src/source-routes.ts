import type { Hono } from "hono";
import { registerSourceListRoute } from "./source-list-route";
import { registerSourceDeleteRoutes } from "./source-delete-routes";
import { registerSourceRawRoutes } from "./source-raw-routes";
import { registerSourceReparseRoute } from "./source-reparse-route";
import { registerSourceUploadRoute } from "./source-upload-route";

export function registerSourceRoutes(app: Hono<{ Bindings: Env }>): void {
  registerSourceDeleteRoutes(app);
  registerSourceRawRoutes(app);
  registerSourceReparseRoute(app);
  registerSourceListRoute(app);
  registerSourceUploadRoute(app);
}
