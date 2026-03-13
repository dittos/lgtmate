import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type GithubRequestOptions = {
  headers?: Record<string, string | null | undefined>;
  searchParams?: URLSearchParams;
};

type GithubGraphqlRequest = {
  operationName?: string | null;
  query: string;
  variables?: Record<string, boolean | number | string | null | undefined>;
};

function trimLeadingSlash(pathname: string) {
  return pathname.replace(/^\/+/, "");
}

function buildGithubPath(pathname: string, searchParams?: URLSearchParams) {
  const normalizedPath = trimLeadingSlash(pathname);
  const query = searchParams?.toString();

  if (!query) {
    return normalizedPath;
  }

  return `${normalizedPath}?${query}`;
}

export async function getGithubStatus() {
  const { stdout } = await execFileAsync("gh", ["auth", "status"]);
  return stdout.trim();
}

export async function fetchGithubJson(
  pathname: string,
  { headers, searchParams }: GithubRequestOptions = {}
) {
  const args = ["api"];

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (typeof value === "string" && value.length > 0) {
      args.push("-H", `${name}: ${value}`);
    }
  }

  args.push(buildGithubPath(pathname, searchParams));

  const { stdout } = await execFileAsync("gh", args);
  return JSON.parse(stdout);
}

export async function fetchGithubGraphql({
  operationName,
  query,
  variables
}: GithubGraphqlRequest) {
  const args = ["api", "graphql", "-f", `query=${query}`];

  if (operationName) {
    args.push("-f", `operationName=${operationName}`);
  }

  for (const [name, value] of Object.entries(variables ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }

    args.push("-F", `${name}=${String(value)}`);
  }

  const { stdout } = await execFileAsync("gh", args);
  return JSON.parse(stdout);
}
