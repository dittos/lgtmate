import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSingularPatch } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import {
  applyHiddenContextToFileDiff,
  type RenderedFileDiff
} from "@/components/pr/file-diff-utils";
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
  getPullRequestHiddenContext,
  getPullRequestReviewThreads,
  type GithubPullRequest,
  type GithubPullRequestDiffCommentThread,
  type GithubPullRequestFileNode,
  type PullRequestFileDiff,
  type PullRequestHiddenContextDirection,
  type GithubPullRequestReviewThreadsByPath
} from "@/lib/github";

const LAST_ANALYSIS_PROVIDER_STORAGE_KEY = "lgtmate-last-analysis-provider";
const ANALYZER_PROVIDERS: AnalyzerProvider[] = ["codex", "claude"];
type DiffScrollPosition = {
  top: number;
  left: number;
};

function getLastVisibleLine(fileDiff: FileDiffMetadata) {
  const lastHunk = fileDiff.hunks.at(-1);

  if (!lastHunk) {
    return 0;
  }

  return lastHunk.additionStart + lastHunk.additionCount - 1;
}

function ensureTrailingNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

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
  const [selectedFile, setSelectedFile] = useState<PullRequestFileDiff | null>(
    null
  );
  const [reviewThreadsByPath, setReviewThreadsByPath] =
    useState<GithubPullRequestReviewThreadsByPath>({});
  const [isPullRequestLoading, setIsPullRequestLoading] = useState(true);
  const [isFilesLoading, setIsFilesLoading] = useState(true);
  const [isCommentsLoading, setIsCommentsLoading] = useState(true);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [pullRequestError, setPullRequestError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffScrollPositions, setDiffScrollPositions] = useState<
    Record<string, DiffScrollPosition>
  >({});
  const [renderedPatchesByPath, setRenderedPatchesByPath] = useState<
    Record<string, RenderedFileDiff | null>
  >({});
  const [lastUsedAnalysisProvider, setLastUsedAnalysisProvider] =
    useState<AnalyzerProvider | null>(() => getStoredLastAnalysisProvider());
  const diffScrollContainerRef = useRef<HTMLDivElement | null>(null);
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
  const renderedPatch = selectedPath ? renderedPatchesByPath[selectedPath] ?? null : null;

  useEffect(() => {
    let isActive = true;

    async function loadPage() {
      try {
        setIsPullRequestLoading(true);
        setIsFilesLoading(true);
        setIsCommentsLoading(true);
        setPullRequestError(null);
        setFilesError(null);
        setCommentsError(null);

        const [nextPullRequest, nextFiles, nextReviewThreadsByPath] = await Promise.all([
          getPullRequest(owner, repo, number),
          getPullRequestFiles(owner, repo, number),
          getPullRequestReviewThreads(owner, repo, number).catch((error: unknown) => {
            if (isActive) {
              setCommentsError(
                error instanceof Error
                  ? error.message
                  : "Failed to load pull request comments"
              );
            }

            return {};
          })
        ]);

        if (isActive) {
          setPullRequest(nextPullRequest);
          setFiles(nextFiles);
          setReviewThreadsByPath(nextReviewThreadsByPath);
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
          setIsCommentsLoading(false);
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
        const nextRenderedPatch = nextFile.patch
          ? getSingularPatch(ensureTrailingNewline(nextFile.patch))
          : null;
        let trailingHiddenLines = 0;

        if (pullRequest?.headRefOid && nextRenderedPatch && nextRenderedPatch.hunks.length > 0) {
          try {
            const lastVisibleLine = Math.max(1, getLastVisibleLine(nextRenderedPatch));
            const probe = await getPullRequestHiddenContext(owner, repo, number, {
              commitOid: pullRequest.headRefOid,
              path,
              anchorLine: lastVisibleLine,
              direction: "after",
              lineCount: 1
            });
            trailingHiddenLines = Math.max(
              0,
              probe.totalLines - lastVisibleLine
            );
          } catch {
            trailingHiddenLines = 0;
          }
        }

        if (isActive) {
          setSelectedFile(nextFile);
          setRenderedPatchesByPath((currentPatches) => ({
            ...currentPatches,
            [path]: nextRenderedPatch
              ? {
                  ...nextRenderedPatch,
                  trailingHiddenLines
                }
              : null
          }));
        }
      } catch (error) {
        if (isActive) {
          setSelectedFile(null);
          setRenderedPatchesByPath((currentPatches) => ({
            ...currentPatches,
            [path]: null
          }));
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
  }, [number, owner, pullRequest?.headRefOid, repo, selectedPath]);

  useEffect(() => {
    setDiffScrollPositions({});
    setRenderedPatchesByPath({});
    diffScrollContainerRef.current = null;
  }, [owner, repo, number]);

  useLayoutEffect(() => {
    return () => {
      if (!selectedPath) {
        return;
      }

      const container = diffScrollContainerRef.current;

      if (!container) {
        return;
      }

      const nextPosition = {
        top: container.scrollTop,
        left: container.scrollLeft
      };

      setDiffScrollPositions((currentPositions) => {
        const currentPosition = currentPositions[selectedPath];

        if (
          currentPosition?.top === nextPosition.top &&
          currentPosition?.left === nextPosition.left
        ) {
          return currentPositions;
        }

        return {
          ...currentPositions,
          [selectedPath]: nextPosition
        };
      });
    };
  }, [selectedPath]);

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

  function getSelectedFileReviewThreads(): GithubPullRequestDiffCommentThread[] {
    if (!selectedFile) {
      return [];
    }

    const normalizedThreads = reviewThreadsByPath[selectedFile.file.filename] ?? [];

    if (normalizedThreads.length > 0) {
      return normalizedThreads;
    }

    if (!selectedFile.file.previous_filename) {
      return [];
    }

    return reviewThreadsByPath[selectedFile.file.previous_filename] ?? [];
  }

  function getCommentCountsByPath() {
    const countsByPath: Record<string, number> = {};

    for (const [path, threads] of Object.entries(reviewThreadsByPath)) {
      countsByPath[path] = threads.reduce(
        (count, thread) =>
          thread.isOutdated ? count : count + thread.comments.length,
        0
      );
    }

    return countsByPath;
  }

  const handleDiffScrollContainerReady = useCallback(
    (element: HTMLDivElement | null) => {
      diffScrollContainerRef.current = element;
    },
    []
  );

  const handleExpandHiddenContext = useCallback(
    async (input: {
      path: string;
      anchorLine: number;
      direction: PullRequestHiddenContextDirection;
      hunkIndex: number;
      lineCount: number;
    }) => {
      const targetFile =
        selectedFile?.file.filename === input.path ? selectedFile.file : null;
      const currentPatch = renderedPatchesByPath[input.path];

      if (!pullRequest || !targetFile) {
        return;
      }

      try {
        const isTrailingExpansion =
          input.direction === "after" &&
          input.hunkIndex === (currentPatch?.hunks.length ?? -1);
        const data = await getPullRequestHiddenContext(owner, repo, number, {
          commitOid: pullRequest.headRefOid,
          path: input.path,
          anchorLine: input.anchorLine,
          direction: input.direction,
          lineCount: input.lineCount
        });
        if (isTrailingExpansion) {
          setRenderedPatchesByPath((currentPatches) => {
            const currentPatch = currentPatches[input.path];

            if (!currentPatch) {
              return currentPatches;
            }

            return {
              ...currentPatches,
              [input.path]: {
                ...applyHiddenContextToFileDiff(currentPatch, {
                  hunkIndex: input.hunkIndex,
                  direction: input.direction,
                  lines: data.lines
                }),
                trailingHiddenLines: data.remainingBelow
              }
            };
          });
          return;
        }

        setRenderedPatchesByPath((currentPatches) => {
          const currentPatch = currentPatches[input.path];

          if (!currentPatch) {
            return currentPatches;
          }

          return {
            ...currentPatches,
            [input.path]: applyHiddenContextToFileDiff(currentPatch, {
              hunkIndex: input.hunkIndex,
              direction: input.direction,
              lines: data.lines
            })
          };
        });
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to load hidden context"
        );
      }
    },
    [number, owner, pullRequest, renderedPatchesByPath, repo, selectedFile]
  );

  return {
    analysisProvider,
    commentCountsByPath: getCommentCountsByPath(),
    commentsError,
    diffError,
    diffScrollPosition: selectedPath ? diffScrollPositions[selectedPath] ?? null : null,
    files,
    filesError,
    handleAnalyze,
    handleDiffScrollContainerReady,
    handleExpandHiddenContext,
    isCommentsLoading,
    isDiffLoading,
    isFilesLoading,
    isPullRequestLoading,
    pullRequest,
    pullRequestError,
    renderedPatch,
    reviewThreads: getSelectedFileReviewThreads(),
    selectedFile
  };
}
