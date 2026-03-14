import { Suspense, lazy, useEffect, useState } from "react";
import { Columns2, ExternalLink, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatChangeType, type GithubPullRequestRestFile } from "@/lib/github";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const PatchDiff = lazy(async () => {
  const module = await import("@pierre/diffs/react");
  return { default: module.PatchDiff };
});

const DIFF_STYLE_STORAGE_KEY = "lgtmate-diff-style";

function getStoredDiffStyle(): "unified" | "split" {
  if (typeof window === "undefined") {
    return "split";
  }

  return window.localStorage.getItem(DIFF_STYLE_STORAGE_KEY) === "unified"
    ? "unified"
    : "split";
}

export function FileDiffPanel({
  file,
  patch,
  isLoading,
  error
}: {
  file: GithubPullRequestRestFile | null;
  patch: string | null;
  isLoading: boolean;
  error: string | null;
}) {
  const { theme } = useTheme();
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">(() =>
    getStoredDiffStyle()
  );

  useEffect(() => {
    window.localStorage.setItem(DIFF_STYLE_STORAGE_KEY, diffStyle);
  }, [diffStyle]);

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
      <div className="diff-frame min-h-0 flex-1 overflow-auto rounded-2xl border border-border/70 bg-background/80 shadow-sm">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Preparing diff viewer...
            </div>
          }
        >
          <PatchDiff
            patch={patch}
            options={{
              diffStyle,
              overflow: "wrap",
              disableFileHeader: true,
              themeType: theme
            }}
            className="min-w-full"
          />
        </Suspense>
      </div>
    </div>
  );
}
