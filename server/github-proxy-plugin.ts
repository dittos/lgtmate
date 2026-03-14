import type { Plugin } from "vite";
import { handleGithubGraphqlRoute } from "./routes/github-graphql";
import { handleGithubRestRoute } from "./routes/github-rest";
import { handleGithubStatusRoute } from "./routes/github-status";
import { handleHealthRoute } from "./routes/health";
import { handlePullRequestAnalyzerRoute } from "./routes/pr-analyzer";

export function githubProxyPlugin(): Plugin {
  return {
    name: "lgtmate-api",
    configureServer(server) {
      server.middlewares.use("/api/health", handleHealthRoute);
      server.middlewares.use("/api/analyzer", handlePullRequestAnalyzerRoute);
      server.middlewares.use("/api/github/graphql", handleGithubGraphqlRoute);
      server.middlewares.use("/api/github/status", handleGithubStatusRoute);
      server.middlewares.use("/api/github/repos", handleGithubRestRoute);
    }
  };
}
