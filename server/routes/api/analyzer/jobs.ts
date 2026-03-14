import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { analysisJobStore } from "../../../analyzer/job-store";
import type { AnalysisJobStreamEvent } from "../../../analyzer/types";
import { encodeSseEvent } from "../../../hono/utils";

export const analyzerJobRoutes = new Hono();

analyzerJobRoutes.get("/:jobId", (c) => {
  const job = analysisJobStore.getJob(c.req.param("jobId"));

  if (!job) {
    return c.json({ ok: false, error: "Analysis job not found." }, 404);
  }

  return c.json({
    ok: true,
    job
  });
});

analyzerJobRoutes.get("/:jobId/stream", async (c) => {
  const jobId = c.req.param("jobId");
  const job = analysisJobStore.getJob(jobId);

  if (!job) {
    return c.json({ ok: false, error: "Analysis job not found." }, 404);
  }

  c.header("X-Accel-Buffering", "no");

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: encodeSseEvent({
        type: "snapshot",
        job
      })
    });

    if (job.status === "completed") {
      const result = analysisJobStore.getJobResult(jobId);

      if (result) {
        await stream.writeSSE({
          data: encodeSseEvent({
            type: "completed",
            job,
            result
          })
        });
      }

      return;
    }

    if (job.status === "failed") {
      await stream.writeSSE({
        data: encodeSseEvent({
          type: "failed",
          job
        })
      });
      return;
    }

    if (job.status === "cancelled") {
      await stream.writeSSE({
        data: encodeSseEvent({
          type: "cancelled",
          job
        })
      });
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;

      const cleanupCallbacks: Array<() => void> = [];
      const complete = () => {
        if (settled) {
          return;
        }

        settled = true;

        for (const cleanup of cleanupCallbacks) {
          cleanup();
        }

        resolve();
      };

      const unsubscribe = analysisJobStore.subscribe(jobId, async (event) => {
        await stream.writeSSE({
          data: encodeSseEvent(event)
        });

        if (
          event.type === "completed" ||
          event.type === "failed" ||
          event.type === "cancelled"
        ) {
          complete();
        }
      });

      cleanupCallbacks.push(unsubscribe);

      const heartbeat = setInterval(() => {
        void stream.writeSSE({
          data: encodeSseEvent({
            type: "heartbeat",
            at: new Date().toISOString()
          } satisfies AnalysisJobStreamEvent)
        });
      }, 15000);

      cleanupCallbacks.push(() => clearInterval(heartbeat));

      const abortHandler = () => {
        complete();
      };

      c.req.raw.signal.addEventListener("abort", abortHandler, { once: true });
      cleanupCallbacks.push(() => {
        c.req.raw.signal.removeEventListener("abort", abortHandler);
      });
    });
  });
});
