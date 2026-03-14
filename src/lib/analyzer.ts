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

export type PullRequestAnalysisLookupResponse = {
  ok: true;
  analysis: AnalyzePullRequestResult | null;
  repository: {
    hasMapping: boolean;
    path: string | null;
    error: string | null;
  };
  providers: Record<AnalyzerProvider, AnalyzerProviderAvailability>;
};

export type PullRequestAnalysisRunResponse = {
  ok: true;
  result: AnalyzePullRequestResult;
};

export type PullRequestAnalysisProgressEvent = {
  type: "progress";
  message: string;
};

export type PullRequestAnalysisResultEvent = {
  type: "result";
  result: AnalyzePullRequestResult;
};

export type PullRequestAnalysisErrorEvent = {
  type: "error";
  error: string;
};

export type PullRequestAnalysisStreamEvent =
  | PullRequestAnalysisProgressEvent
  | PullRequestAnalysisResultEvent
  | PullRequestAnalysisErrorEvent;

function buildAnalyzerUrl(
  owner: string,
  repo: string,
  number: number,
  provider?: AnalyzerProvider
) {
  const url = new URL(
    `/api/analyzer/pull-requests/${owner}/${repo}/${number}`,
    window.location.origin
  );

  if (provider) {
    url.searchParams.set("provider", provider);
  }

  return `${url.pathname}${url.search}`;
}

export async function getPullRequestAnalysis(
  owner: string,
  repo: string,
  number: number,
  provider: AnalyzerProvider
) {
  return fetchJson<PullRequestAnalysisLookupResponse>(
    buildAnalyzerUrl(owner, repo, number, provider)
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
  },
  handlers: {
    onProgress?: (event: PullRequestAnalysisProgressEvent) => void;
  } = {}
) {
  const response = await fetch(buildAnalyzerUrl(owner, repo, number), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    const data = (await response.json()) as { error?: unknown; message?: unknown };
    const error =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "Unexpected API response";

    throw new Error(error);
  }

  if (!response.body) {
    throw new Error("The analyzer response stream was not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AnalyzePullRequestResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let newlineIndex = buffer.indexOf("\n");

    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        const event = JSON.parse(line) as PullRequestAnalysisStreamEvent;

        if (event.type === "progress") {
          handlers.onProgress?.(event);
        } else if (event.type === "result") {
          result = event.result;
        } else {
          throw new Error(event.error);
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      break;
    }
  }

  if (!result) {
    throw new Error("The analyzer completed without returning a result.");
  }

  return {
    ok: true,
    result
  } satisfies PullRequestAnalysisRunResponse;
}
