import { Hono } from "hono";
import { getAnalyzerProviderAvailability } from "../../../analyzer/create-analyzer";
import {
  fetchPullRequestAnalysisContext,
  startPullRequestAnalysisJob
} from "../../../analyzer/pull-request-analysis-job";
import type { PullRequestHiddenContextDirection } from "../../../analyzer/hidden-context";
import { readPullRequestHiddenContext } from "../../../analyzer/hidden-context";
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

analyzerPullRequestRoutes.get("/:owner/:repo/:number/hidden-context", async (c) => {
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = getRouteNumber(c.req.param("number"), "pull request number");
  const commitOid = c.req.query("commitOid")?.trim() ?? "";
  const path = c.req.query("path")?.trim() ?? "";
  const anchorLine = Number(c.req.query("anchorLine") ?? "");
  const lineCount = c.req.query("lineCount")
    ? Number(c.req.query("lineCount") ?? "")
    : 20;
  const direction = (c.req.query("direction")?.trim() ?? "both") as PullRequestHiddenContextDirection;

  if (!commitOid) {
    return c.json({ ok: false, error: "Missing commit OID." }, 400);
  }

  if (!path) {
    return c.json({ ok: false, error: "Missing file path." }, 400);
  }

  if (!Number.isInteger(anchorLine) || anchorLine < 1) {
    return c.json({ ok: false, error: "Invalid anchor line." }, 400);
  }

  if (!Number.isInteger(lineCount) || lineCount < 1) {
    return c.json({ ok: false, error: "Invalid line count." }, 400);
  }

  if (direction !== "before" && direction !== "after" && direction !== "both") {
    return c.json({ ok: false, error: "Unsupported hidden context direction." }, 400);
  }

  const mapping = await resolveRepositoryMapping(owner, repo);

  if (mapping.error || !mapping.path) {
    return c.json({ ok: false, error: mapping.error }, 400);
  }

  try {
    const context = await readPullRequestHiddenContext({
      repositoryPath: mapping.path,
      pullRequestNumber: number,
      commitOid,
      path,
      anchorLine,
      direction,
      lineCount
    });

    return c.json({
      ok: true,
      context
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load hidden context from the local clone"
      },
      400
    );
  }
});

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
