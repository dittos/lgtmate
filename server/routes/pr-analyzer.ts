import type { IncomingMessage, ServerResponse } from "node:http";
import { ensureAnalyzerStorage } from "../analyzer/storage";
import { readJsonBody, sendJson } from "../http";
import { handleJobSnapshot, handleJobStream } from "./pr-analyzer/jobs";
import {
  type AnalyzerRequestBody,
  handlePullRequestLookup,
  handlePullRequestRun
} from "./pr-analyzer/pull-requests";

const pullRequestRoutePattern =
  /^\/pull-requests\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/(?<number>\d+)\/?$/;
const jobRoutePattern = /^\/jobs\/(?<jobId>[^/]+)(?:\/(?<suffix>stream))?\/?$/;

async function readAnalyzerRequestBody(req: IncomingMessage) {
  return (await readJsonBody(req)) as AnalyzerRequestBody;
}

function parseRoute(req: IncomingMessage) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pullRequestMatch = url.pathname.match(pullRequestRoutePattern);

  if (pullRequestMatch?.groups) {
    const number = Number(pullRequestMatch.groups.number);

    if (Number.isNaN(number)) {
      throw new Error("Invalid pull request number");
    }

    return {
      type: "pull-request" as const,
      owner: pullRequestMatch.groups.owner,
      repo: pullRequestMatch.groups.repo,
      number
    };
  }

  const jobMatch = url.pathname.match(jobRoutePattern);

  if (jobMatch?.groups) {
    return {
      type: "job" as const,
      jobId: jobMatch.groups.jobId,
      stream: jobMatch.groups.suffix === "stream"
    };
  }

  return null;
}

export async function handlePullRequestAnalyzerRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  const route = parseRoute(req);

  if (!route) {
    sendJson(res, { ok: false, error: "Not found" }, 404);
    return;
  }

  try {
    await ensureAnalyzerStorage();

    if (route.type === "job") {
      if (req.method !== "GET") {
        sendJson(res, { ok: false, error: "Method not allowed" }, 405);
        return;
      }

      if (route.stream) {
        // GET /api/analyzer/jobs/:jobId/stream
        handleJobStream(req, res, route.jobId);
        return;
      }

      // GET /api/analyzer/jobs/:jobId
      handleJobSnapshot(res, route.jobId);
      return;
    }

    if (req.method === "GET") {
      // GET /api/analyzer/pull-requests/:owner/:repo/:number
      await handlePullRequestLookup(res, route);
      return;
    }

    if (req.method === "POST") {
      // POST /api/analyzer/pull-requests/:owner/:repo/:number
      const body = await readAnalyzerRequestBody(req);
      await handlePullRequestRun(res, route, body);
      return;
    }

    sendJson(res, { ok: false, error: "Method not allowed" }, 405);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze pull request";

    console.error("[analyzer] route failed", {
      route: req.url,
      error: message
    });

    if (!res.headersSent) {
      sendJson(res, { ok: false, error: message }, 500);
      return;
    }

    res.end();
  }
}
