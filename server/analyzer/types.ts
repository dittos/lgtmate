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

export type PullRequestAnalysisInputPullRequest = {
  title: string;
  body: string;
  url: string;
  author: string | null;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string | null;
};

export type AnalyzePullRequestInput = {
  owner: string;
  repo: string;
  number: number;
  provider: AnalyzerProvider;
  model?: string;
  localRepositoryPath: string;
  worktreePath: string;
  headOid: string;
  baseOid: string | null;
  pullRequest: PullRequestAnalysisInputPullRequest;
  onProgress?: (event: PullRequestAnalysisProgressEvent) => void;
};

export type AnalyzePullRequestResult = {
  provider: AnalyzerProvider;
  model: string;
  completedAt: string;
  headOid: string;
  baseOid: string | null;
  analysis: PullRequestAnalysis;
};

export type StoredPullRequestAnalysis = AnalyzePullRequestResult & {
  repository: {
    owner: string;
    repo: string;
  };
  number: number;
};

export interface PullRequestAnalyzer {
  readonly provider: AnalyzerProvider;
  readonly defaultModel: string;
  analyzePullRequest(
    input: AnalyzePullRequestInput
  ): Promise<AnalyzePullRequestResult>;
}

export type AnalyzerProviderAvailability = {
  available: boolean;
  reason: string | null;
};

export type PullRequestAnalysisProgressEvent = {
  message: string;
};
