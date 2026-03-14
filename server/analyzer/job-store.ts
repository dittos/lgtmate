import { randomUUID } from "node:crypto";
import type {
  AnalysisJobRecord,
  AnalysisJobSnapshot,
  AnalysisJobStatus,
  AnalysisJobStreamEvent,
  AnalyzerProvider,
  StoredPullRequestAnalysis
} from "./types";

type JobSubscriber = (event: AnalysisJobStreamEvent) => void;

type CreateAnalysisJobInput = {
  owner: string;
  repo: string;
  number: number;
  provider: AnalyzerProvider;
  model: string;
  headOid: string;
  baseOid: string | null;
};

const MAX_TERMINAL_JOBS = 100;

function toSnapshot(job: AnalysisJobRecord): AnalysisJobSnapshot {
  const { result, ...snapshot } = job;
  return snapshot;
}

class AnalysisJobStore {
  private readonly jobs = new Map<string, AnalysisJobRecord>();
  private readonly activeJobIdsByPullRequest = new Map<string, string>();
  private readonly subscribers = new Map<string, Set<JobSubscriber>>();
  private readonly terminalJobIds: string[] = [];

  private getPullRequestKey(input: {
    owner: string;
    repo: string;
    number: number;
  }) {
    return `${input.owner}/${input.repo}#${input.number}`;
  }

  createJob(input: CreateAnalysisJobInput) {
    const now = new Date().toISOString();
    const pullRequestKey = this.getPullRequestKey(input);
    const activeJobId = this.activeJobIdsByPullRequest.get(pullRequestKey);

    if (activeJobId) {
      this.cancelJob(activeJobId, "Superseded by a newer analysis run");
    }

    const job: AnalysisJobRecord = {
      id: randomUUID(),
      owner: input.owner,
      repo: input.repo,
      number: input.number,
      provider: input.provider,
      model: input.model,
      headOid: input.headOid,
      baseOid: input.baseOid,
      status: "queued",
      createdAt: now,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
      progressMessage: null,
      progressSequence: 0,
      error: null,
      resultPath: null,
      result: null
    };

    this.jobs.set(job.id, job);
    this.activeJobIdsByPullRequest.set(pullRequestKey, job.id);
    return toSnapshot(job);
  }

  getJob(jobId: string) {
    const job = this.jobs.get(jobId);
    return job ? toSnapshot(job) : null;
  }

  getJobResult(jobId: string) {
    return this.jobs.get(jobId)?.result ?? null;
  }

  findActiveJob(input: { owner: string; repo: string; number: number }) {
    const jobId = this.activeJobIdsByPullRequest.get(this.getPullRequestKey(input));

    if (!jobId) {
      return null;
    }

    return this.getJob(jobId);
  }

  findRelevantJob(input: {
    owner: string;
    repo: string;
    number: number;
    provider?: AnalyzerProvider;
    headOid: string | null;
  }) {
    const active = this.findActiveJob(input);

    if (active) {
      return active;
    }

    let best: AnalysisJobRecord | null = null;

    for (const job of this.jobs.values()) {
      if (job.owner !== input.owner || job.repo !== input.repo || job.number !== input.number) {
        continue;
      }

      if (!best || Date.parse(job.updatedAt) > Date.parse(best.updatedAt)) {
        best = job;
      }
    }

    return best ? toSnapshot(best) : null;
  }

  markRunning(jobId: string) {
    return this.updateJob(jobId, (job) => {
      if (job.status !== "queued") {
        return null;
      }

      const now = new Date().toISOString();
      job.status = "running";
      job.startedAt = now;
      job.updatedAt = now;
      return {
        type: "progress",
        jobId: job.id,
        sequence: job.progressSequence,
        message: job.progressMessage ?? "Starting analysis",
        status: "running"
      } satisfies AnalysisJobStreamEvent;
    });
  }

  appendProgress(jobId: string, message: string) {
    return this.updateJob(jobId, (job) => {
      if (job.status !== "queued" && job.status !== "running") {
        return null;
      }

      const trimmed = message.trim();

      if (!trimmed) {
        return null;
      }

      const nextStatus: AnalysisJobStatus = "running";

      if (job.progressMessage === trimmed) {
        return null;
      }

      const now = new Date().toISOString();
      job.status = nextStatus;
      job.startedAt ??= now;
      job.progressMessage = trimmed;
      job.progressSequence += 1;
      job.updatedAt = now;

      return {
        type: "progress",
        jobId: job.id,
        sequence: job.progressSequence,
        message: trimmed,
        status: "running"
      } satisfies AnalysisJobStreamEvent;
    });
  }

  completeJob(jobId: string, input: { resultPath: string; result: StoredPullRequestAnalysis }) {
    return this.updateJob(jobId, (job) => {
      if (job.status !== "queued" && job.status !== "running") {
        return null;
      }

      const now = new Date().toISOString();
      job.status = "completed";
      job.completedAt = now;
      job.updatedAt = now;
      job.progressMessage = "Analysis complete";
      job.resultPath = input.resultPath;
      job.result = input.result;
      job.error = null;
      this.clearActiveJob(job);
      this.trackTerminalJob(job.id);

      return {
        type: "completed",
        job: toSnapshot(job),
        result: input.result
      } satisfies AnalysisJobStreamEvent;
    });
  }

  failJob(jobId: string, error: string) {
    return this.updateJob(jobId, (job) => {
      if (job.status !== "queued" && job.status !== "running") {
        return null;
      }

      const now = new Date().toISOString();
      job.status = "failed";
      job.completedAt = now;
      job.updatedAt = now;
      job.error = error;
      job.progressMessage ??= error;
      this.clearActiveJob(job);
      this.trackTerminalJob(job.id);

      return {
        type: "failed",
        job: toSnapshot(job)
      } satisfies AnalysisJobStreamEvent;
    });
  }

  cancelJob(jobId: string, reason = "Cancelled") {
    return this.updateJob(jobId, (job) => {
      if (job.status !== "queued" && job.status !== "running") {
        return null;
      }

      const now = new Date().toISOString();
      job.status = "cancelled";
      job.completedAt = now;
      job.updatedAt = now;
      job.error = reason;
      job.progressMessage = reason;
      this.clearActiveJob(job);
      this.trackTerminalJob(job.id);

      return {
        type: "cancelled",
        job: toSnapshot(job)
      } satisfies AnalysisJobStreamEvent;
    });
  }

  subscribe(jobId: string, subscriber: JobSubscriber) {
    const listeners = this.subscribers.get(jobId) ?? new Set<JobSubscriber>();
    listeners.add(subscriber);
    this.subscribers.set(jobId, listeners);

    return () => {
      const currentListeners = this.subscribers.get(jobId);

      if (!currentListeners) {
        return;
      }

      currentListeners.delete(subscriber);

      if (currentListeners.size === 0) {
        this.subscribers.delete(jobId);
      }
    };
  }

  private updateJob(
    jobId: string,
    updater: (job: AnalysisJobRecord) => AnalysisJobStreamEvent | null
  ) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return null;
    }

    const event = updater(job);

    if (event) {
      this.broadcast(jobId, event);
    }

    return toSnapshot(job);
  }

  private broadcast(jobId: string, event: AnalysisJobStreamEvent) {
    const listeners = this.subscribers.get(jobId);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  private clearActiveJob(job: Pick<AnalysisJobRecord, "id" | "owner" | "repo" | "number">) {
    const pullRequestKey = this.getPullRequestKey(job);
    const activeJobId = this.activeJobIdsByPullRequest.get(pullRequestKey);

    if (activeJobId === job.id) {
      this.activeJobIdsByPullRequest.delete(pullRequestKey);
    }
  }

  private trackTerminalJob(jobId: string) {
    this.terminalJobIds.push(jobId);

    while (this.terminalJobIds.length > MAX_TERMINAL_JOBS) {
      const evictedId = this.terminalJobIds.shift();

      if (!evictedId) {
        return;
      }

      const job = this.jobs.get(evictedId);

      if (!job || job.status === "queued" || job.status === "running") {
        continue;
      }

      this.jobs.delete(evictedId);
      this.subscribers.delete(evictedId);
    }
  }
}

export const analysisJobStore = new AnalysisJobStore();
