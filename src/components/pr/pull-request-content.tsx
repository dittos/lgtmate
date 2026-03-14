import {
  buildPullRequestFilePatch,
  type GithubPullRequest,
  type GithubPullRequestRestFile
} from "@/lib/github";
import { FileDiffPanel } from "./file-diff-panel";
import { PullRequestDescription } from "./pull-request-description";

export function PullRequestContent({
  pullRequest,
  selectedPath,
  selectedFile,
  isDiffLoading,
  diffError
}: {
  pullRequest: GithubPullRequest;
  selectedPath: string | null;
  selectedFile: GithubPullRequestRestFile | null;
  isDiffLoading: boolean;
  diffError: string | null;
}) {
  if (selectedPath) {
    return (
      <FileDiffPanel
        file={selectedFile}
        patch={selectedFile ? buildPullRequestFilePatch(selectedFile) : null}
        isLoading={isDiffLoading}
        error={diffError}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6 md:px-8">
      <PullRequestDescription pullRequest={pullRequest} />
    </div>
  );
}
