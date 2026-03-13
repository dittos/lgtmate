import { ExternalLink, GitBranch } from "lucide-react";
import {
  getPullRequestState,
  type GithubPullRequest
} from "@/lib/github";
import { StateBadge } from "./state-badge";

export function PullRequestHeader({
  pullRequest
}: {
  pullRequest: GithubPullRequest;
}) {
  return (
    <div className="border-b border-white/10 px-6 py-5 md:px-8">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold text-white md:text-3xl">
            {pullRequest.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-300">
            <span className="font-medium text-zinc-100">
              {pullRequest.repository.owner.login}/{pullRequest.repository.name}
            </span>
            <StateBadge state={getPullRequestState(pullRequest)} />
            <span>by {pullRequest.author?.login ?? "ghost"}</span>
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-3.5 text-zinc-500" />
              {pullRequest.headRefName}
              <span className="text-zinc-500">→</span>
              {pullRequest.baseRefName}
            </span>
          </div>
        </div>
        <a
          href={pullRequest.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          View on GitHub
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
