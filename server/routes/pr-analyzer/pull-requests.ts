import { getAnalyzerProviderAvailability } from "../../analyzer/create-analyzer";
import { analysisJobStore } from "../../analyzer/job-store";
import {
  fetchPullRequestAnalysisContext,
  startPullRequestAnalysisJob
} from "../../analyzer/pull-request-analysis-job";
import { resolveRepositoryMapping } from "../../analyzer/repo-mappings";
import { readStoredAnalysis } from "../../analyzer/storage";
import type { AnalyzerProvider } from "../../analyzer/types";
import { sendJson } from "../../http";

type PullRequestRouteInput = {
  owner: string;
  repo: string;
  number: number;
};

export type AnalyzerRequestBody = {
  provider?: unknown;
  model?: unknown;
  forceRefresh?: unknown;
};

function isAnalyzerProvider(value: unknown): value is AnalyzerProvider {
  return value === "codex" || value === "claude";
}

export async function handlePullRequestLookup(
  res: Parameters<typeof sendJson>[0],
  input: PullRequestRouteInput
) {
  const [mapping, providers, analysis] = await Promise.all([
    resolveRepositoryMapping(input.owner, input.repo),
    getAnalyzerProviderAvailability(),
    readStoredAnalysis(input.owner, input.repo, input.number)
  ]);

  const job = analysisJobStore.findRelevantJob({
    owner: input.owner,
    repo: input.repo,
    number: input.number
  });

  sendJson(res, {
    ok: true,
    analysis,
    repository: mapping,
    providers,
    job
  });
}

export async function handlePullRequestRun(
  res: Parameters<typeof sendJson>[0],
  input: PullRequestRouteInput,
  body: AnalyzerRequestBody
) {
  if (!isAnalyzerProvider(body.provider)) {
    sendJson(res, { ok: false, error: "Invalid analyzer provider." }, 400);
    return;
  }

  const [mapping, pullRequest] = await Promise.all([
    resolveRepositoryMapping(input.owner, input.repo),
    fetchPullRequestAnalysisContext(input.owner, input.repo, input.number)
  ]);

  if (mapping.error || !mapping.path) {
    sendJson(res, { ok: false, error: mapping.error }, 400);
    return;
  }

  let job;

  try {
    job = await startPullRequestAnalysisJob({
      repositoryPath: mapping.path,
      owner: input.owner,
      repo: input.repo,
      number: input.number,
      provider: body.provider,
      model: typeof body.model === "string" ? body.model : null,
      headOid: pullRequest.headRefOid,
      baseOid: pullRequest.baseRefOid
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start analysis job";
    sendJson(res, { ok: false, error: message }, 400);
    return;
  }

  sendJson(res, {
    ok: true,
    job
  });
}
