import { Hono } from "hono";
import { ensureAnalyzerStorage } from "../../analyzer/storage";
import { analyzerJobRoutes } from "./analyzer/jobs";
import { analyzerPullRequestRoutes } from "./analyzer/pull-requests";

export const analyzerRoutes = new Hono();

analyzerRoutes.use("/*", async (_c, next) => {
  await ensureAnalyzerStorage();
  await next();
});

analyzerRoutes.route("/pull-requests", analyzerPullRequestRoutes);
analyzerRoutes.route("/jobs", analyzerJobRoutes);
