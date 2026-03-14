import { useEffect, useState } from "react";
import type { AnalyzerProvider } from "@/lib/analyzer";
import {
  getAnalysisController,
  useAnalysisController,
  useAnalysisControllerSelector
} from "@/lib/analysis-controller";
import {
  getPullRequest,
  getPullRequestFileDiff,
  getPullRequestFiles,
  type GithubPullRequest,
  type GithubPullRequestFileNode,
  type GithubPullRequestRestFile
} from "@/lib/github";

const LAST_ANALYSIS_PROVIDER_STORAGE_KEY = "lgtmate-last-analysis-provider";
const ANALYZER_PROVIDERS: AnalyzerProvider[] = ["codex", "claude"];

function getAvailableAnalysisProvider(
  providers: Record<
    AnalyzerProvider,
    {
      available: boolean;
    }
  >,
  preferredProvider?: AnalyzerProvider | null
) {
  if (preferredProvider && providers[preferredProvider].available) {
    return preferredProvider;
  }

  return (
    ANALYZER_PROVIDERS.find((provider) => providers[provider].available) ?? "codex"
  );
}

function getStoredLastAnalysisProvider(): AnalyzerProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedProvider = window.localStorage.getItem(
    LAST_ANALYSIS_PROVIDER_STORAGE_KEY
  );

  return storedProvider === "codex" || storedProvider === "claude"
    ? storedProvider
    : null;
}

function getCurrentAnalysisProvider(input: {
  providers: Record<
    AnalyzerProvider,
    {
      available: boolean;
    }
  >;
  analysisProvider: AnalyzerProvider | null;
  lastUsedProvider: AnalyzerProvider | null;
  job:
    | {
        provider: AnalyzerProvider;
        status: string;
      }
    | null;
}) {
  if (input.job && (input.job.status === "queued" || input.job.status === "running")) {
    return input.job.provider;
  }

  if (input.analysisProvider) {
    return input.analysisProvider;
  }

  return getAvailableAnalysisProvider(input.providers, input.lastUsedProvider);
}

export function usePullRequestPageData({
  owner,
  repo,
  number,
  selectedPath
}: {
  owner: string;
  repo: string;
  number: number;
  selectedPath: string | null;
}) {
  const [pullRequest, setPullRequest] = useState<GithubPullRequest | null>(null);
  const [files, setFiles] = useState<GithubPullRequestFileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<GithubPullRequestRestFile | null>(
    null
  );
  const [isPullRequestLoading, setIsPullRequestLoading] = useState(true);
  const [isFilesLoading, setIsFilesLoading] = useState(true);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [pullRequestError, setPullRequestError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [lastUsedAnalysisProvider, setLastUsedAnalysisProvider] =
    useState<AnalyzerProvider | null>(() => getStoredLastAnalysisProvider());
  const analysisController = useAnalysisController({
    owner,
    repo,
    number
  });
  const analysisProviders = useAnalysisControllerSelector(
    analysisController,
    (state) => state.providers
  );
  const analysis = useAnalysisControllerSelector(
    analysisController,
    (state) => state.analysis
  );
  const analysisJob = useAnalysisControllerSelector(analysisController, (state) => state.job);
  const analysisProvider = getCurrentAnalysisProvider({
    providers: analysisProviders,
    analysisProvider: analysis?.provider ?? null,
    lastUsedProvider: lastUsedAnalysisProvider,
    job: analysisJob
  });

  useEffect(() => {
    let isActive = true;

    async function loadPage() {
      try {
        setIsPullRequestLoading(true);
        setIsFilesLoading(true);
        setPullRequestError(null);
        setFilesError(null);

        const [nextPullRequest, nextFiles] = await Promise.all([
          getPullRequest(owner, repo, number),
          getPullRequestFiles(owner, repo, number)
        ]);

        if (isActive) {
          setPullRequest(nextPullRequest);
          setFiles(nextFiles);
        }
      } catch (error) {
        if (isActive) {
          const message =
            error instanceof Error ? error.message : "Failed to load pull request";
          setPullRequestError(message);
          setFilesError(message);
        }
      } finally {
        if (isActive) {
          setIsPullRequestLoading(false);
          setIsFilesLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      isActive = false;
    };
  }, [owner, repo, number]);

  useEffect(() => {
    if (!selectedPath) {
      setSelectedFile(null);
      setDiffError(null);
      setIsDiffLoading(false);
      return;
    }

    let isActive = true;
    const path = selectedPath;

    async function loadDiff() {
      try {
        setIsDiffLoading(true);
        setDiffError(null);

        const nextFile = await getPullRequestFileDiff(owner, repo, number, path);

        if (isActive) {
          setSelectedFile(nextFile);
        }
      } catch (error) {
        if (isActive) {
          setSelectedFile(null);
          setDiffError(
            error instanceof Error ? error.message : "Failed to load file diff"
          );
        }
      } finally {
        if (isActive) {
          setIsDiffLoading(false);
        }
      }
    }

    void loadDiff();

    return () => {
      isActive = false;
    };
  }, [owner, repo, number, selectedPath]);

  useEffect(() => {
    void analysisController.load();
  }, [analysisController]);

  useEffect(() => {
    if (!lastUsedAnalysisProvider) {
      return;
    }

    window.localStorage.setItem(
      LAST_ANALYSIS_PROVIDER_STORAGE_KEY,
      lastUsedAnalysisProvider
    );
  }, [lastUsedAnalysisProvider]);

  async function handleAnalyze(nextProvider: AnalyzerProvider = analysisProvider) {
    setLastUsedAnalysisProvider(nextProvider);
    const targetController = getAnalysisController({
      owner,
      repo,
      number
    });
    await targetController.analyze(nextProvider, { forceRefresh: true });
  }

  return {
    analysisProvider,
    diffError,
    files,
    filesError,
    handleAnalyze,
    isDiffLoading,
    isFilesLoading,
    isPullRequestLoading,
    pullRequest,
    pullRequestError,
    selectedFile
  };
}
