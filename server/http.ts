import type { IncomingMessage, ServerResponse } from "node:http";

export function getRequiredSearchParam(req: IncomingMessage, key: string) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const value = url.searchParams.get(key);

  if (!value) {
    throw new Error(`Missing required query parameter: ${key}`);
  }

  return value;
}

export async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function sendJson(res: ServerResponse, body: unknown, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
