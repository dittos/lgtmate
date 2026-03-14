import { spawn } from "node:child_process";

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

function runGithubCommand(args: string[]) {
  return new Promise<{ stdout: string }>((resolve, reject) => {
    const child = spawn("gh", args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout });
        return;
      }

      reject(
        new Error(
          stderr.trim() || stdout.trim() || `gh exited with code ${String(code)}`
        )
      );
    });
  });
}

export async function getGithubStatus() {
  const { stdout } = await runGithubCommand(["auth", "status"]);
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

  const { stdout } = await runGithubCommand(args);
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

  const { stdout } = await runGithubCommand(args);
  return JSON.parse(stdout);
}
