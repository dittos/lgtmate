import { ExternalLink, GitBranch } from "lucide-react";
import type { AnalyzerProvider } from "@/lib/analyzer";
import {
  getPullRequestState,
  type GithubPullRequest
} from "@/lib/github";
import { PrAnalysisPanel } from "./pr-analysis-panel";
import { StateBadge } from "./state-badge";

export function PullRequestHeader({
  pullRequest,
  owner,
  repo,
  number,
  provider,
  onAnalyze
}: {
  pullRequest: GithubPullRequest;
  owner: string;
  repo: string;
  number: number;
  provider: AnalyzerProvider;
  onAnalyze: (provider: AnalyzerProvider) => void;
}) {
  return (
    <div className="border-b border-border/70 px-6 py-5 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-8 md:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight font-semibold md:text-3xl">
            {pullRequest.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {pullRequest.repository.owner.login}/{pullRequest.repository.name}
            </span>
            <StateBadge state={getPullRequestState(pullRequest)} />
            <span>by {pullRequest.author?.login ?? "ghost"}</span>
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-3.5 text-muted-foreground" />
              {pullRequest.headRefName}
              <span className="text-muted-foreground">→</span>
              {pullRequest.baseRefName}
            </span>
            <span aria-hidden="true" className="h-4 w-px bg-border/80" />
            <a
              href={pullRequest.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              View on GitHub
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>
        <PrAnalysisPanel
          owner={owner}
          repo={repo}
          number={number}
          provider={provider}
          pullRequestHeadOid={pullRequest.headRefOid}
          onAnalyze={onAnalyze}
        />
      </div>
    </div>
  );
}
