import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  DIFFS_TAG_NAME,
  FileDiff as DiffsFileDiff,
  getLineAnnotationName,
} from "@pierre/diffs";
import { Columns2, ExternalLink, Rows3 } from "lucide-react";
import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs/react";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  getHiddenContextSeparatorSlots,
  type HiddenContextExpandAction,
  type HiddenContextSeparatorSlot,
} from "@/components/pr/file-diff-utils";
import {
  formatChangeType,
  type GithubPullRequestDiffCommentThread,
  type GithubPullRequestRestFile,
  type PullRequestHiddenContextDirection
} from "@/lib/github";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DIFF_STYLE_STORAGE_KEY = "lgtmate-diff-style";
const HIDDEN_CONTEXT_SEPARATOR_HEIGHT_CLASS = "h-16";
const HIDDEN_CONTEXT_PAGE_SIZE = 20;

let diffsContainerRegistered = false;

function ensureDiffsContainerElement() {
  if (
    diffsContainerRegistered ||
    typeof window === "undefined" ||
    typeof customElements === "undefined" ||
    customElements.get(DIFFS_TAG_NAME)
  ) {
    diffsContainerRegistered = true;
    return;
  }

  class DiffsContainerElement extends HTMLElement {
    constructor() {
      super();

      if (this.shadowRoot) {
        return;
      }

      this.attachShadow({ mode: "open" });
    }
  }

  customElements.define(DIFFS_TAG_NAME, DiffsContainerElement);
  diffsContainerRegistered = true;
}

type DiffCommentAnnotation = {
  thread: GithubPullRequestDiffCommentThread;
};

type DiffStyle = "unified" | "split";

type ExpandHiddenContextInput = {
  path: string;
  direction: PullRequestHiddenContextDirection;
  hunkIndex: number;
  anchorLine: number;
  lineCount: number;
};

type FileDiffPanelProps = {
  selectedPath: string | null;
  file: GithubPullRequestRestFile | null;
  renderedPatch: FileDiffMetadata | null;
  trailingHiddenLines: number;
  reviewThreads: GithubPullRequestDiffCommentThread[];
  isCommentsLoading: boolean;
  commentsError: string | null;
  isLoading: boolean;
  error: string | null;
  savedScrollPosition: { top: number; left: number } | null;
  onExpandHiddenContext: (input: ExpandHiddenContextInput) => Promise<void>;
  onScrollContainerReady: (element: HTMLDivElement | null) => void;
};

type RenderedPatchDiffProps = {
  filePath: string;
  renderedPatch: FileDiffMetadata;
  trailingHiddenLines: number;
  diffStyle: DiffStyle;
  theme: "light" | "dark";
  lineAnnotations: DiffLineAnnotation<DiffCommentAnnotation>[];
  isCommentsLoading: boolean;
  onExpandHiddenContext: (input: ExpandHiddenContextInput) => Promise<void>;
  onRender: () => void;
};

function getDiffRendererOptions(diffStyle: DiffStyle, theme: "light" | "dark") {
  return {
    diffStyle,
    overflow: "wrap" as const,
    disableFileHeader: true,
    themeType: theme,
    hunkSeparators: () => null
  };
}

function getStoredDiffStyle(): DiffStyle {
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
  renderedPatch,
  trailingHiddenLines,
  reviewThreads,
  isCommentsLoading,
  commentsError,
  isLoading,
  error,
  savedScrollPosition,
  onExpandHiddenContext,
  onScrollContainerReady
}: FileDiffPanelProps) {
  const { theme } = useTheme();
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(() => getStoredDiffStyle());
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
    ensureDiffsContainerElement();
  }, []);

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
      !renderedPatch ||
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
  }, [selectedPath, isLoading, error, file, renderedPatch, savedScrollPosition, renderVersion]);

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

  if (!renderedPatch) {
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
        <RenderedPatchDiff
          filePath={file.filename}
          renderedPatch={renderedPatch}
          trailingHiddenLines={trailingHiddenLines}
          diffStyle={diffStyle}
          theme={theme}
          lineAnnotations={lineAnnotations}
          isCommentsLoading={isCommentsLoading}
          onExpandHiddenContext={onExpandHiddenContext}
          onRender={handlePatchRender}
        />
      </div>
    </div>
  );
}

function RenderedPatchDiff({
  filePath,
  renderedPatch,
  trailingHiddenLines,
  diffStyle,
  theme,
  lineAnnotations,
  isCommentsLoading,
  onExpandHiddenContext,
  onRender
}: RenderedPatchDiffProps) {
  const hiddenContextSlots = useMemo(
    () => getHiddenContextSeparatorSlots(renderedPatch, diffStyle),
    [diffStyle, renderedPatch]
  );
  const trailingHiddenContext = useMemo(() => {
    if (trailingHiddenLines < 1) {
      return null;
    }

    const lastHunk = renderedPatch.hunks.at(-1);

    if (!lastHunk) {
      return null;
    }

    return {
      hunkIndex: renderedPatch.hunks.length,
      lines: trailingHiddenLines,
      type: "unified" as const,
      expandActions: [
        {
          anchorLine: lastHunk.additionStart + lastHunk.additionCount,
          direction: "after"
        } satisfies HiddenContextExpandAction
      ]
    };
  }, [renderedPatch, trailingHiddenLines]);
  const instanceRef = useRef<DiffsFileDiff<DiffCommentAnnotation> | null>(null);
  const hostElementRef = useRef<HTMLElement | null>(null);
  const diffRendererOptions = useMemo(
    () => getDiffRendererOptions(diffStyle, theme),
    [diffStyle, theme]
  );

  useLayoutEffect(() => {
    const hostElement = hostElementRef.current;

    if (!hostElement) {
      return;
    }

    let instance = instanceRef.current;

    if (!instance) {
      instance = new DiffsFileDiff<DiffCommentAnnotation>(
        diffRendererOptions,
        undefined,
        true
      );
      instanceRef.current = instance;
    } else {
      instance.setOptions({
        ...instance.options,
        ...diffRendererOptions
      });
    }

    instance.render({
      fileContainer: hostElement,
      fileDiff: renderedPatch,
      forceRender: false,
      lineAnnotations
    });
    onRender();
  }, [
    diffRendererOptions,
    lineAnnotations,
    onRender,
    renderedPatch,
  ]);

  useEffect(() => {
    return () => {
      instanceRef.current?.cleanUp();
      instanceRef.current = null;
    };
  }, []);

  return (
    <>
      {createElement(
        DIFFS_TAG_NAME,
        {
          ref: hostElementRef,
          className: "min-w-full",
          "data-diff-host": ""
        },
        <>
          {lineAnnotations.map((annotation, index) => {
            const metadata = annotation.metadata as DiffCommentAnnotation | undefined;

            if (!metadata) {
              return null;
            }

            const slotName = getLineAnnotationName(annotation);

            return (
              <div key={`${slotName}-${index}`} slot={slotName}>
                <ReviewThreadAnnotation
                  thread={metadata.thread}
                  isCommentsLoading={isCommentsLoading}
                />
              </div>
            );
          })}
          {hiddenContextSlots.map((slot) => (
            <div
              key={slot.slotName}
              slot={slot.slotName}
              className={cn(
                "relative block min-w-0 overflow-visible",
                HIDDEN_CONTEXT_SEPARATOR_HEIGHT_CLASS
              )}
            >
              <div className="absolute inset-x-0 top-0 flex justify-start">
                <HiddenContextSeparator
                  hunk={slot}
                  onExpand={(action) =>
                    onExpandHiddenContext({
                      path: filePath,
                      ...action
                    })
                  }
                />
              </div>
            </div>
          ))}
        </>
      )}
      {trailingHiddenContext ? (
        <div className="min-w-full px-3 pb-3">
          <HiddenContextSeparator
            hunk={trailingHiddenContext}
            onExpand={(action) =>
              onExpandHiddenContext({
                path: filePath,
                ...action
              })
            }
          />
        </div>
      ) : null}
    </>
  );
}

function HiddenContextSeparator({
  hunk,
  onExpand
}: {
  hunk: Pick<HiddenContextSeparatorSlot, "hunkIndex" | "lines" | "type" | "expandActions">;
  onExpand: (action: {
    hunkIndex: number;
    direction: PullRequestHiddenContextDirection;
    anchorLine: number;
    lineCount: number;
  }) => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionButtons = useMemo(() => {
    if (hunk.expandActions.length === 1) {
      const [action] = hunk.expandActions;

      if (!action) {
        return [];
      }

      return [
        {
          ...action,
          label: action.direction === "before" ? "Expand Up" : "Expand Down",
          lineCount: Math.min(hunk.lines, HIDDEN_CONTEXT_PAGE_SIZE)
        }
      ];
    }

    if (hunk.lines <= HIDDEN_CONTEXT_PAGE_SIZE) {
      const downAction = hunk.expandActions.find((action) => action.direction === "before");

      if (!downAction) {
        return [];
      }

      return [
        {
          ...downAction,
          label: "Expand Both",
          lineCount: hunk.lines
        }
      ];
    }

    return hunk.expandActions.map((action) => ({
      ...action,
      label: action.direction === "after" ? "Expand Up" : "Expand Down",
      lineCount: HIDDEN_CONTEXT_PAGE_SIZE
    }));
  }, [hunk]);

  if (hunk.type === "additions") {
    return <div className="h-full w-0 min-w-0" aria-hidden="true" />;
  }

  return (
    <div className="my-2 ml-3 mr-0 inline-block max-w-[calc(100%-0.75rem)] rounded-xl border border-dashed border-border/70 bg-muted/35 px-3 py-2 font-sans align-top">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{hunk.lines} hidden lines</span>
        {actionButtons.map((action) => (
          <button
            key={`${action.direction}-${action.label}`}
            type="button"
            className="inline-flex items-center rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={() => {
              setIsLoading(true);
              setError(null);
              void onExpand({
                hunkIndex: hunk.hunkIndex,
                direction: action.direction,
                anchorLine: action.anchorLine,
                lineCount: action.lineCount
              })
                .catch((nextError: unknown) => {
                  setError(
                    nextError instanceof Error
                      ? nextError.message
                      : "Failed to load hidden context"
                  );
                })
                .finally(() => {
                  setIsLoading(false);
                });
            }}
          >
            {isLoading ? "Loading..." : action.label}
          </button>
        ))}
      </div>
      {error ? (
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </div>
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
