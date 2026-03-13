import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../http";

export function handleHealthRoute(_req: IncomingMessage, res: ServerResponse) {
  sendJson(res, { ok: true });
}
