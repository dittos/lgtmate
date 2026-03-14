import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchGithubGraphql } from "../github-api";
import { sendJson } from "../http";
import { createAnalyzer, getAnalyzerProviderAvailability } from "../analyzer/create-analyzer";
import { ensureAnalyzerStorage, readStoredAnalysis, writeStoredAnalysis } from "../analyzer/storage";
import { resolveRepositoryMapping } from "../analyzer/repo-mappings";
import { createPullRequestWorktree, removePullRequestWorktree } from "../analyzer/worktree";
import type { AnalyzerProvider, StoredPullRequestAnalysis } from "../analyzer/types";

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

type AnalyzerStreamEvent =
  | {
      type: "progress";
      message: string;
    }
  | {
      type: "result";
      result: StoredPullRequestAnalysis;
    }
  | {
      type: "error";
      error: string;
    };

const routePattern =
  /^\/pull-requests\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/(?<number>\d+)\/?$/;

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

function getRouteParams(req: IncomingMessage) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const match = url.pathname.match(routePattern);

  if (!match?.groups) {
    return null;
  }

  const number = Number(match.groups.number);

  if (Number.isNaN(number)) {
    throw new Error("Invalid pull request number");
  }

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
    number
  };
}

function isAnalyzerProvider(value: unknown): value is AnalyzerProvider {
  return value === "codex" || value === "claude";
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

function startAnalyzerStream(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  return (event: AnalyzerStreamEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
  };
}

export async function handlePullRequestAnalyzerRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  const params = getRouteParams(req);

  if (!params) {
    sendJson(res, { ok: false, error: "Not found" }, 404);
    return;
  }

  try {
    await ensureAnalyzerStorage();

    const [mapping, providers] = await Promise.all([
      resolveRepositoryMapping(params.owner, params.repo),
      getAnalyzerProviderAvailability()
    ]);

    if (req.method === "GET") {
      const provider = isAnalyzerProvider(
        new URL(req.url ?? "/", "http://localhost").searchParams.get("provider")
      )
        ? (new URL(req.url ?? "/", "http://localhost").searchParams.get(
            "provider"
          ) as AnalyzerProvider)
        : "codex";
      const analysis = await readStoredAnalysis(
        params.owner,
        params.repo,
        params.number,
        provider
      );

      sendJson(res, {
        ok: true,
        analysis,
        repository: mapping,
        providers
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, { ok: false, error: "Method not allowed" }, 405);
      return;
    }

    const body = await readJsonBody(req);

    if (!isAnalyzerProvider(body.provider)) {
      sendJson(res, { ok: false, error: "Invalid analyzer provider." }, 400);
      return;
    }

    if (mapping.error || !mapping.path) {
      sendJson(res, { ok: false, error: mapping.error }, 400);
      return;
    }

    const providerAvailability = providers[body.provider];

    if (!providerAvailability.available) {
      sendJson(res, { ok: false, error: providerAvailability.reason }, 400);
      return;
    }

    const writeEvent = startAnalyzerStream(res);

    const pullRequest = await fetchPullRequestAnalysisContext(
      params.owner,
      params.repo,
      params.number
    );
    writeEvent({ type: "progress", message: "Loaded pull request metadata from GitHub." });

    if (!body.forceRefresh) {
      const cached = await readStoredAnalysis(
        params.owner,
        params.repo,
        params.number,
        body.provider
      );

      if (cached && cached.headOid === pullRequest.headRefOid) {
        writeEvent({ type: "progress", message: "Using cached analysis for the current head commit." });
        writeEvent({ type: "result", result: cached });
        res.end();
        return;
      }
    }

    const analyzer = createAnalyzer(body.provider);
    const startedAt = Date.now();
    let worktreePath: string | null = null;
    let storedResult: StoredPullRequestAnalysis | null = null;

    try {
      writeEvent({ type: "progress", message: "Creating isolated worktree for analysis..." });
      worktreePath = await createPullRequestWorktree({
        owner: params.owner,
        repo: params.repo,
        number: params.number,
        repositoryPath: mapping.path
      });
      writeEvent({ type: "progress", message: "Worktree is ready. Starting analyzer..." });

      const result = await analyzer.analyzePullRequest({
        owner: params.owner,
        repo: params.repo,
        number: params.number,
        provider: body.provider,
        model: typeof body.model === "string" ? body.model : undefined,
        localRepositoryPath: mapping.path,
        worktreePath,
        headOid: pullRequest.headRefOid,
        baseOid: pullRequest.baseRefOid,
        pullRequest,
        onProgress: (event) => {
          writeEvent({ type: "progress", message: event.message });
        }
      });
      storedResult = buildStoredResult(
        params.owner,
        params.repo,
        params.number,
        result
      );
      const storedPath = await writeStoredAnalysis(storedResult);
      writeEvent({ type: "progress", message: "Analysis complete. Saving cached result..." });

      console.info("[analyzer] completed", {
        provider: storedResult.provider,
        model: storedResult.model,
        repositoryPath: mapping.path,
        worktreePath,
        storedPath,
        latencyMs: Date.now() - startedAt
      });

    } finally {
      if (worktreePath) {
        try {
          writeEvent({ type: "progress", message: "Cleaning up temporary worktree..." });
          await removePullRequestWorktree(mapping.path, worktreePath);
        } catch (error) {
          console.error("[analyzer] failed to remove worktree", {
            repositoryPath: mapping.path,
            worktreePath,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    if (storedResult) {
      writeEvent({ type: "result", result: storedResult });
      res.end();
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze pull request";
    console.error("[analyzer] failed", {
      owner: params.owner,
      repo: params.repo,
      number: params.number,
      error: message
    });
    if (!res.headersSent) {
      sendJson(res, { ok: false, error: message }, 500);
      return;
    }

    res.write(`${JSON.stringify({ type: "error", error: message } satisfies AnalyzerStreamEvent)}\n`);
    res.end();
  }
}
