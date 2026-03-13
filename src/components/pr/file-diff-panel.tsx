import { Suspense, lazy } from "react";
import { ExternalLink } from "lucide-react";
import { formatChangeType, type PullRequestFilePatch } from "@/lib/github";

const PatchDiff = lazy(async () => {
  const module = await import("@pierre/diffs/react");
  return { default: module.PatchDiff };
});

export function FileDiffPanel({
  file,
  isLoading,
  error
}: {
  file: PullRequestFilePatch | null;
  isLoading: boolean;
  error: string | null;
}) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        Loading file diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-rose-300">
        {error}
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        Select a changed file.
      </div>
    );
  }

  if (!file.patch) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-6 md:px-8">
        <h2 className="mb-2 text-lg font-semibold text-white">{file.path}</h2>
        <p className="mb-5 text-sm text-zinc-400">
          GitHub did not provide a textual patch for this file.
        </p>
        {file.blobUrl ? (
          <a
            href={file.blobUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10"
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
          <h2 className="truncate text-base font-semibold text-white">{file.path}</h2>
          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-zinc-500">
            {formatChangeType(file.status)}
            {file.previousFilename ? ` from ${file.previousFilename}` : ""}
          </p>
        </div>
        {file.blobUrl ? (
          <a
            href={file.blobUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-zinc-300 hover:text-white"
          >
            GitHub
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
      <div className="diff-frame h-[calc(100%-3.75rem)] overflow-auto rounded-2xl border border-white/10 bg-[#0b0f14]/80">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              Preparing diff viewer...
            </div>
          }
        >
          <PatchDiff
            patch={file.patch}
            options={{
              diffStyle: "split",
              overflow: "wrap",
              disableFileHeader: true,
              themeType: "dark"
            }}
            className="min-w-full"
          />
        </Suspense>
      </div>
    </div>
  );
}
