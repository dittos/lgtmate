import { Hono } from "hono";
import { getAnalyzerProviderAvailability } from "../../../analyzer/create-analyzer";
import {
  fetchPullRequestAnalysisContext,
  startPullRequestAnalysisJob
} from "../../../analyzer/pull-request-analysis-job";
import { resolveRepositoryMapping } from "../../../analyzer/repo-mappings";
import { readStoredAnalysis } from "../../../analyzer/storage";
import { analysisJobStore } from "../../../analyzer/job-store";
import { getRouteNumber, isAnalyzerProvider } from "../../../hono/utils";

type AnalyzerRequestBody = {
  provider?: unknown;
  model?: unknown;
  forceRefresh?: unknown;
};

export const analyzerPullRequestRoutes = new Hono();

analyzerPullRequestRoutes.get("/:owner/:repo/:number", async (c) => {
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = getRouteNumber(c.req.param("number"), "pull request number");

  const [mapping, providers, analysis] = await Promise.all([
    resolveRepositoryMapping(owner, repo),
    getAnalyzerProviderAvailability(),
    readStoredAnalysis(owner, repo, number)
  ]);

  const job = analysisJobStore.findRelevantJob({ owner, repo, number });

  return c.json({
    ok: true,
    analysis,
    repository: mapping,
    providers,
    job
  });
});

analyzerPullRequestRoutes.post("/:owner/:repo/:number", async (c) => {
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = getRouteNumber(c.req.param("number"), "pull request number");

  let body: AnalyzerRequestBody;

  try {
    body = await c.req.json<AnalyzerRequestBody>();
  } catch {
    body = {};
  }

  if (!isAnalyzerProvider(body.provider)) {
    return c.json({ ok: false, error: "Invalid analyzer provider." }, 400);
  }

  const [mapping, pullRequest] = await Promise.all([
    resolveRepositoryMapping(owner, repo),
    fetchPullRequestAnalysisContext(owner, repo, number)
  ]);

  if (mapping.error || !mapping.path) {
    return c.json({ ok: false, error: mapping.error }, 400);
  }

  try {
    const job = await startPullRequestAnalysisJob({
      repositoryPath: mapping.path,
      owner,
      repo,
      number,
      provider: body.provider,
      model: typeof body.model === "string" ? body.model : null,
      headOid: pullRequest.headRefOid,
      baseOid: pullRequest.baseRefOid
    });

    return c.json({
      ok: true,
      job
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to start analysis job"
      },
      400
    );
  }
});
