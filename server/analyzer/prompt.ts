import type { AnalyzePullRequestInput } from "./types";

export function buildPullRequestAnalysisPrompt(
  input: AnalyzePullRequestInput
) {
  return `
You are assisting a human reviewer by analyzing a GitHub pull request from the checked-out repository in the current working directory.

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

Instructions:
- Inspect the repository and git history from the current working directory instead of assuming the PR body is complete.
- Use git diff, file reads, and repository context to understand the change.
- Prefer risks, caveats, and reviewer questions over claiming definite bugs.
- If something is uncertain, make that explicit in the wording.
- Mention file paths when they materially support a point.
- Return JSON only, matching the required schema.

Required JSON shape:
{
  "summary": string,
  "changeAreas": [{ "title": string, "summary": string, "files": string[] }],
  "risks": [{ "severity": "high" | "medium" | "low", "title": string, "details": string, "files": string[] }],
  "testing": {
    "existingSignals": string[],
    "recommendedChecks": string[]
  },
  "reviewerQuestions": string[],
  "notableFiles": [{ "path": string, "reason": string }]
}
`.trim();
}
