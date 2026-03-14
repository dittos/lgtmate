import { realpath } from "node:fs/promises";
import { readRepoMappings } from "./storage";
import { runCommand } from "./process";

function normalizeGithubRemote(remote: string) {
  const trimmed = remote.trim().replace(/\.git$/, "");
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i);

  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`.toLowerCase();
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);

  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`.toLowerCase();
  }

  return null;
}

export async function resolveRepositoryMapping(owner: string, repo: string) {
  const mappings = await readRepoMappings();
  const repositoryKey = `${owner}/${repo}`.toLowerCase();
  const configuredPath = mappings[repositoryKey] ?? mappings[`${owner}/${repo}`];

  if (!configuredPath) {
    return {
      hasMapping: false,
      path: null,
      error: "No local clone is connected for this repository."
    };
  }

  try {
    const resolvedPath = await realpath(configuredPath);
    await runCommand("git", ["-C", resolvedPath, "rev-parse", "--is-inside-work-tree"]);
    const { stdout } = await runCommand("git", [
      "-C",
      resolvedPath,
      "remote",
      "get-url",
      "origin"
    ], {
      captureStdout: true
    });
    const normalizedRemote = normalizeGithubRemote(stdout);

    if (normalizedRemote !== repositoryKey) {
      return {
        hasMapping: true,
        path: resolvedPath,
        error:
          "The connected local clone is invalid or no longer matches this GitHub repository."
      };
    }

    return {
      hasMapping: true,
      path: resolvedPath,
      error: null
    };
  } catch {
    return {
      hasMapping: true,
      path: configuredPath,
      error:
        "The connected local clone is invalid or no longer matches this GitHub repository."
    };
  }
}
