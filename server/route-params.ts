import type { IncomingMessage } from "node:http";
import { getRequiredSearchParam } from "./http";

export function getPullRequestParams(req: IncomingMessage) {
  const owner = getRequiredSearchParam(req, "owner");
  const repo = getRequiredSearchParam(req, "repo");
  const number = Number(getRequiredSearchParam(req, "number"));

  if (Number.isNaN(number)) {
    throw new Error("`number` must be a valid pull request number");
  }

  return { owner, repo, number };
}
