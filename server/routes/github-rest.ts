import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchGithubJson } from "../github-api";
import { sendJson } from "../http";

const pullRequestRoutePattern =
  /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pulls\/(?<number>\d+)(?<suffix>\/files)?\/?$/;

function getRequestHeaders(req: IncomingMessage) {
  return {
    accept: req.headers.accept
  };
}

function getSearchParams(req: IncomingMessage) {
  return new URL(req.url ?? "/", "http://localhost").searchParams;
}

export async function handleGithubRestRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    if (req.method !== "GET") {
      sendJson(res, { message: "Method not allowed" }, 405);
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const match = url.pathname.match(pullRequestRoutePattern);

    if (!match?.groups) {
      sendJson(res, { message: "Not found" }, 404);
      return;
    }

    const { owner, repo, number, suffix } = match.groups;
    const pathname = suffix
      ? `/repos/${owner}/${repo}/pulls/${number}/files`
      : `/repos/${owner}/${repo}/pulls/${number}`;

    const payload = await fetchGithubJson(pathname, {
      headers: getRequestHeaders(req),
      searchParams: getSearchParams(req)
    });

    sendJson(res, payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch GitHub API";
    sendJson(res, { message }, 500);
  }
}
