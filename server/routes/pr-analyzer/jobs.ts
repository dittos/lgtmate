import type { IncomingMessage, ServerResponse } from "node:http";
import { analysisJobStore } from "../../analyzer/job-store";
import type { AnalysisJobStreamEvent } from "../../analyzer/types";
import { sendJson } from "../../http";

function writeSseEvent(res: ServerResponse, event: AnalysisJobStreamEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function startSse(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

export function handleJobSnapshot(res: ServerResponse, jobId: string) {
  const job = analysisJobStore.getJob(jobId);

  if (!job) {
    sendJson(res, { ok: false, error: "Analysis job not found." }, 404);
    return;
  }

  sendJson(res, {
    ok: true,
    job
  });
}

export function handleJobStream(req: IncomingMessage, res: ServerResponse, jobId: string) {
  const job = analysisJobStore.getJob(jobId);

  if (!job) {
    sendJson(res, { ok: false, error: "Analysis job not found." }, 404);
    return;
  }

  startSse(res);
  writeSseEvent(res, { type: "snapshot", job });

  if (job.status === "completed") {
    const result = analysisJobStore.getJobResult(jobId);

    if (result) {
      writeSseEvent(res, { type: "completed", job, result });
    }

    res.end();
    return;
  }

  if (job.status === "failed") {
    writeSseEvent(res, { type: "failed", job });
    res.end();
    return;
  }

  if (job.status === "cancelled") {
    writeSseEvent(res, { type: "cancelled", job });
    res.end();
    return;
  }

  const unsubscribe = analysisJobStore.subscribe(jobId, (event) => {
    writeSseEvent(res, event);

    if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
      cleanup();
      res.end();
    }
  });

  const heartbeat = setInterval(() => {
    writeSseEvent(res, {
      type: "heartbeat",
      at: new Date().toISOString()
    });
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on("close", cleanup);
}
