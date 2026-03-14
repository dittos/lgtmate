import type { IncomingMessage, ServerResponse } from "node:http";
import { createAnalyzer, getAnalyzerProviderAvailability } from "../analyzer/create-analyzer";
import { analysisJobStore } from "../analyzer/job-store";
import { resolveRepositoryMapping } from "../analyzer/repo-mappings";
import { ensureAnalyzerStorage, readStoredAnalysis, writeStoredAnalysis } from "../analyzer/storage";
import type {
  AnalysisJobSnapshot,
  AnalysisJobStreamEvent,
  AnalyzerProvider,
  PullRequestAnalysisInputFile,
  StoredPullRequestAnalysis
} from "../analyzer/types";
import { createPullRequestWorktree, removePullRequestWorktree } from "../analyzer/worktree";
import { fetchGithubGraphql, fetchGithubJson } from "../github-api";
import { sendJson } from "../http";

type AnalyzerRequestBody = {
  provider?: unknown;
  model?: unknown;
  forceRefresh?: unknown;
};

type PullRequestGraphqlResponse = {
  data?: {
    repository: {
      pullRequest: {
        title: string;
        body: string;
        url: string;
        author: {
          login: string;
        } | null;
        headRefName: string;
        headRefOid: string;
        baseRefName: string;
        baseRefOid: string;
      } | null;
    } | null;
  };
};

type PullRequestRestFile = {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
  patch?: string;
  previous_filename?: string;
};

const pullRequestRoutePattern =
  /^\/pull-requests\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/(?<number>\d+)\/?$/;
const jobRoutePattern = /^\/jobs\/(?<jobId>[^/]+)(?:\/(?<suffix>stream))?\/?$/;

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as AnalyzerRequestBody;
}

function parseRoute(req: IncomingMessage) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pullRequestMatch = url.pathname.match(pullRequestRoutePattern);

  if (pullRequestMatch?.groups) {
    const number = Number(pullRequestMatch.groups.number);

    if (Number.isNaN(number)) {
      throw new Error("Invalid pull request number");
    }

    return {
      type: "pull-request" as const,
      owner: pullRequestMatch.groups.owner,
      repo: pullRequestMatch.groups.repo,
      number,
      url
    };
  }

  const jobMatch = url.pathname.match(jobRoutePattern);

  if (jobMatch?.groups) {
    return {
      type: "job" as const,
      jobId: jobMatch.groups.jobId,
      stream: jobMatch.groups.suffix === "stream",
      url
    };
  }

  return null;
}

function isAnalyzerProvider(value: unknown): value is AnalyzerProvider {
  return value === "codex" || value === "claude";
}

function buildStoredResult(
  owner: string,
  repo: string,
  number: number,
  result: Omit<StoredPullRequestAnalysis, "repository" | "number">
): StoredPullRequestAnalysis {
  return {
    repository: { owner, repo },
    number,
    ...result
  };
}

function buildDedupeKey(input: {
  owner: string;
  repo: string;
  number: number;
  provider: AnalyzerProvider;
  model: string;
  headOid: string;
}) {
  return `${input.owner}/${input.repo}#${input.number}:${input.provider}:${input.model}:${input.headOid}`;
}

function writeSseEvent(res: ServerResponse, event: AnalysisJobStreamEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function startSse(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

async function fetchPullRequestAnalysisContext(
  owner: string,
  repo: string,
  number: number
) {
  const query = `
    query PullRequestAnalyzerContext($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          title
          body
          url
          author {
            login
          }
          headRefName
          headRefOid
          baseRefName
          baseRefOid
        }
      }
    }
  `;

  const payload = (await fetchGithubGraphql({
    operationName: "PullRequestAnalyzerContext",
    query,
    variables: { owner, repo, number }
  })) as PullRequestGraphqlResponse;
  const pullRequest = payload.data?.repository?.pullRequest;

  if (!pullRequest) {
    throw new Error("GitHub data could not be collected for analysis.");
  }

  return {
    title: pullRequest.title,
    body: pullRequest.body,
    url: pullRequest.url,
    author: pullRequest.author?.login ?? null,
    headRefName: pullRequest.headRefName,
    headRefOid: pullRequest.headRefOid,
    baseRefName: pullRequest.baseRefName,
    baseRefOid: pullRequest.baseRefOid ?? null
  };
}

async function fetchPullRequestFiles(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequestAnalysisInputFile[]> {
  const files: PullRequestRestFile[] = [];

  for (let page = 1; ; page += 1) {
    const searchParams = new URLSearchParams({
      per_page: "100",
      page: String(page)
    });
    const nextPage = (await fetchGithubJson(
      `/repos/${owner}/${repo}/pulls/${number}/files`,
      { searchParams }
    )) as PullRequestRestFile[];

    files.push(...nextPage);

    if (nextPage.length < 100) {
      break;
    }
  }

  return files.map((file) => ({
    path: file.filename,
    additions: file.additions,
    deletions: file.deletions,
    changeType: file.status.toUpperCase(),
    previousPath: file.previous_filename ?? null,
    patch: file.patch ?? null
  }));
}

async function runAnalysisJob(
  job: AnalysisJobSnapshot,
  input: {
    repositoryPath: string;
    owner: string;
    repo: string;
    number: number;
    provider: AnalyzerProvider;
    model?: string;
  }
) {
  const startedAt = Date.now();
  const analyzer = createAnalyzer(job.provider);
  let worktreePath: string | null = null;

  try {
    analysisJobStore.markRunning(job.id);
    analysisJobStore.appendProgress(job.id, "Creating isolated worktree for analysis...");

    const [pullRequest, files] = await Promise.all([
      fetchPullRequestAnalysisContext(input.owner, input.repo, input.number),
      fetchPullRequestFiles(input.owner, input.repo, input.number)
    ]);

    worktreePath = await createPullRequestWorktree({
      owner: input.owner,
      repo: input.repo,
      number: input.number,
      repositoryPath: input.repositoryPath
    });
    analysisJobStore.appendProgress(job.id, "Worktree is ready. Starting analyzer...");

    const result = await analyzer.analyzePullRequest({
      owner: input.owner,
      repo: input.repo,
      number: input.number,
      provider: input.provider,
      model: input.model,
      localRepositoryPath: input.repositoryPath,
      worktreePath,
      headOid: pullRequest.headRefOid,
      baseOid: pullRequest.baseRefOid,
      pullRequest,
      files,
      onProgress: (event) => {
        analysisJobStore.appendProgress(job.id, event.message);
      }
    });

    const storedResult = buildStoredResult(input.owner, input.repo, input.number, result);
    analysisJobStore.appendProgress(job.id, "Analysis complete. Saving cached result...");
    const storedPath = await writeStoredAnalysis(storedResult);

    console.info("[analyzer] completed", {
      provider: storedResult.provider,
      model: storedResult.model,
      repositoryPath: input.repositoryPath,
      worktreePath,
      storedPath,
      latencyMs: Date.now() - startedAt
    });

    analysisJobStore.completeJob(job.id, {
      resultPath: storedPath,
      result: storedResult
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze pull request";

    console.error("[analyzer] failed", {
      owner: input.owner,
      repo: input.repo,
      number: input.number,
      error: message
    });

    analysisJobStore.failJob(job.id, message);
  } finally {
    if (worktreePath) {
      try {
        analysisJobStore.appendProgress(job.id, "Cleaning up temporary worktree...");
        await removePullRequestWorktree(input.repositoryPath, worktreePath);
      } catch (error) {
        console.error("[analyzer] failed to remove worktree", {
          repositoryPath: input.repositoryPath,
          worktreePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}

async function handlePullRequestLookup(
  req: IncomingMessage,
  res: ServerResponse,
  input: {
    owner: string;
    repo: string;
    number: number;
    url: URL;
  }
) {
  const provider = isAnalyzerProvider(input.url.searchParams.get("provider"))
    ? (input.url.searchParams.get("provider") as AnalyzerProvider)
    : "codex";

  const [mapping, providers, analysis, pullRequest] = await Promise.all([
    resolveRepositoryMapping(input.owner, input.repo),
    getAnalyzerProviderAvailability(),
    readStoredAnalysis(input.owner, input.repo, input.number, provider),
    fetchPullRequestAnalysisContext(input.owner, input.repo, input.number).catch(() => null)
  ]);

  const job = analysisJobStore.findRelevantJob({
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    provider,
    headOid: pullRequest?.headRefOid ?? analysis?.headOid ?? null
  });

  sendJson(res, {
    ok: true,
    analysis,
    repository: mapping,
    providers,
    job
  });
}

async function handlePullRequestRun(
  req: IncomingMessage,
  res: ServerResponse,
  input: {
    owner: string;
    repo: string;
    number: number;
  }
) {
  const body = await readJsonBody(req);

  if (!isAnalyzerProvider(body.provider)) {
    sendJson(res, { ok: false, error: "Invalid analyzer provider." }, 400);
    return;
  }

  const [mapping, providers, pullRequest] = await Promise.all([
    resolveRepositoryMapping(input.owner, input.repo),
    getAnalyzerProviderAvailability(),
    fetchPullRequestAnalysisContext(input.owner, input.repo, input.number)
  ]);

  if (mapping.error || !mapping.path) {
    sendJson(res, { ok: false, error: mapping.error }, 400);
    return;
  }

  const providerAvailability = providers[body.provider];

  if (!providerAvailability.available) {
    sendJson(res, { ok: false, error: providerAvailability.reason }, 400);
    return;
  }

  const analyzer = createAnalyzer(body.provider);
  const model = typeof body.model === "string" && body.model.trim()
    ? body.model.trim()
    : analyzer.defaultModel;
  const dedupeKey = buildDedupeKey({
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    provider: body.provider,
    model,
    headOid: pullRequest.headRefOid
  });
  const existingJob = analysisJobStore.findActiveJobByDedupeKey(dedupeKey);

  if (existingJob) {
    sendJson(res, {
      ok: true,
      job: existingJob,
      reusedExistingJob: true
    });
    return;
  }

  const job = analysisJobStore.createJob({
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    provider: body.provider,
    model,
    headOid: pullRequest.headRefOid,
    baseOid: pullRequest.baseRefOid,
    dedupeKey
  });

  void runAnalysisJob(job, {
    repositoryPath: mapping.path,
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    provider: body.provider,
    model: typeof body.model === "string" ? body.model : undefined
  });

  sendJson(res, {
    ok: true,
    job,
    reusedExistingJob: false
  });
}

function handleJobSnapshot(res: ServerResponse, jobId: string) {
  const job = analysisJobStore.getJob(jobId);

  if (!job) {
    sendJson(res, { ok: false, error: "Analysis job not found." }, 404);
    return;
  }

  sendJson(res, {
    ok: true,
    job
  });
}

function handleJobStream(req: IncomingMessage, res: ServerResponse, jobId: string) {
  const job = analysisJobStore.getJob(jobId);

  if (!job) {
    sendJson(res, { ok: false, error: "Analysis job not found." }, 404);
    return;
  }

  startSse(res);
  writeSseEvent(res, { type: "snapshot", job });

  if (job.status === "completed") {
    const result = analysisJobStore.getJobResult(jobId);

    if (result) {
      writeSseEvent(res, { type: "completed", job, result });
    }

    res.end();
    return;
  }

  if (job.status === "failed") {
    writeSseEvent(res, { type: "failed", job });
    res.end();
    return;
  }

  const unsubscribe = analysisJobStore.subscribe(jobId, (event) => {
    writeSseEvent(res, event);

    if (event.type === "completed" || event.type === "failed") {
      cleanup();
      res.end();
    }
  });

  const heartbeat = setInterval(() => {
    writeSseEvent(res, {
      type: "heartbeat",
      at: new Date().toISOString()
    });
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on("close", cleanup);
}

export async function handlePullRequestAnalyzerRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  const route = parseRoute(req);

  if (!route) {
    sendJson(res, { ok: false, error: "Not found" }, 404);
    return;
  }

  try {
    await ensureAnalyzerStorage();

    if (route.type === "job") {
      if (req.method !== "GET") {
        sendJson(res, { ok: false, error: "Method not allowed" }, 405);
        return;
      }

      if (route.stream) {
        handleJobStream(req, res, route.jobId);
        return;
      }

      handleJobSnapshot(res, route.jobId);
      return;
    }

    if (req.method === "GET") {
      await handlePullRequestLookup(req, res, route);
      return;
    }

    if (req.method === "POST") {
      await handlePullRequestRun(req, res, route);
      return;
    }

    sendJson(res, { ok: false, error: "Method not allowed" }, 405);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze pull request";

    console.error("[analyzer] route failed", {
      route: req.url,
      error: message
    });

    if (!res.headersSent) {
      sendJson(res, { ok: false, error: message }, 500);
      return;
    }

    res.end();
  }
}
