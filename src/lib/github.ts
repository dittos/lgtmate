import { fetchJson } from "./api";

export type GithubStatusResponse =
  | {
      ok: true;
      output: string;
    }
  | {
      ok: false;
      error: string;
    };

export type PullRequestSummary = {
  title: string;
  bodyHTML: string;
  url: string;
  state: "open" | "closed" | "merged";
  author: string | null;
  headRefName: string;
  baseRefName: string;
  owner: string;
  repo: string;
  number: number;
};

export type PullRequestFile = {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
};

export type PullRequestFilePatch = {
  path: string;
  patch: string | null;
  additions: number;
  deletions: number;
  status: string;
  blobUrl: string | null;
  previousFilename: string | null;
};

type PullRequestResponse =
  | {
      ok: true;
      pullRequest: PullRequestSummary;
    }
  | {
      ok: false;
      error: string;
    };

type PullRequestFilesResponse =
  | {
      ok: true;
      files: PullRequestFile[];
    }
  | {
      ok: false;
      error: string;
    };

type PullRequestFileDiffResponse =
  | {
      ok: true;
      file: PullRequestFilePatch;
    }
  | {
      ok: false;
      error: string;
    };

export function formatChangeType(changeType: string) {
  return changeType.toLowerCase().replaceAll("_", " ");
}

export async function getGithubStatus() {
  return fetchJson<GithubStatusResponse>("/api/github/status");
}

export async function getPullRequest(
  owner: string,
  repo: string,
  number: number
) {
  const response = await fetchJson<PullRequestResponse>(
    `/api/github/pull-request?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&number=${number}`
  );

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.pullRequest;
}

export async function invalidatePullRequestCache(
  owner: string,
  repo: string,
  number: number
) {
  await fetchJson<{ ok: true } | { ok: false; error: string }>(
    `/api/github/pull-request/cache?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&number=${number}`
  );
}

export async function getPullRequestFiles(
  owner: string,
  repo: string,
  number: number
) {
  const response = await fetchJson<PullRequestFilesResponse>(
    `/api/github/pull-request/files?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&number=${number}`
  );

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.files;
}

export async function getPullRequestFileDiff(
  owner: string,
  repo: string,
  number: number,
  path: string
) {
  const response = await fetchJson<PullRequestFileDiffResponse>(
    `/api/github/pull-request/file-diff?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&number=${number}&path=${encodeURIComponent(path)}`
  );

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.file;
}
