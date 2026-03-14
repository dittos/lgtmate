import { fetchJson } from "./api";

export type AnalyzerProvider = "codex" | "claude";

export type SmartFileTreeAnalysis = {
  groups: Array<{
    id: string;
    title: string;
    rationale: string;
    children: Array<{
      id: string;
      title: string;
      filePaths: string[];
    }>;
  }>;
  ungroupedPaths: string[];
  rawMarkdown: string | null;
};

export type AnalyzePullRequestResult = {
  repository: {
    owner: string;
    repo: string;
  };
  number: number;
  provider: AnalyzerProvider;
  model: string;
  completedAt: string;
  headOid: string;
  baseOid: string | null;
  analysis: SmartFileTreeAnalysis;
};

export type AnalyzerProviderAvailability = {
  available: boolean;
  reason: string | null;
};

export type AnalysisJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AnalysisJobSnapshot = {
  id: string;
  owner: string;
  repo: string;
  number: number;
  provider: AnalyzerProvider;
  model: string;
  headOid: string;
  baseOid: string | null;
  dedupeKey: string;
  status: AnalysisJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  progressMessage: string | null;
  progressSequence: number;
  error: string | null;
  resultPath: string | null;
};

export type PullRequestAnalysisLookupResponse = {
  ok: true;
  analysis: AnalyzePullRequestResult | null;
  repository: {
    hasMapping: boolean;
    path: string | null;
    error: string | null;
  };
  providers: Record<AnalyzerProvider, AnalyzerProviderAvailability>;
  job: AnalysisJobSnapshot | null;
};

export type PullRequestAnalysisRunResponse = {
  ok: true;
  job: AnalysisJobSnapshot;
  reusedExistingJob: boolean;
};

export type PullRequestAnalysisJobResponse = {
  ok: true;
  job: AnalysisJobSnapshot;
};

export type AnalysisJobSnapshotEvent = {
  type: "snapshot";
  job: AnalysisJobSnapshot;
};

export type AnalysisJobProgressEvent = {
  type: "progress";
  jobId: string;
  sequence: number;
  message: string;
  status: "queued" | "running";
};

export type AnalysisJobCompletedEvent = {
  type: "completed";
  job: AnalysisJobSnapshot;
  result: AnalyzePullRequestResult;
};

export type AnalysisJobFailedEvent = {
  type: "failed";
  job: AnalysisJobSnapshot;
};

export type AnalysisJobHeartbeatEvent = {
  type: "heartbeat";
  at: string;
};

export type AnalysisJobStreamEvent =
  | AnalysisJobSnapshotEvent
  | AnalysisJobProgressEvent
  | AnalysisJobCompletedEvent
  | AnalysisJobFailedEvent
  | AnalysisJobHeartbeatEvent;

function buildPullRequestAnalyzerUrl(owner: string, repo: string, number: number) {
  const url = new URL(
    `/api/analyzer/pull-requests/${owner}/${repo}/${number}`,
    window.location.origin
  );

  return `${url.pathname}${url.search}`;
}

function buildAnalysisJobUrl(jobId: string, stream = false) {
  const suffix = stream ? "/stream" : "";
  return `/api/analyzer/jobs/${jobId}${suffix}`;
}

export async function getPullRequestAnalysis(
  owner: string,
  repo: string,
  number: number
) {
  return fetchJson<PullRequestAnalysisLookupResponse>(
    buildPullRequestAnalyzerUrl(owner, repo, number)
  );
}

export async function analyzePullRequest(
  owner: string,
  repo: string,
  number: number,
  options: {
    provider: AnalyzerProvider;
    model?: string;
    forceRefresh?: boolean;
  }
) {
  return fetchJson<PullRequestAnalysisRunResponse>(
    buildPullRequestAnalyzerUrl(owner, repo, number),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options)
    }
  );
}

export async function getAnalysisJob(jobId: string) {
  return fetchJson<PullRequestAnalysisJobResponse>(buildAnalysisJobUrl(jobId));
}

export function subscribeToAnalysisJob(
  jobId: string,
  handlers: {
    onOpen?: () => void;
    onEvent?: (event: AnalysisJobStreamEvent) => void;
    onError?: () => void;
  }
) {
  const source = new EventSource(buildAnalysisJobUrl(jobId, true));

  source.onopen = () => {
    handlers.onOpen?.();
  };

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as AnalysisJobStreamEvent;
    handlers.onEvent?.(event);
  };

  source.onerror = () => {
    handlers.onError?.();
  };

  return () => {
    source.close();
  };
}
