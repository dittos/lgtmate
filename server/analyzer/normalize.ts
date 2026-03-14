import type { PullRequestAnalysisInputFile, SmartFileTreeAnalysis } from "./types";

const MAX_TITLE_LENGTH = 48;
const MAX_RATIONALE_LENGTH = 140;

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).trimEnd();
}

function toId(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function comparePaths(left: string, right: string) {
  return left.localeCompare(right);
}

export function normalizePullRequestAnalysis(
  value: unknown,
  changedFiles: PullRequestAnalysisInputFile[]
): SmartFileTreeAnalysis {
  const input = value && typeof value === "object" ? value : {};
  const record = input as Record<string, unknown>;
  const validPaths = new Set(changedFiles.map((file) => file.path));
  const usedPaths = new Set<string>();
  const groupsInput = Array.isArray(record.groups) ? record.groups : [];

  const groups = groupsInput
    .map((group, groupIndex) => {
      const groupRecord =
        group && typeof group === "object" ? (group as Record<string, unknown>) : {};
      const title = trimText(groupRecord.title, MAX_TITLE_LENGTH);
      const rationale = trimText(groupRecord.rationale, MAX_RATIONALE_LENGTH);
      const childrenInput = Array.isArray(groupRecord.children) ? groupRecord.children : [];

      const children = childrenInput
        .map((child, childIndex) => {
          const childRecord =
            child && typeof child === "object" ? (child as Record<string, unknown>) : {};
          const requestedPaths = Array.isArray(childRecord.filePaths)
            ? childRecord.filePaths
            : [];
          const filePaths = requestedPaths
            .filter((item): item is string => typeof item === "string")
            .filter((path) => validPaths.has(path))
            .filter((path) => {
              if (usedPaths.has(path)) {
                return false;
              }

              usedPaths.add(path);
              return true;
            })
            .sort(comparePaths);

          if (filePaths.length === 0) {
            return null;
          }

          const childTitle = trimText(childRecord.title, MAX_TITLE_LENGTH);

          return {
            id:
              trimText(childRecord.id, MAX_TITLE_LENGTH) ||
              `${toId(title, `group-${groupIndex + 1}`)}-${toId(
                childTitle,
                `child-${childIndex + 1}`
              )}`,
            title: childTitle || `Group ${childIndex + 1}`,
            filePaths
          };
        })
        .filter((child): child is NonNullable<typeof child> => child !== null);

      if (!title || children.length === 0) {
        return null;
      }

      return {
        id:
          trimText(groupRecord.id, MAX_TITLE_LENGTH) || toId(title, `group-${groupIndex + 1}`),
        title,
        rationale,
        children
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);

  const ungroupedPaths = changedFiles
    .map((file) => file.path)
    .filter((path) => !usedPaths.has(path))
    .sort(comparePaths);

  return {
    groups,
    ungroupedPaths: groups.length > 0 ? ungroupedPaths : changedFiles.map((file) => file.path),
    rawMarkdown: typeof record.rawMarkdown === "string" ? record.rawMarkdown : null
  };
}

export function parseAndNormalizePullRequestAnalysis(
  rawOutput: string,
  changedFiles: PullRequestAnalysisInputFile[]
) {
  const trimmed = rawOutput.trim();

  if (!trimmed) {
    throw new Error("The analyzer returned an empty response.");
  }

  try {
    return normalizePullRequestAnalysis(JSON.parse(trimmed), changedFiles);
  } catch {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return normalizePullRequestAnalysis(
        JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)),
        changedFiles
      );
    }

    throw new Error("The analyzer returned an invalid response.");
  }
}
