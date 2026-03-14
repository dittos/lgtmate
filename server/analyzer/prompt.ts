import { writeFile } from "node:fs/promises";
import { getLgtmateRoot } from "./storage";
import type { AnalyzePullRequestInput } from "./types";

function formatChangedFiles(input: AnalyzePullRequestInput) {
  return input.files
    .map((file) => {
      const renameSuffix = file.previousPath
        ? ` previousPath=${file.previousPath}`
        : "";

      return `- path=${file.path} changeType=${file.changeType} additions=${file.additions} deletions=${file.deletions}${renameSuffix}`;
    })
    .join("\n");
}

function formatChangedFilePatches(input: AnalyzePullRequestInput) {
  return input.files
    .map((file) => {
      const header = `--- ${file.path}`;

      if (!file.patch) {
        return `${header}\n(patch unavailable)`;
      }

      return `${header}\n${file.patch}`;
    })
    .join("\n\n");
}

export function getPullRequestAnalysisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["groups", "ungroupedPaths", "rawMarkdown"],
    properties: {
      groups: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "rationale", "children"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            rationale: { type: "string" },
            children: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "title", "filePaths"],
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  filePaths: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            }
          }
        }
      },
      ungroupedPaths: {
        type: "array",
        items: { type: "string" }
      },
      rawMarkdown: {
        type: ["string", "null"]
      }
    }
  };
}

export async function ensureAnalyzerSchemaFile() {
  const schemaPath = `${getLgtmateRoot()}/analysis-schema.json`;
  await writeFile(
    schemaPath,
    `${JSON.stringify(getPullRequestAnalysisSchema(), null, 2)}\n`,
    "utf8"
  );
  return schemaPath;
}

export function buildPullRequestAnalysisPrompt(input: AnalyzePullRequestInput) {
  return `
You are assisting a human reviewer by reorganizing the changed files in a GitHub pull request into a smart review tree. The repository is checked out in the current working directory.

Repository: ${input.owner}/${input.repo}
Pull request: #${input.number}
URL: ${input.pullRequest.url}
Author: ${input.pullRequest.author ?? "unknown"}
Base branch: ${input.pullRequest.baseRefName}
Head branch: ${input.pullRequest.headRefName}
Base commit: ${input.baseOid ?? "unknown"}
Head commit: ${input.headOid}

PR title:
${input.pullRequest.title}

PR body:
${input.pullRequest.body || "(empty)"}

Changed files:
${formatChangedFiles(input)}

Changed file patches:
${formatChangedFilePatches(input)}

Instructions:
- Use the provided changed files and patches as the primary input. Inspect the repository, file contents, or git history from the current working directory only when extra context is needed.
- Your task is classification only. Do not produce a prose review summary, risks, testing advice, or reviewer questions.
- Group the changed files into concise top-level implementation groups that reflect feature, concern, or workstream boundaries.
  - Group the frontend/backend changes into one top-level group if they implement the same slice of feature
- Inside each top-level group, create meaningful sub-groups.
- Order sub-groups from outside or user-facing layers toward deeper internal implementation layers, for example:
  - Frontend:
    1. routes or screens
    2. container components
    3. UI components
    4. state or API client
  - Backend:
    1. API handlers
    2. services
    3. repositories
    4. core entities or models
  - Keep tests in the same sub-group with the related implementation files when possible.
- Every changed file path must appear exactly once across groups[].children[].filePaths, unless you intentionally leave it for ungroupedPaths.
- Never invent file paths. Use only the provided changed file paths.
- Keep titles short, usually 2 to 5 words.
- Keep rationale short and concrete. One sentence max.
- If grouping is weak, return fewer groups instead of forcing structure.
- Return JSON only, matching the required schema.

Required JSON shape:
{
  "groups": [
    {
      "id": string,
      "title": string,
      "rationale": string,
      "children": [
        {
          "id": string,
          "title": string,
          "filePaths": string[]
        }
      ]
    }
  ],
  "ungroupedPaths": string[],
  "rawMarkdown": null
}
`.trim();
}
