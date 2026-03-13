import { Suspense, lazy } from "react";
import { ExternalLink } from "lucide-react";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatChangeType, type GithubPullRequestRestFile } from "@/lib/github";
import { useTheme } from "@/lib/theme";

const PatchDiff = lazy(async () => {
  const module = await import("@pierre/diffs/react");
  return { default: module.PatchDiff };
});

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
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            View blob on GitHub
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </section>
    );
  }

  return (
    <div className="h-full px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            <TruncatedText text={file.filename} className="block" />
          </h2>
          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {formatChangeType(file.status)}
            {file.previous_filename ? ` from ${file.previous_filename}` : ""}
          </p>
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
      <div className="diff-frame h-[calc(100%-3.75rem)] overflow-auto rounded-2xl border border-border/70 bg-background/80 shadow-sm">
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
              diffStyle: "split",
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
