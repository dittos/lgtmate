import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchPullRequestSummary } from "../github-api";
import { sendJson } from "../http";
import { getPullRequestParams } from "../route-params";

export async function handlePullRequestRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const { owner, repo, number } = getPullRequestParams(req);
    const pullRequest = await fetchPullRequestSummary(owner, repo, number);

    sendJson(res, { ok: true, pullRequest });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load pull request";
    sendJson(res, { ok: false, error: message }, 500);
  }
}
