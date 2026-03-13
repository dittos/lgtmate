import { GitPullRequest } from "lucide-react";
import type { GithubPullRequest } from "@/lib/github";

export function PullRequestDescription({
  pullRequest
}: {
  pullRequest: GithubPullRequest;
}) {
  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-6 md:px-8">
      <div className="mb-6 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-zinc-400">
        <GitPullRequest className="size-3.5" />
        Description
      </div>
      {pullRequest.bodyHTML ? (
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: pullRequest.bodyHTML }}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
          No description provided.
        </div>
      )}
    </section>
  );
}
