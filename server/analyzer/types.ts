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

export type PullRequestAnalysisInputFile = {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
  previousPath: string | null;
  patch: string | null;
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
  files: PullRequestAnalysisInputFile[];
  onProgress?: (event: PullRequestAnalysisProgressEvent) => void;
};

export type AnalyzePullRequestResult = {
  provider: AnalyzerProvider;
  model: string;
  completedAt: string;
  headOid: string;
  baseOid: string | null;
  analysis: SmartFileTreeAnalysis;
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
