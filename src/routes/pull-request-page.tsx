import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { FileDiffPanel } from "@/components/pr/file-diff-panel";
import { FileTree } from "@/components/pr/file-tree";
import { PullRequestDescription } from "@/components/pr/pull-request-description";
import { PullRequestHeader } from "@/components/pr/pull-request-header";
import { type AnalyzerProvider } from "@/lib/analyzer";
import {
  getAnalysisController,
  useAnalysisController,
  useAnalysisControllerSelector
} from "@/lib/analysis-controller";
import {
  buildPullRequestFilePatch,
  getPullRequest,
  getPullRequestFileDiff,
  getPullRequestFiles,
  type GithubPullRequest,
  type GithubPullRequestFileNode,
  type GithubPullRequestRestFile
} from "@/lib/github";

const FILE_TREE_WIDTH_STORAGE_KEY = "lgtmate-file-tree-width";
const LAST_ANALYSIS_PROVIDER_STORAGE_KEY = "lgtmate-last-analysis-provider";
const DEFAULT_FILE_TREE_WIDTH = 352;
const MIN_FILE_TREE_WIDTH = 240;
const MIN_CONTENT_WIDTH = 480;
const RESIZE_HANDLE_WIDTH = 12;
const ANALYZER_PROVIDERS: AnalyzerProvider[] = ["codex", "claude"];

function clampFileTreeWidth(width: number, containerWidth: number) {
  const maxWidth = Math.max(
    MIN_FILE_TREE_WIDTH,
    containerWidth - MIN_CONTENT_WIDTH - RESIZE_HANDLE_WIDTH
  );

  return Math.min(Math.max(width, MIN_FILE_TREE_WIDTH), maxWidth);
}

function getStoredFileTreeWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_FILE_TREE_WIDTH;
  }

  const storedWidth = Number(window.localStorage.getItem(FILE_TREE_WIDTH_STORAGE_KEY));

  return Number.isFinite(storedWidth) && storedWidth >= MIN_FILE_TREE_WIDTH
    ? storedWidth
    : DEFAULT_FILE_TREE_WIDTH;
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

export function PullRequestPage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const number = Number(params.number ?? "");
  const selectedPath = searchParams.get("path");

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
  const [fileTreeWidth, setFileTreeWidth] = useState(() => getStoredFileTreeWidth());
  const [lastUsedAnalysisProvider, setLastUsedAnalysisProvider] =
    useState<AnalyzerProvider | null>(() => getStoredLastAnalysisProvider());
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
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
    window.localStorage.setItem(
      FILE_TREE_WIDTH_STORAGE_KEY,
      String(fileTreeWidth)
    );
  }, [fileTreeWidth]);

  useEffect(() => {
    if (!lastUsedAnalysisProvider) {
      return;
    }

    window.localStorage.setItem(
      LAST_ANALYSIS_PROVIDER_STORAGE_KEY,
      lastUsedAnalysisProvider
    );
  }, [lastUsedAnalysisProvider]);

  useEffect(() => {
    const container = splitContainerRef.current;

    if (!container) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = clampFileTreeWidth(
        fileTreeWidth,
        container.getBoundingClientRect().width
      );

      setFileTreeWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth
      );
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [fileTreeWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  function handleSelectFile(path: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("path", path);
    void setSearchParams(nextParams);
  }

  function handleSelectDescription() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("path");
    void setSearchParams(nextParams);
  }

  async function handleAnalyze(nextProvider: AnalyzerProvider = analysisProvider) {
    setLastUsedAnalysisProvider(nextProvider);
    const targetController = getAnalysisController({
      owner,
      repo,
      number
    });
    await targetController.analyze(nextProvider, { forceRefresh: true });
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    const container = splitContainerRef.current;

    if (!container) {
      return;
    }

    const startX = event.clientX;
    const startWidth = fileTreeWidth;

    setIsResizing(true);

    const handlePointerMove = (pointerEvent: globalThis.PointerEvent) => {
      const containerWidth = container.getBoundingClientRect().width;
      const nextWidth = clampFileTreeWidth(
        startWidth + pointerEvent.clientX - startX,
        containerWidth
      );

      setFileTreeWidth(nextWidth);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const container = splitContainerRef.current;

    if (!container) {
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const nextWidth = clampFileTreeWidth(
      fileTreeWidth + direction * 24,
      container.getBoundingClientRect().width
    );

    setFileTreeWidth(nextWidth);
  }

  if (Number.isNaN(number) || !owner || !repo) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-destructive">
        Invalid pull request URL.
      </main>
    );
  }

  if (isPullRequestLoading && !pullRequest) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading pull request...
      </main>
    );
  }

  if (pullRequestError || !pullRequest) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-destructive">
        {pullRequestError ?? "Failed to load pull request"}
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <section className="flex h-full flex-col border border-border/70 bg-card/75 shadow-sm backdrop-blur-md">
        <PullRequestHeader
          pullRequest={pullRequest}
          owner={owner}
          repo={repo}
          number={number}
          provider={analysisProvider}
          onAnalyze={(nextProvider) => {
            void handleAnalyze(nextProvider);
          }}
        />
        <div ref={splitContainerRef} className="flex min-h-0 flex-1">
          <aside
            className="min-h-0 shrink-0 overflow-hidden border-r border-border/70 bg-muted/25"
            style={{ width: `${fileTreeWidth}px` }}
          >
            {isFilesLoading ? (
              <div className="px-5 py-5 text-sm text-muted-foreground">Loading files...</div>
            ) : filesError ? (
              <div className="px-5 py-5 text-sm text-destructive">{filesError}</div>
            ) : (
              <FileTree
                owner={owner}
                repo={repo}
                number={number}
                files={files}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                onSelectDescription={handleSelectDescription}
                provider={analysisProvider}
                pullRequestHeadOid={pullRequest.headRefOid}
                onAnalyze={(nextProvider) => {
                  void handleAnalyze(nextProvider);
                }}
              />
            )}
          </aside>
          <div
            role="separator"
            aria-label="Resize file list"
            aria-orientation="vertical"
            aria-valuemin={MIN_FILE_TREE_WIDTH}
            aria-valuemax={Math.max(
              MIN_FILE_TREE_WIDTH,
              (splitContainerRef.current?.getBoundingClientRect().width ?? 0) -
                MIN_CONTENT_WIDTH -
                RESIZE_HANDLE_WIDTH
            )}
            aria-valuenow={Math.round(fileTreeWidth)}
            tabIndex={0}
            className="group relative shrink-0 cursor-col-resize touch-none outline-none"
            style={{ width: `${RESIZE_HANDLE_WIDTH}px` }}
            onPointerDown={handleResizeStart}
            onKeyDown={handleResizeKeyDown}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80 group-hover:bg-foreground/40 group-focus-visible:bg-foreground/40" />
          </div>
          <section className="min-h-0 min-w-0 flex-1 overflow-auto">
            {selectedPath ? (
              <FileDiffPanel
                file={selectedFile}
                patch={selectedFile ? buildPullRequestFilePatch(selectedFile) : null}
                isLoading={isDiffLoading}
                error={diffError}
              />
            ) : (
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6 md:px-8">
                <PullRequestDescription pullRequest={pullRequest} />
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
