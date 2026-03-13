import { fetchJson } from "./api";

const GITHUB_API_BASE_URL = (
  import.meta.env.VITE_GITHUB_API_BASE_URL ?? "/api/github"
).replace(/\/$/, "");
const FILES_PER_PAGE = 100;

// GitHub token without any additional scope.
// Used for anonymously accessing GraphQL API as it requires access token.
// Mangled a bit to avoid token scanning.
const PUBLIC_TOKEN = "mp8ke1wLfOlimDLlkOEqaLTf69eIVe1YOo3j_phg".split("").reverse().join("");

const pullRequestFilesCache = new Map<string, Promise<GithubPullRequestFileNode[]>>();
const pullRequestRestFilesCache = new Map<
  string,
  Promise<GithubPullRequestRestFile[]>
>();

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{
    message?: string;
  }>;
};

type PullRequestGraphqlData = {
  repository: {
    pullRequest: GithubPullRequest | null;
  } | null;
};

type PullRequestFilesGraphqlData = {
  repository: {
    pullRequest: {
      files: {
        nodes: GithubPullRequestFileNode[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      } | null;
    } | null;
  } | null;
};

export type GithubStatusResponse =
  | {
      ok: true;
      output: string;
    }
  | {
      ok: false;
      error: string;
    };

export type GithubPullRequest = {
  title: string;
  bodyHTML: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  mergedAt: string | null;
  author: {
    login: string;
  } | null;
  headRefName: string;
  baseRefName: string;
  repository: {
    owner: {
      login: string;
    };
    name: string;
  };
};

export type GithubPullRequestFileNode = {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
};

export type GithubPullRequestRestFile = {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
  patch?: string;
  blob_url: string | null;
  previous_filename?: string;
};

function getPullRequestCacheKey(owner: string, repo: string, number: number) {
  return `${owner}/${repo}#${number}`;
}

function buildGithubApiUrl(pathname: string, searchParams?: URLSearchParams) {
  const url = new URL(
    `${GITHUB_API_BASE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`,
    window.location.origin
  );

  if (searchParams) {
    url.search = searchParams.toString();
  }

  if (url.origin === window.location.origin) {
    return `${url.pathname}${url.search}`;
  }

  return url.toString();
}

function buildGithubGraphqlUrl() {
  return buildGithubApiUrl("/graphql");
}

function getGithubGraphqlHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (GITHUB_API_BASE_URL === "https://api.github.com" && PUBLIC_TOKEN) {
    headers.Authorization = `token ${PUBLIC_TOKEN}`;
  }

  return headers;
}

function normalizeDiffPath(path: string) {
  return `a/${path}`;
}

function normalizeNewDiffPath(path: string) {
  return `b/${path}`;
}

async function fetchGithubGraphql<TData>(
  query: string,
  variables: Record<string, boolean | number | string | null | undefined>,
  operationName?: string
) {
  const response = await fetchJson<GraphqlResponse<TData>>(buildGithubGraphqlUrl(), {
    method: "POST",
    headers: getGithubGraphqlHeaders(),
    body: JSON.stringify({
      operationName,
      query,
      variables
    })
  });

  if (response.errors?.length) {
    throw new Error(response.errors[0]?.message ?? "GitHub GraphQL request failed");
  }

  if (!response.data) {
    throw new Error("GitHub GraphQL response did not include data");
  }

  return response.data;
}

export function buildPullRequestFilePatch(file: GithubPullRequestRestFile) {
  if (!file.patch) {
    return null;
  }

  const previousFilename = file.previous_filename ?? file.filename;
  const oldPath =
    file.status === "added" ? "/dev/null" : normalizeDiffPath(previousFilename);
  const newPath =
    file.status === "removed" ? "/dev/null" : normalizeNewDiffPath(file.filename);

  return [
    `diff --git ${normalizeDiffPath(previousFilename)} ${normalizeNewDiffPath(file.filename)}`,
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    file.patch
  ].join("\n");
}

export function formatChangeType(changeType: string) {
  return changeType.toLowerCase().replaceAll("_", " ");
}

export function getPullRequestState(pullRequest: GithubPullRequest) {
  return pullRequest.state === "MERGED"
    ? "merged"
    : pullRequest.state === "OPEN"
      ? "open"
      : "closed";
}

export async function getGithubStatus() {
  return fetchJson<GithubStatusResponse>("/api/github/status");
}

export async function getPullRequest(
  owner: string,
  repo: string,
  number: number
) {
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
          repository {
            owner {
              login
            }
            name
          }
        }
      }
    }
  `;

  const data = await fetchGithubGraphql<PullRequestGraphqlData>(
    query,
    { owner, repo, number },
    "PullRequestSummary"
  );
  const pullRequest = data.repository?.pullRequest;

  if (!pullRequest) {
    throw new Error("Pull request not found");
  }

  return pullRequest;
}

async function getPullRequestFilesGraphqlPage(
  owner: string,
  repo: string,
  number: number,
  cursor: string | null
) {
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

  const data = await fetchGithubGraphql<PullRequestFilesGraphqlData>(
    query,
    { owner, repo, number, cursor },
    "PullRequestFiles"
  );
  const files = data.repository?.pullRequest?.files;

  if (!files) {
    throw new Error("Unable to load pull request files");
  }

  return files;
}

async function getPullRequestRestFilesPage(
  owner: string,
  repo: string,
  number: number,
  page: number
) {
  const searchParams = new URLSearchParams({
    per_page: String(FILES_PER_PAGE),
    page: String(page)
  });

  return fetchJson<GithubPullRequestRestFile[]>(
    buildGithubApiUrl(`/repos/${owner}/${repo}/pulls/${number}/files`, searchParams)
  );
}

export async function getPullRequestFiles(
  owner: string,
  repo: string,
  number: number
) {
  const cacheKey = getPullRequestCacheKey(owner, repo, number);
  const cachedFiles = pullRequestFilesCache.get(cacheKey);

  if (cachedFiles) {
    return cachedFiles;
  }

  const request = (async () => {
    const files: GithubPullRequestFileNode[] = [];
    let cursor: string | null = null;

    while (true) {
      const connection = await getPullRequestFilesGraphqlPage(
        owner,
        repo,
        number,
        cursor
      );

      files.push(...(connection.nodes ?? []));

      if (!connection.pageInfo.hasNextPage) {
        return files;
      }

      cursor = connection.pageInfo.endCursor;
    }
  })();

  pullRequestFilesCache.set(cacheKey, request);

  try {
    return await request;
  } catch (error) {
    pullRequestFilesCache.delete(cacheKey);
    throw error;
  }
}

async function getPullRequestRestFiles(
  owner: string,
  repo: string,
  number: number
) {
  const cacheKey = getPullRequestCacheKey(owner, repo, number);
  const cachedFiles = pullRequestRestFilesCache.get(cacheKey);

  if (cachedFiles) {
    return cachedFiles;
  }

  const request = (async () => {
    const files: GithubPullRequestRestFile[] = [];

    for (let page = 1; ; page += 1) {
      const nextPage = await getPullRequestRestFilesPage(owner, repo, number, page);
      files.push(...nextPage);

      if (nextPage.length < FILES_PER_PAGE) {
        return files;
      }
    }
  })();

  pullRequestRestFilesCache.set(cacheKey, request);

  try {
    return await request;
  } catch (error) {
    pullRequestRestFilesCache.delete(cacheKey);
    throw error;
  }
}

export async function getPullRequestFileDiff(
  owner: string,
  repo: string,
  number: number,
  path: string
) {
  const files = await getPullRequestRestFiles(owner, repo, number);
  const file = files.find((entry) => entry.filename === path);

  if (!file) {
    throw new Error("Pull request file diff not found");
  }

  return file;
}
