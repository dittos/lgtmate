import { fetchJson } from "./api";

export type AnalyzerProvider = "codex" | "claude";

export type PullRequestAnalysis = {
  summary: string;
  changeAreas: Array<{
    title: string;
    summary: string;
    files: string[];
  }>;
  risks: Array<{
    severity: "high" | "medium" | "low";
    title: string;
    details: string;
    files: string[];
  }>;
  testing: {
    existingSignals: string[];
    recommendedChecks: string[];
  };
  reviewerQuestions: string[];
  notableFiles: Array<{
    path: string;
    reason: string;
  }>;
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
  analysis: PullRequestAnalysis;
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
  }
) {
  return fetchJson<PullRequestAnalysisRunResponse>(
    buildAnalyzerUrl(owner, repo, number),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options)
    }
  );
}
