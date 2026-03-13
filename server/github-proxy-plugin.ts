import type { Plugin } from "vite";
import { handleGithubStatusRoute } from "./routes/github-status";
import { handleHealthRoute } from "./routes/health";
import { handlePullRequestCacheRoute } from "./routes/pull-request-cache";
import { handlePullRequestFileDiffRoute } from "./routes/pull-request-file-diff";
import { handlePullRequestFilesRoute } from "./routes/pull-request-files";
import { handlePullRequestRoute } from "./routes/pull-request";

export function githubProxyPlugin(): Plugin {
  return {
    name: "lgtmate-api",
    configureServer(server) {
      server.middlewares.use("/api/health", handleHealthRoute);
      server.middlewares.use("/api/github/status", handleGithubStatusRoute);
      server.middlewares.use(
        "/api/github/pull-request/cache",
        handlePullRequestCacheRoute
      );
      server.middlewares.use(
        "/api/github/pull-request/files",
        handlePullRequestFilesRoute
      );
      server.middlewares.use(
        "/api/github/pull-request/file-diff",
        handlePullRequestFileDiffRoute
      );
      server.middlewares.use("/api/github/pull-request", handlePullRequestRoute);
    }
  };
}
