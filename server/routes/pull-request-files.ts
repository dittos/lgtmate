import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchPullRequestFiles } from "../github-api";
import { sendJson } from "../http";
import { getPullRequestParams } from "../route-params";

export async function handlePullRequestFilesRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const { owner, repo, number } = getPullRequestParams(req);
    const files = await fetchPullRequestFiles(owner, repo, number);

    sendJson(res, { ok: true, files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load pull request files";
    sendJson(res, { ok: false, error: message }, 500);
  }
}
