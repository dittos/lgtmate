import { runCommand } from "./process";

export type PullRequestHiddenContextDirection = "before" | "after" | "both";

export type PullRequestHiddenContextRequest = {
  repositoryPath: string;
  pullRequestNumber: number;
  commitOid: string;
  path: string;
  anchorLine: number;
  direction: PullRequestHiddenContextDirection;
  lineCount: number;
};

export type PullRequestHiddenContextResponse = {
  startLine: number;
  endLine: number;
  lines: string[];
  hasMoreAbove: boolean;
  hasMoreBelow: boolean;
};

function splitFileLines(contents: string) {
  const normalized = contents.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

export function getHiddenContextWindow(input: {
  totalLines: number;
  anchorLine: number;
  direction: PullRequestHiddenContextDirection;
  lineCount: number;
}): PullRequestHiddenContextResponse {
  if (!Number.isInteger(input.anchorLine) || input.anchorLine < 1) {
    throw new Error("Invalid anchor line.");
  }

  if (!Number.isInteger(input.lineCount) || input.lineCount < 1) {
    throw new Error("Invalid line count.");
  }

  if (input.totalLines < 1) {
    throw new Error("File has no text lines.");
  }

  if (input.anchorLine > input.totalLines) {
    throw new Error("Anchor line is outside the file.");
  }

  if (
    input.direction !== "before" &&
    input.direction !== "after" &&
    input.direction !== "both"
  ) {
    throw new Error("Unsupported hidden context direction.");
  }

  const startLine =
    input.direction === "after"
      ? input.anchorLine
      : Math.max(1, input.anchorLine - input.lineCount);
  const endLine =
    input.direction === "before"
      ? input.anchorLine
      : Math.min(input.totalLines, input.anchorLine + input.lineCount);

  return {
    startLine,
    endLine,
    lines: [],
    hasMoreAbove: startLine > 1,
    hasMoreBelow: endLine < input.totalLines
  };
}

async function readCommitFile(
  repositoryPath: string,
  commitOid: string,
  filePath: string
) {
  try {
    const { stdout } = await runCommand(
      "git",
      ["-C", repositoryPath, "show", `${commitOid}:${filePath}`],
      { captureStdout: true }
    );

    return stdout;
  } catch {
    throw new Error("Failed to read file contents from the local clone.");
  }
}

async function hasCommit(repositoryPath: string, oid: string) {
  try {
    await runCommand("git", [
      "-C",
      repositoryPath,
      "cat-file",
      "-e",
      `${oid}^{commit}`
    ]);
    return true;
  } catch {
    return false;
  }
}

async function ensureCommitAvailable(input: {
  repositoryPath: string;
  pullRequestNumber: number;
  commitOid: string;
}) {
  const commitExistsLocally = await hasCommit(input.repositoryPath, input.commitOid);

  if (commitExistsLocally) {
    return;
  }

  await runCommand("git", [
    "-C",
    input.repositoryPath,
    "fetch",
    "--no-tags",
    "--depth=1",
    "origin",
    `pull/${input.pullRequestNumber}/head`
  ]);

  const fetchedCommitExists = await hasCommit(input.repositoryPath, input.commitOid);

  if (!fetchedCommitExists) {
    throw new Error("Failed to fetch the requested commit into the local clone.");
  }
}

export async function readPullRequestHiddenContext(
  input: PullRequestHiddenContextRequest
): Promise<PullRequestHiddenContextResponse> {
  await ensureCommitAvailable({
    repositoryPath: input.repositoryPath,
    pullRequestNumber: input.pullRequestNumber,
    commitOid: input.commitOid
  });

  const fileContents = await readCommitFile(
    input.repositoryPath,
    input.commitOid,
    input.path
  );
  const lines = splitFileLines(fileContents);
  const window = getHiddenContextWindow({
    totalLines: lines.length,
    anchorLine: input.anchorLine,
    direction: input.direction,
    lineCount: input.lineCount
  });

  return {
    ...window,
    lines: lines.slice(window.startLine - 1, window.endLine)
  };
}
