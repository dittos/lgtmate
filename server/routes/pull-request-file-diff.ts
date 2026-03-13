import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchPullRequestFilePatch } from "../github-api";
import { getRequiredSearchParam, sendJson } from "../http";
import { getPullRequestParams } from "../route-params";

export async function handlePullRequestFileDiffRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const { owner, repo, number } = getPullRequestParams(req);
    const filePath = getRequiredSearchParam(req, "path");
    const file = await fetchPullRequestFilePatch(owner, repo, number, filePath);

    sendJson(res, { ok: true, file });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load file diff";
    sendJson(res, { ok: false, error: message }, 500);
  }
}
