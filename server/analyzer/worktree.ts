import path from "node:path";
import { getWorktreesRoot } from "./storage";
import { runCommand } from "./process";

function buildWorktreeName(owner: string, repo: string, number: number) {
  const timestamp = Date.now();
  return `${owner}-${repo}-${number}-${timestamp}`.replace(/[^a-zA-Z0-9._-]/g, "_");
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

export async function createPullRequestWorktree(options: {
  owner: string;
  repo: string;
  number: number;
  repositoryPath: string;
  headOid: string;
}) {
  const worktreePath = path.join(
    getWorktreesRoot(),
    buildWorktreeName(options.owner, options.repo, options.number)
  );
  const startedAt = Date.now();
  const commitExistsLocally = await hasCommit(
    options.repositoryPath,
    options.headOid
  );
  const fetchStartedAt = Date.now();
  let worktreeRef = options.headOid;

  if (!commitExistsLocally) {
    await runCommand("git", [
      "-C",
      options.repositoryPath,
      "fetch",
      "--no-tags",
      "--depth=1",
      "origin",
      `pull/${options.number}/head`
    ]);
    worktreeRef = "FETCH_HEAD";
  }

  const fetchMs = Date.now() - fetchStartedAt;
  const worktreeAddStartedAt = Date.now();
  await runCommand("git", [
    "-C",
    options.repositoryPath,
    "worktree",
    "add",
    "--detach",
    worktreePath,
    worktreeRef
  ]);
  const worktreeAddMs = Date.now() - worktreeAddStartedAt;

  console.info("[analyzer] worktree prepared", {
    owner: options.owner,
    repo: options.repo,
    number: options.number,
    repositoryPath: options.repositoryPath,
    worktreePath,
    headOid: options.headOid,
    commitExistsLocally,
    fetchSkipped: commitExistsLocally,
    fetchMs,
    worktreeAddMs,
    totalMs: Date.now() - startedAt
  });

  return worktreePath;
}

export async function removePullRequestWorktree(
  repositoryPath: string,
  worktreePath: string
) {
  await runCommand("git", [
    "-C",
    repositoryPath,
    "worktree",
    "remove",
    worktreePath,
    "--force"
  ]);
}
