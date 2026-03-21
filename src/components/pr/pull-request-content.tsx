import type { FileDiffMetadata } from "@pierre/diffs/react";
import {
  type GithubPullRequest,
  type GithubPullRequestDiffCommentThread,
  type PullRequestFileDiff,
  type PullRequestHiddenContextDirection
} from "@/lib/github";
import { FileDiffPanel } from "./file-diff-panel";
import { PullRequestDescription } from "./pull-request-description";

export function PullRequestContent({
  pullRequest,
  selectedPath,
  selectedFile,
  reviewThreads,
  isCommentsLoading,
  commentsError,
  isDiffLoading,
  diffError,
  renderedPatch,
  trailingHiddenLines,
  diffScrollPosition,
  onExpandHiddenContext,
  onDiffScrollContainerReady
}: {
  pullRequest: GithubPullRequest;
  selectedPath: string | null;
  selectedFile: PullRequestFileDiff | null;
  reviewThreads: GithubPullRequestDiffCommentThread[];
  isCommentsLoading: boolean;
  commentsError: string | null;
  isDiffLoading: boolean;
  diffError: string | null;
  renderedPatch: FileDiffMetadata | null;
  trailingHiddenLines: number;
  diffScrollPosition: { top: number; left: number } | null;
  onExpandHiddenContext: (input: {
    path: string;
    anchorLine: number;
    direction: PullRequestHiddenContextDirection;
    hunkIndex: number;
    lineCount: number;
  }) => Promise<void>;
  onDiffScrollContainerReady: (element: HTMLDivElement | null) => void;
}) {
  if (selectedPath) {
    return (
      <FileDiffPanel
        selectedPath={selectedPath}
        file={selectedFile?.file ?? null}
        renderedPatch={renderedPatch}
        trailingHiddenLines={trailingHiddenLines}
        reviewThreads={reviewThreads}
        isCommentsLoading={isCommentsLoading}
        commentsError={commentsError}
        isLoading={isDiffLoading}
        error={diffError}
        savedScrollPosition={diffScrollPosition}
        onExpandHiddenContext={onExpandHiddenContext}
        onScrollContainerReady={onDiffScrollContainerReady}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6 md:px-8">
      <PullRequestDescription pullRequest={pullRequest} />
    </div>
  );
}
