import type { IncomingMessage, ServerResponse } from "node:http";
import { invalidatePullRequestFilesCache } from "../github-api";
import { sendJson } from "../http";
import { getPullRequestParams } from "../route-params";

export function handlePullRequestCacheRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const { owner, repo, number } = getPullRequestParams(req);
    invalidatePullRequestFilesCache(owner, repo, number);
    sendJson(res, { ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to invalidate pull request cache";
    sendJson(res, { ok: false, error: message }, 500);
  }
}
