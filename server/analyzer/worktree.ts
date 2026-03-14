import path from "node:path";
import { getWorktreesRoot } from "./storage";
import { runCommand } from "./process";

function buildWorktreeName(owner: string, repo: string, number: number) {
  const timestamp = Date.now();
  return `${owner}-${repo}-${number}-${timestamp}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function createPullRequestWorktree(options: {
  owner: string;
  repo: string;
  number: number;
  repositoryPath: string;
}) {
  const worktreePath = path.join(
    getWorktreesRoot(),
    buildWorktreeName(options.owner, options.repo, options.number)
  );

  await runCommand("git", [
    "-C",
    options.repositoryPath,
    "fetch",
    "--no-tags",
    "origin",
    `pull/${options.number}/head`
  ]);
  await runCommand("git", [
    "-C",
    options.repositoryPath,
    "worktree",
    "add",
    "--detach",
    worktreePath,
    "FETCH_HEAD"
  ]);

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
