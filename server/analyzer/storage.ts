import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AnalyzerProvider, StoredPullRequestAnalysis } from "./types";

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

export function getAnalyzerSchemaPath() {
  return path.join(getLgtmateRoot(), "analysis-schema.json");
}

export async function ensureAnalyzerStorage() {
  await mkdir(getLgtmateRoot(), { recursive: true });
  await mkdir(getWorktreesRoot(), { recursive: true });
  await mkdir(getAnalysesRoot(), { recursive: true });
}

export async function ensureAnalyzerSchemaFile() {
  await ensureAnalyzerStorage();

  const schemaPath = getAnalyzerSchemaPath();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "changeAreas",
      "risks",
      "testing",
      "reviewerQuestions",
      "notableFiles",
      "rawMarkdown"
    ],
    properties: {
      summary: { type: "string" },
      changeAreas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary", "files"],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            files: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      },
      risks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["severity", "title", "details", "files"],
          properties: {
            severity: {
              type: "string",
              enum: ["high", "medium", "low"]
            },
            title: { type: "string" },
            details: { type: "string" },
            files: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      },
      testing: {
        type: "object",
        additionalProperties: false,
        required: ["existingSignals", "recommendedChecks"],
        properties: {
          existingSignals: {
            type: "array",
            items: { type: "string" }
          },
          recommendedChecks: {
            type: "array",
            items: { type: "string" }
          }
        }
      },
      reviewerQuestions: {
        type: "array",
        items: { type: "string" }
      },
      notableFiles: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "reason"],
          properties: {
            path: { type: "string" },
            reason: { type: "string" }
          }
        }
      },
      rawMarkdown: {
        type: ["string", "null"]
      }
    }
  };

  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  return schemaPath;
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
  number: number,
  provider: AnalyzerProvider
) {
  return path.join(
    getAnalysesRoot(),
    sanitizePathSegment(owner),
    sanitizePathSegment(repo),
    String(number),
    `${provider}.json`
  );
}

export async function readStoredAnalysis(
  owner: string,
  repo: string,
  number: number,
  provider: AnalyzerProvider
) {
  const filePath = getStoredAnalysisPath(owner, repo, number, provider);

  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as StoredPullRequestAnalysis;
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
    result.number,
    result.provider
  );

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return filePath;
}
