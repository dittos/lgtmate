import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchGithubGraphql } from "../github-api";
import { sendJson } from "../http";

type GraphqlBody = {
  operationName?: string | null;
  query?: string;
  variables?: Record<string, boolean | number | string | null | undefined>;
};

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");

  if (!body) {
    throw new Error("Missing GraphQL request body");
  }

  return JSON.parse(body) as GraphqlBody;
}

export async function handleGithubGraphqlRoute(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    if (req.method !== "POST") {
      sendJson(res, { message: "Method not allowed" }, 405);
      return;
    }

    const { operationName, query, variables } = await readJsonBody(req);

    if (!query) {
      sendJson(res, { message: "Missing GraphQL query" }, 400);
      return;
    }

    const payload = await fetchGithubGraphql({
      operationName,
      query,
      variables
    });

    sendJson(res, payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch GitHub GraphQL API";
    sendJson(res, { message }, 500);
  }
}
