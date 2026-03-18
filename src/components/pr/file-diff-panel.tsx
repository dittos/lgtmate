import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Columns2, ExternalLink, Rows3 } from "lucide-react";
import type { DiffLineAnnotation } from "@pierre/diffs/react";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  formatChangeType,
  type GithubPullRequestDiffCommentThread,
  type GithubPullRequestRestFile
} from "@/lib/github";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const PatchDiff = lazy(async () => {
  const module = await import("@pierre/diffs/react");
  return { default: module.PatchDiff };
});

const DIFF_STYLE_STORAGE_KEY = "lgtmate-diff-style";

type DiffCommentAnnotation = {
  thread: GithubPullRequestDiffCommentThread;
};

function getStoredDiffStyle(): "unified" | "split" {
  if (typeof window === "undefined") {
    return "split";
  }

  return window.localStorage.getItem(DIFF_STYLE_STORAGE_KEY) === "unified"
    ? "unified"
    : "split";
}

export function FileDiffPanel({
  selectedPath,
  file,
  patch,
  reviewThreads,
  isCommentsLoading,
  commentsError,
  isLoading,
  error,
  savedScrollPosition,
  onScrollContainerReady
}: {
  selectedPath: string | null;
  file: GithubPullRequestRestFile | null;
  patch: string | null;
  reviewThreads: GithubPullRequestDiffCommentThread[];
  isCommentsLoading: boolean;
  commentsError: string | null;
  isLoading: boolean;
  error: string | null;
  savedScrollPosition: { top: number; left: number } | null;
  onScrollContainerReady: (element: HTMLDivElement | null) => void;
}) {
  const { theme } = useTheme();
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">(() =>
    getStoredDiffStyle()
  );
  const [renderVersion, setRenderVersion] = useState(0);
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
  const handlePatchRender = useCallback(() => {
    setRenderVersion((currentVersion) => currentVersion + 1);
  }, []);
  const lineAnnotations = useMemo<DiffLineAnnotation<DiffCommentAnnotation>[]>(
    () =>
      reviewThreads.map((thread) => ({
        side: thread.side,
        lineNumber: thread.lineNumber,
        metadata: {
          thread
        }
      })),
    [reviewThreads]
  );

  useEffect(() => {
    window.localStorage.setItem(DIFF_STYLE_STORAGE_KEY, diffStyle);
  }, [diffStyle]);

  const handleDiffContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      diffContainerRef.current = element;
      onScrollContainerReady(element);
    },
    [onScrollContainerReady]
  );

  useLayoutEffect(() => {
    if (
      !selectedPath ||
      isLoading ||
      error ||
      !file ||
      !patch ||
      !diffContainerRef.current
    ) {
      return;
    }

    let frameId = window.requestAnimationFrame(() => {
      const container = diffContainerRef.current;

      if (!container) {
        return;
      }

      container.scrollTop = savedScrollPosition?.top ?? 0;
      container.scrollLeft = savedScrollPosition?.left ?? 0;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [selectedPath, isLoading, error, file, patch, savedScrollPosition, renderVersion]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading file diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a changed file.
      </div>
    );
  }

  if (!patch) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-6 md:px-8">
        <h2 className="mb-2 text-lg font-semibold">
          <TruncatedText text={file.filename} className="block" />
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          GitHub did not provide a textual patch for this file.
        </p>
        {commentsError ? (
          <p className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            Comments could not be loaded: {commentsError}
          </p>
        ) : null}
        {file.blob_url ? (
          <a
            href={file.blob_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            View blob on GitHub
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">
            <TruncatedText text={file.filename} className="block" />
          </h2>
          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {formatChangeType(file.status)}
            {file.previous_filename ? ` from ${file.previous_filename}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-border/70 bg-muted/50 p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={diffStyle === "unified"}
              className={cn(
                "h-7 rounded-lg px-2 text-xs",
                diffStyle === "unified"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setDiffStyle("unified")}
            >
              <Rows3 className="size-3.5" />
              Unified
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={diffStyle === "split"}
              className={cn(
                "h-7 rounded-lg px-2 text-xs",
                diffStyle === "split"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setDiffStyle("split")}
            >
              <Columns2 className="size-3.5" />
              Side by side
            </Button>
          </div>
          {file.blob_url ? (
            <a
              href={file.blob_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              GitHub
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      {commentsError ? (
        <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Comments could not be loaded. Diff rendering is still available.
        </div>
      ) : null}
      <div
        ref={handleDiffContainerRef}
        className="diff-frame min-h-0 flex-1 overflow-auto rounded-2xl border border-border/70 bg-background/80 shadow-sm"
      >
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Preparing diff viewer...
            </div>
          }
        >
          <RenderedPatchDiff
            patch={patch}
            diffStyle={diffStyle}
            theme={theme}
            lineAnnotations={lineAnnotations}
            isCommentsLoading={isCommentsLoading}
            onRender={handlePatchRender}
          />
        </Suspense>
      </div>
    </div>
  );
}

function RenderedPatchDiff({
  patch,
  diffStyle,
  theme,
  lineAnnotations,
  isCommentsLoading,
  onRender
}: {
  patch: string;
  diffStyle: "unified" | "split";
  theme: "light" | "dark";
  lineAnnotations: DiffLineAnnotation<DiffCommentAnnotation>[];
  isCommentsLoading: boolean;
  onRender: () => void;
}) {
  useLayoutEffect(() => {
    onRender();
  }, [patch, diffStyle, theme, lineAnnotations, isCommentsLoading, onRender]);

  return (
    <PatchDiff
      patch={patch}
      options={{
        diffStyle,
        overflow: "wrap",
        disableFileHeader: true,
        themeType: theme
      }}
      lineAnnotations={lineAnnotations}
      renderAnnotation={(annotation) => {
        const metadata = annotation.metadata as DiffCommentAnnotation | undefined;

        if (!metadata) {
          return null;
        }

        return (
          <ReviewThreadAnnotation
            thread={metadata.thread}
            isCommentsLoading={isCommentsLoading}
          />
        );
      }}
      className="min-w-full"
    />
  );
}

function ReviewThreadAnnotation({
  thread,
  isCommentsLoading
}: {
  thread: GithubPullRequestDiffCommentThread;
  isCommentsLoading: boolean;
}) {
  return (
    <div className="mx-3 my-2 whitespace-normal rounded-2xl border border-border/70 bg-muted/60 p-3 font-sans shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
        <span>{thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}</span>
        {thread.isResolved ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-700 dark:text-emerald-300">
            Resolved
          </span>
        ) : null}
        {thread.isOutdated ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
            Outdated
          </span>
        ) : null}
        {isCommentsLoading ? <span>Loading comments...</span> : null}
      </div>
      <div className="space-y-3">
        {thread.comments.map((comment) => (
          <article key={comment.id} className="rounded-xl bg-background/85 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold">
                {comment.author?.login ?? "ghost"}
              </span>
              <time className="text-xs text-muted-foreground">
                {formatCommentTimestamp(comment.createdAt)}
              </time>
              <a
                href={comment.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                GitHub
                <ExternalLink className="size-3" />
              </a>
            </div>
            <div
              className="markdown-body comment-body max-w-none text-foreground"
              dangerouslySetInnerHTML={{ __html: comment.bodyHTML }}
            />
          </article>
        ))}
      </div>
    </div>
  );
}

function formatCommentTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
