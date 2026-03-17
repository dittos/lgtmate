import { DEFAULT_PORT, VALID_PROVIDERS } from "./constants.ts";
import { CliError } from "./errors.ts";

type RepositoryReference = {
  owner: string | null;
  repo: string;
};

type PullRequestReference = {
  repositoryRef: RepositoryReference;
  prNumber: number;
};

export type ParsedArgs =
  | { kind: "help" }
  | {
      kind: "run";
      repositoryRef: RepositoryReference | null;
      prNumber: number;
      provider: string | null;
      port: number;
      openBrowser: boolean;
    };

function parsePullRequestNumber(value: string): number {
  const normalized = value.trim().replace(/^#/, "");
  const number = Number(normalized);

  if (!Number.isInteger(number) || number <= 0) {
    throw new CliError(`Invalid pull request number: ${value}`);
  }

  return number;
}

function parsePullRequestReference(value: string): PullRequestReference | null {
  const normalized = value.trim();
  const match = normalized.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/i
  );

  if (!match) {
    return null;
  }

  return {
    repositoryRef: {
      owner: match[1],
      repo: match[2]
    },
    prNumber: parsePullRequestNumber(match[3])
  };
}

function parseRepositoryReference(value: string): RepositoryReference {
  const normalized = value.trim().replace(/^github\.com\//i, "").replace(/^\/+|\/+$/g, "");

  if (!normalized) {
    throw new CliError(`Invalid repository reference: ${value}`);
  }

  const segments = normalized.split("/");

  if (
    segments.length > 2 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new CliError(`Invalid repository reference: ${value}`);
  }

  if (segments.length === 1) {
    return { owner: null, repo: segments[0] };
  }

  return { owner: segments[0], repo: segments[1] };
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  let provider: string | null = null;
  let port: number | null = null;
  let openBrowser = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--provider") {
      const value = argv[index + 1];

      if (!value || !VALID_PROVIDERS.has(value)) {
        throw new CliError("`--provider` must be followed by `codex` or `claude`.");
      }

      provider = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      const value = arg.slice("--provider=".length);

      if (!VALID_PROVIDERS.has(value)) {
        throw new CliError("`--provider` must be `codex` or `claude`.");
      }

      provider = value;
      continue;
    }

    if (arg === "--port") {
      const value = Number(argv[index + 1]);

      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new CliError("`--port` must be followed by a valid port number.");
      }

      port = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      const value = Number(arg.slice("--port=".length));

      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new CliError("`--port` must be a valid port number.");
      }

      port = value;
      continue;
    }

    if (arg === "--no-open") {
      openBrowser = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    }

    if (arg.startsWith("-")) {
      throw new CliError(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals.length === 0 || positionals.length > 2) {
    throw new CliError("Invalid arguments.", { showUsage: true });
  }

  if (positionals.length === 1) {
    const pullRequestRef = parsePullRequestReference(positionals[0]);

    if (pullRequestRef) {
      return {
        kind: "run",
        repositoryRef: pullRequestRef.repositoryRef,
        prNumber: pullRequestRef.prNumber,
        provider,
        port: port ?? DEFAULT_PORT,
        openBrowser
      };
    }

    return {
      kind: "run",
      repositoryRef: null,
      prNumber: parsePullRequestNumber(positionals[0]),
      provider,
      port: port ?? DEFAULT_PORT,
      openBrowser
    };
  }

  return {
    kind: "run",
    repositoryRef: parseRepositoryReference(positionals[0]),
    prNumber: parsePullRequestNumber(positionals[1]),
    provider,
    port: port ?? DEFAULT_PORT,
    openBrowser
  };
}
