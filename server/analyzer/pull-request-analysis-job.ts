import { createAnalyzer } from "./create-analyzer";
import { analysisJobStore } from "./job-store";
import { writeStoredAnalysis } from "./storage";
import type {
  AnalysisJobSnapshot,
  AnalyzerProvider,
  PullRequestAnalysisInputFile,
  StoredPullRequestAnalysis
} from "./types";
import { createPullRequestWorktree, removePullRequestWorktree } from "./worktree";
import { fetchGithubGraphql, fetchGithubJson } from "../github-api";

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

export async function fetchPullRequestAnalysisContext(
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
  const analyzer = await createAnalyzer(job.provider);
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

export async function startPullRequestAnalysisJob(input: {
  repositoryPath: string;
  owner: string;
  repo: string;
  number: number;
  provider: AnalyzerProvider;
  model?: string | null;
  headOid: string;
  baseOid: string | null;
}) {
  const analyzer = await createAnalyzer(input.provider);
  const model = typeof input.model === "string" && input.model.trim()
    ? input.model.trim()
    : analyzer.defaultModel;

  const job = analysisJobStore.createJob({
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    provider: input.provider,
    model,
    headOid: input.headOid,
    baseOid: input.baseOid
  });

  void runAnalysisJob(job, {
    repositoryPath: input.repositoryPath,
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    provider: input.provider,
    model
  });

  return job;
}
