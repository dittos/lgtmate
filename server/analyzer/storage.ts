import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StoredPullRequestAnalysis } from "./types";

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getLgtmateRoot() {
  return path.join(os.homedir(), ".lgtmate");
}

export function getRepoMappingsPath() {
  return path.join(getLgtmateRoot(), "repo-mappings.json");
}

export function getWorktreesRoot() {
  return path.join(getLgtmateRoot(), "worktrees");
}

export function getAnalysesRoot() {
  return path.join(getLgtmateRoot(), "analyses");
}

export async function ensureAnalyzerStorage() {
  await mkdir(getLgtmateRoot(), { recursive: true });
  await mkdir(getWorktreesRoot(), { recursive: true });
  await mkdir(getAnalysesRoot(), { recursive: true });
}

export async function readRepoMappings() {
  try {
    const content = await readFile(getRepoMappingsPath(), "utf8");
    const parsed = JSON.parse(content) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw new Error("Failed to read repo mappings file");
  }
}

export function getStoredAnalysisPath(
  owner: string,
  repo: string,
  number: number
) {
  return path.join(
    getAnalysesRoot(),
    sanitizePathSegment(owner),
    sanitizePathSegment(repo),
    String(number),
    "analysis.json"
  );
}

function parseStoredAnalysis(content: string) {
  const parsed = JSON.parse(content) as Partial<StoredPullRequestAnalysis> | null;

  if (
    !parsed?.analysis ||
    !Array.isArray(parsed.analysis.groups) ||
    !Array.isArray(parsed.analysis.ungroupedPaths)
  ) {
    return null;
  }

  return parsed as StoredPullRequestAnalysis;
}

export async function readStoredAnalysis(
  owner: string,
  repo: string,
  number: number
) {
  const filePath = getStoredAnalysisPath(owner, repo, number);

  try {
    const content = await readFile(filePath, "utf8");
    return parseStoredAnalysis(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw new Error("The stored analysis result could not be read.");
  }
}

export async function writeStoredAnalysis(result: StoredPullRequestAnalysis) {
  const filePath = getStoredAnalysisPath(
    result.repository.owner,
    result.repository.repo,
    result.number
  );

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await Promise.all(
    ["codex", "claude"].map(async (provider) => {
      try {
        await unlink(
          path.join(path.dirname(filePath), `${provider}.json`)
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    })
  );
  return filePath;
}
