import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PULL_REQUEST_FILES_CACHE_TTL_MS = 30_000;

type RestPullRequestFile = Record<string, unknown>;

type PullRequestFilesCacheEntry = {
  expiresAt: number;
  files: RestPullRequestFile[];
};

const pullRequestFilesCache = new Map<string, PullRequestFilesCacheEntry>();

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

export async function getGithubStatus() {
  const { stdout } = await execFileAsync("gh", ["auth", "status"]);
  return stdout.trim();
}

function normalizeDiffPath(path: string) {
  return `a/${path}`;
}

function normalizeNewDiffPath(path: string) {
  return `b/${path}`;
}

function buildSingleFilePatch(file: Record<string, unknown>) {
  const rawPatch = typeof file.patch === "string" ? file.patch : null;

  if (!rawPatch) {
    return null;
  }

  const status = typeof file.status === "string" ? file.status : "modified";
  const filename = typeof file.filename === "string" ? file.filename : "";
  const previousFilename =
    typeof file.previous_filename === "string" ? file.previous_filename : null;

  const oldPath =
    status === "added"
      ? "/dev/null"
      : normalizeDiffPath(previousFilename ?? filename);
  const newPath =
    status === "removed" ? "/dev/null" : normalizeNewDiffPath(filename);

  return [
    `diff --git ${normalizeDiffPath(previousFilename ?? filename)} ${normalizeNewDiffPath(filename)}`,
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    rawPatch
  ].join("\n");
}

function getPullRequestFilesCacheKey(
  owner: string,
  repo: string,
  number: number
) {
  return `${owner}/${repo}#${number}`;
}

export function invalidatePullRequestFilesCache(
  owner: string,
  repo: string,
  number: number
) {
  pullRequestFilesCache.delete(getPullRequestFilesCacheKey(owner, repo, number));
}

async function fetchPullRequestFilesRest(
  owner: string,
  repo: string,
  number: number
) {
  const cacheKey = getPullRequestFilesCacheKey(owner, repo, number);
  const cachedEntry = pullRequestFilesCache.get(cacheKey);

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.files;
  }

  const pages = await runGhJson([
    "api",
    "--paginate",
    "--slurp",
    `repos/${owner}/${repo}/pulls/${number}/files?per_page=100`
  ]);

  const files = pages.flatMap((page: unknown) => (Array.isArray(page) ? page : []));

  pullRequestFilesCache.set(cacheKey, {
    expiresAt: Date.now() + PULL_REQUEST_FILES_CACHE_TTL_MS,
    files
  });

  return files;
}

async function runGhJson(args: string[]) {
  const { stdout } = await execFileAsync("gh", args);
  return JSON.parse(stdout);
}

export async function fetchPullRequestSummary(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequestSummary> {
  const query = `
    query PullRequestSummary($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          title
          bodyHTML
          url
          state
          mergedAt
          author {
            login
          }
          headRefName
          baseRefName
        }
      }
    }
  `;

  const response = await runGhJson([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `repo=${repo}`,
    "-F",
    `number=${number}`
  ]);

  const pullRequest = response?.data?.repository?.pullRequest;

  if (!pullRequest) {
    throw new Error("Pull request not found");
  }

  return {
    title: pullRequest.title,
    bodyHTML: pullRequest.bodyHTML ?? "",
    url: pullRequest.url,
    state: pullRequest.mergedAt
      ? "merged"
      : pullRequest.state === "OPEN"
        ? "open"
        : "closed",
    author: pullRequest.author?.login ?? null,
    headRefName: pullRequest.headRefName,
    baseRefName: pullRequest.baseRefName,
    owner,
    repo,
    number
  };
}

export async function fetchPullRequestFiles(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequestFile[]> {
  const query = `
    query PullRequestFiles(
      $owner: String!
      $repo: String!
      $number: Int!
      $cursor: String
    ) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          files(first: 100, after: $cursor) {
            nodes {
              path
              additions
              deletions
              changeType
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `;

  const files: PullRequestFile[] = [];
  let cursor: string | null = null;

  while (true) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `repo=${repo}`,
      "-F",
      `number=${number}`
    ];

    if (cursor) {
      args.push("-F", `cursor=${cursor}`);
    }

    const response = await runGhJson(args);
    const connection = response?.data?.repository?.pullRequest?.files;

    if (!connection) {
      throw new Error("Unable to load pull request files");
    }

    for (const file of connection.nodes ?? []) {
      if (file?.path) {
        files.push({
          path: file.path,
          additions: file.additions ?? 0,
          deletions: file.deletions ?? 0,
          changeType: file.changeType ?? "MODIFIED"
        });
      }
    }

    if (!connection.pageInfo?.hasNextPage) {
      return files;
    }

    cursor = connection.pageInfo.endCursor;
  }
}

export async function fetchPullRequestFilePatch(
  owner: string,
  repo: string,
  number: number,
  filePath: string
): Promise<PullRequestFilePatch> {
  const files = await fetchPullRequestFilesRest(owner, repo, number);

  const file = files
    .find(
      (entry: Record<string, unknown>) =>
        typeof entry.filename === "string" && entry.filename === filePath
    );

  if (!file) {
    throw new Error("Pull request file diff not found");
  }

  return {
    path: String(file.filename),
    patch: buildSingleFilePatch(file),
    additions: typeof file.additions === "number" ? file.additions : 0,
    deletions: typeof file.deletions === "number" ? file.deletions : 0,
    status: typeof file.status === "string" ? file.status : "modified",
    blobUrl: typeof file.blob_url === "string" ? file.blob_url : null,
    previousFilename:
      typeof file.previous_filename === "string" ? file.previous_filename : null
  };
}
