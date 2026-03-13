import type { IncomingMessage, ServerResponse } from "node:http";

export function getRequiredSearchParam(req: IncomingMessage, key: string) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const value = url.searchParams.get(key);

  if (!value) {
    throw new Error(`Missing required query parameter: ${key}`);
  }

  return value;
}

export function sendJson(res: ServerResponse, body: unknown, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
