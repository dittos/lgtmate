import type { PullRequestAnalysis } from "./types";

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function normalizeSeverity(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "low" ? value : "medium";
}

export function normalizePullRequestAnalysis(value: unknown): PullRequestAnalysis {
  const input = value && typeof value === "object" ? value : {};
  const record = input as Record<string, unknown>;

  return {
    summary: typeof record.summary === "string" ? record.summary : "",
    changeAreas: Array.isArray(record.changeAreas)
      ? record.changeAreas
          .map((item) => {
            const changeArea = item && typeof item === "object" ? item : {};
            const entry = changeArea as Record<string, unknown>;

            return {
              title: typeof entry.title === "string" ? entry.title : "",
              summary: typeof entry.summary === "string" ? entry.summary : "",
              files: normalizeStringList(entry.files)
            };
          })
          .filter((item) => item.title || item.summary || item.files.length > 0)
      : [],
    risks: Array.isArray(record.risks)
      ? record.risks
          .map((item) => {
            const risk = item && typeof item === "object" ? item : {};
            const entry = risk as Record<string, unknown>;

            return {
              severity: normalizeSeverity(entry.severity),
              title: typeof entry.title === "string" ? entry.title : "",
              details: typeof entry.details === "string" ? entry.details : "",
              files: normalizeStringList(entry.files)
            };
          })
          .filter((item) => item.title || item.details)
      : [],
    testing: {
      existingSignals: normalizeStringList(
        record.testing &&
          typeof record.testing === "object" &&
          "existingSignals" in record.testing
          ? (record.testing as Record<string, unknown>).existingSignals
          : undefined
      ),
      recommendedChecks: normalizeStringList(
        record.testing &&
          typeof record.testing === "object" &&
          "recommendedChecks" in record.testing
          ? (record.testing as Record<string, unknown>).recommendedChecks
          : undefined
      )
    },
    reviewerQuestions: normalizeStringList(record.reviewerQuestions),
    notableFiles: Array.isArray(record.notableFiles)
      ? record.notableFiles
          .map((item) => {
            const notable = item && typeof item === "object" ? item : {};
            const entry = notable as Record<string, unknown>;

            return {
              path: typeof entry.path === "string" ? entry.path : "",
              reason: typeof entry.reason === "string" ? entry.reason : ""
            };
          })
          .filter((item) => item.path && item.reason)
      : [],
    rawMarkdown:
      typeof record.rawMarkdown === "string" ? record.rawMarkdown : null
  };
}

export function parseAndNormalizePullRequestAnalysis(rawOutput: string) {
  const trimmed = rawOutput.trim();

  if (!trimmed) {
    throw new Error("The analyzer returned an empty response.");
  }

  try {
    return normalizePullRequestAnalysis(JSON.parse(trimmed));
  } catch {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return normalizePullRequestAnalysis(
        JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1))
      );
    }

    throw new Error("The analyzer returned an invalid response.");
  }
}
