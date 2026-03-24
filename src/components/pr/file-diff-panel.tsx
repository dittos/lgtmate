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
import { ArrowDownFromLine, ArrowUpFromLine, Columns2, ExternalLink, Rows3, SeparatorHorizontal } from "lucide-react";
import type { DiffLineAnnotation } from "@pierre/diffs/react";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  getHiddenContextSeparatorSlots,
  type HiddenContextSeparatorSlot,
  type RenderedFileDiff,
} from "@/components/pr/file-diff-utils";
import {
  formatChangeType,
  type GithubPullRequestDiffCommentThread,
  type GithubPullRequestRestFile,
  type PullRequestHiddenContextDirection
} from "@/lib/github";
import type {
  GetDiffScrollPosition,
  SetDiffScrollPosition
} from "@/lib/use-diff-scroll-cache";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DIFF_STYLE_STORAGE_KEY = "lgtmate-diff-style";
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
  selectedPath: string;
  file: GithubPullRequestRestFile | null;
  renderedPatch: RenderedFileDiff | null;
  reviewThreads: GithubPullRequestDiffCommentThread[];
  isCommentsLoading: boolean;
  commentsError: string | null;
  isLoading: boolean;
  error: string | null;
  getSavedScrollPosition: GetDiffScrollPosition;
  onSaveScrollPosition: SetDiffScrollPosition;
  onExpandHiddenContext: (input: ExpandHiddenContextInput) => Promise<void>;
};

type RenderedPatchDiffProps = {
  renderIdentity: string;
  filePath: string;
  renderedPatch: RenderedFileDiff;
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
  reviewThreads,
  isCommentsLoading,
  commentsError,
  isLoading,
  error,
  getSavedScrollPosition,
  onSaveScrollPosition,
  onExpandHiddenContext,
}: FileDiffPanelProps) {
  const { theme } = useTheme();
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(() => getStoredDiffStyle());
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
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

  const saveScrollPosition = useCallback(() => {
    const container = diffContainerRef.current;

    if (!container) {
      return;
    }

    onSaveScrollPosition(selectedPath, {
      top: container.scrollTop,
      left: container.scrollLeft
    });
  }, [onSaveScrollPosition, selectedPath]);

  const handlePatchRender = useCallback(() => {
    if (isLoading || error || !file || !renderedPatch) {
      return;
    }

    const container = diffContainerRef.current;

    if (!container) {
      return;
    }

    const savedScrollPosition = getSavedScrollPosition(selectedPath);

    container.scrollTop = savedScrollPosition?.top ?? 0;
    container.scrollLeft = savedScrollPosition?.left ?? 0;
  }, [selectedPath, getSavedScrollPosition, isLoading, error, file, renderedPatch]);

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
        ref={diffContainerRef}
        className="diff-frame min-h-0 flex-1 overflow-auto rounded-2xl border border-border/70 bg-background/80 shadow-sm"
        onScroll={saveScrollPosition}
      >
        <RenderedPatchDiff
          renderIdentity={selectedPath}
          filePath={file.filename}
          renderedPatch={renderedPatch}
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
  renderIdentity,
  filePath,
  renderedPatch,
  diffStyle,
  theme,
  lineAnnotations,
  isCommentsLoading,
  onExpandHiddenContext,
  onRender
}: RenderedPatchDiffProps) {
  const { slots: hiddenContextSlots, trailingHiddenContext } = useMemo(
    () => getHiddenContextSeparatorSlots(renderedPatch, diffStyle),
    [diffStyle, renderedPatch]
  );
  const instanceRef = useRef<DiffsFileDiff<DiffCommentAnnotation> | null>(null);
  const hostElementRef = useRef<HTMLElement | null>(null);
  const lastRenderedIdentityRef = useRef<string | null>(null);
  const renderFrameIdRef = useRef<number | null>(null);
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

    if (lastRenderedIdentityRef.current !== renderIdentity) {
      lastRenderedIdentityRef.current = renderIdentity;

      if (renderFrameIdRef.current !== null) {
        window.cancelAnimationFrame(renderFrameIdRef.current);
      }

      renderFrameIdRef.current = window.requestAnimationFrame(() => {
        renderFrameIdRef.current = null;
        onRender();
      });
    }
  }, [
    diffRendererOptions,
    lineAnnotations,
    onRender,
    renderIdentity,
    renderedPatch,
  ]);

  useEffect(() => {
    return () => {
      if (renderFrameIdRef.current !== null) {
        window.cancelAnimationFrame(renderFrameIdRef.current);
      }

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
          {hiddenContextSlots.filter((slot) => slot.type !== "additions").map((slot) => (
            <div
              key={slot.slotName}
              slot={slot.slotName}
            >
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
          ))}
        </>
      )}
      {trailingHiddenContext ? (
        <HiddenContextSeparator
          hunk={trailingHiddenContext}
          isLast={true}
          onExpand={(action) =>
            onExpandHiddenContext({
              path: filePath,
              ...action
            })
          }
        />
      ) : null}
    </>
  );
}

function HiddenContextSeparator({
  hunk,
  isLast = false,
  onExpand
}: {
  hunk: Pick<HiddenContextSeparatorSlot, "hunkIndex" | "lines" | "type" | "expandActions">;
  isLast?: boolean;
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
    const iconProps = {className: "size-3.5"};

    if (hunk.expandActions.length === 1) {
      const [action] = hunk.expandActions;

      if (!action) {
        return [];
      }

      return [
        {
          ...action,
          label: action.direction === "before" ? <ArrowUpFromLine {...iconProps} /> : <ArrowDownFromLine {...iconProps} />,
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
          label: <SeparatorHorizontal {...iconProps} />,
          lineCount: hunk.lines
        }
      ];
    }

    return hunk.expandActions.map((action) => ({
      ...action,
      label: action.direction === "after" ? <ArrowDownFromLine {...iconProps} /> : <ArrowUpFromLine {...iconProps} />,
      lineCount: HIDDEN_CONTEXT_PAGE_SIZE
    }));
  }, [hunk]);

  return (
    <div className={cn("flex", isLast ? "pb-2" : "py-1")}>
      <div className="w-11 flex flex-col">
        {actionButtons.map((action) => (
          <button
            key={`${action.direction}-${action.label}`}
            type="button"
            className="w-full inline-flex justify-end items-center pe-2 h-5 rounded-sm cursor-pointer text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"              disabled={isLoading}
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
            {action.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <div className="h-full pl-2 flex items-center absolute">
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {isLoading ? "Loading..." : <span>{hunk.lines} hidden lines</span>}
          </div>
          {error ? (
            <div className="pl-2 text-xs font-bold text-destructive whitespace-nowrap">
              {error}
            </div>
          ) : null}
        </div>
      </div>
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
