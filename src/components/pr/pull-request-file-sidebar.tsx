import type { AnalyzerProvider } from "@/lib/analyzer";
import type { GithubPullRequestFileNode } from "@/lib/github";
import { FileTree } from "./file-tree";

export function PullRequestFileSidebar({
  files,
  isLoading,
  error,
  owner,
  repo,
  number,
  selectedPath,
  provider,
  pullRequestHeadOid,
  onSelect,
  onSelectDescription,
  onAnalyze
}: {
  files: GithubPullRequestFileNode[];
  isLoading: boolean;
  error: string | null;
  owner: string;
  repo: string;
  number: number;
  selectedPath: string | null;
  provider: AnalyzerProvider;
  pullRequestHeadOid: string;
  onSelect: (path: string) => void;
  onSelectDescription: () => void;
  onAnalyze: (provider: AnalyzerProvider) => void;
}) {
  if (isLoading) {
    return <div className="px-5 py-5 text-sm text-muted-foreground">Loading files...</div>;
  }

  if (error) {
    return <div className="px-5 py-5 text-sm text-destructive">{error}</div>;
  }

  return (
    <FileTree
      owner={owner}
      repo={repo}
      number={number}
      files={files}
      selectedPath={selectedPath}
      onSelect={onSelect}
      onSelectDescription={onSelectDescription}
      provider={provider}
      pullRequestHeadOid={pullRequestHeadOid}
      onAnalyze={onAnalyze}
    />
  );
}
