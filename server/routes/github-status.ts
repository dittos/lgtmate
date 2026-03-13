import type { IncomingMessage, ServerResponse } from "node:http";
import { getGithubStatus } from "../github-api";
import { sendJson } from "../http";

export async function handleGithubStatusRoute(
  _req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const output = await getGithubStatus();
    sendJson(res, { ok: true, output });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown GitHub CLI error";
    sendJson(res, { ok: false, error: message }, 500);
  }
}
