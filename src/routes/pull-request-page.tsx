import { useParams, useSearchParams } from "react-router-dom";
import { PullRequestContent } from "@/components/pr/pull-request-content";
import { PullRequestFileSidebar } from "@/components/pr/pull-request-file-sidebar";
import { PullRequestHeader } from "@/components/pr/pull-request-header";
import { PullRequestSplitLayout } from "@/components/pr/pull-request-split-layout";
import { usePullRequestPageData } from "./use-pull-request-page-data";

export function PullRequestPage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const number = Number(params.number ?? "");
  const selectedPath = searchParams.get("path");
  const {
    analysisProvider,
    commentCountsByPath,
    commentsError,
    diffError,
    diffScrollPosition,
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
    reviewThreads,
    selectedFile,
    trailingHiddenLines
  } = usePullRequestPageData({
    owner,
    repo,
    number,
    selectedPath
  });

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

  const isValidPullRequestRoute = !Number.isNaN(number) && Boolean(owner) && Boolean(repo);
  const repositoryName = isValidPullRequestRoute ? `${owner}/${repo}` : null;
  const pageTitle = !isValidPullRequestRoute
    ? "Invalid Pull Request · LGTMate"
    : pullRequest
      ? `${pullRequest.title} · Pull Request #${number} · ${repositoryName} · LGTMate`
      : `Pull Request #${number} · ${repositoryName} · LGTMate`;

  if (Number.isNaN(number) || !owner || !repo) {
    return (
      <>
        <title>{pageTitle}</title>
        <main className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-destructive">
          Invalid pull request URL.
        </main>
      </>
    );
  }

  if (isPullRequestLoading && !pullRequest) {
    return (
      <>
        <title>{pageTitle}</title>
        <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading pull request...
        </main>
      </>
    );
  }

  if (pullRequestError || !pullRequest) {
    return (
      <>
        <title>{pageTitle}</title>
        <main className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-destructive">
          {pullRequestError ?? "Failed to load pull request"}
        </main>
      </>
    );
  }

  return (
    <>
      <title>{pageTitle}</title>
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
          <PullRequestSplitLayout
            sidebar={
              <PullRequestFileSidebar
                files={files}
                isLoading={isFilesLoading}
                error={filesError}
                commentCountsByPath={commentCountsByPath}
                owner={owner}
                repo={repo}
                number={number}
                selectedPath={selectedPath}
                provider={analysisProvider}
                pullRequestHeadOid={pullRequest.headRefOid}
                onSelect={handleSelectFile}
                onSelectDescription={handleSelectDescription}
                onAnalyze={(nextProvider) => {
                  void handleAnalyze(nextProvider);
                }}
              />
            }
            content={
              <PullRequestContent
                pullRequest={pullRequest}
                selectedPath={selectedPath}
                selectedFile={selectedFile}
                reviewThreads={reviewThreads}
                isCommentsLoading={isCommentsLoading}
                commentsError={commentsError}
                isDiffLoading={isDiffLoading}
                diffError={diffError}
                renderedPatch={renderedPatch}
                trailingHiddenLines={trailingHiddenLines}
                diffScrollPosition={diffScrollPosition}
                onExpandHiddenContext={handleExpandHiddenContext}
                onDiffScrollContainerReady={handleDiffScrollContainerReady}
              />
            }
          />
        </section>
      </main>
    </>
  );
}
