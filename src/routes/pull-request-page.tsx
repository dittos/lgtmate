import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { FileDiffPanel } from "@/components/pr/file-diff-panel";
import { FileTree } from "@/components/pr/file-tree";
import { PullRequestDescription } from "@/components/pr/pull-request-description";
import { PullRequestHeader } from "@/components/pr/pull-request-header";
import {
  buildPullRequestFilePatch,
  getPullRequest,
  getPullRequestFileDiff,
  getPullRequestFiles,
  type GithubPullRequest,
  type GithubPullRequestFileNode,
  type GithubPullRequestRestFile
} from "@/lib/github";

export function PullRequestPage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const number = Number(params.number ?? "");
  const selectedPath = searchParams.get("path");

  const [pullRequest, setPullRequest] = useState<GithubPullRequest | null>(null);
  const [files, setFiles] = useState<GithubPullRequestFileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<GithubPullRequestRestFile | null>(
    null
  );
  const [isPullRequestLoading, setIsPullRequestLoading] = useState(true);
  const [isFilesLoading, setIsFilesLoading] = useState(true);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [pullRequestError, setPullRequestError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadPage() {
      try {
        setIsPullRequestLoading(true);
        setIsFilesLoading(true);
        setPullRequestError(null);
        setFilesError(null);

        const [nextPullRequest, nextFiles] = await Promise.all([
          getPullRequest(owner, repo, number),
          getPullRequestFiles(owner, repo, number)
        ]);

        if (isActive) {
          setPullRequest(nextPullRequest);
          setFiles(nextFiles);
        }
      } catch (error) {
        if (isActive) {
          const message =
            error instanceof Error ? error.message : "Failed to load pull request";
          setPullRequestError(message);
          setFilesError(message);
        }
      } finally {
        if (isActive) {
          setIsPullRequestLoading(false);
          setIsFilesLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      isActive = false;
    };
  }, [owner, repo, number]);

  useEffect(() => {
    if (!selectedPath) {
      setSelectedFile(null);
      setDiffError(null);
      setIsDiffLoading(false);
      return;
    }

    let isActive = true;
    const path = selectedPath;

    async function loadDiff() {
      try {
        setIsDiffLoading(true);
        setDiffError(null);

        const nextFile = await getPullRequestFileDiff(owner, repo, number, path);

        if (isActive) {
          setSelectedFile(nextFile);
        }
      } catch (error) {
        if (isActive) {
          setSelectedFile(null);
          setDiffError(
            error instanceof Error ? error.message : "Failed to load file diff"
          );
        }
      } finally {
        if (isActive) {
          setIsDiffLoading(false);
        }
      }
    }

    void loadDiff();

    return () => {
      isActive = false;
    };
  }, [owner, repo, number, selectedPath]);

  function handleSelectFile(path: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("path", path);
    void setSearchParams(nextParams);
  }

  function handleSelectDescription() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("path");
    void setSearchParams(nextParams);
  }

  if (Number.isNaN(number) || !owner || !repo) {
    return (
      <main className="flex h-screen items-center justify-center px-6 text-sm text-destructive">
        Invalid pull request URL.
      </main>
    );
  }

  if (isPullRequestLoading && !pullRequest) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading pull request...
      </main>
    );
  }

  if (pullRequestError || !pullRequest) {
    return (
      <main className="flex h-screen items-center justify-center px-6 text-sm text-destructive">
        {pullRequestError ?? "Failed to load pull request"}
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <section className="flex h-full flex-col border border-border/70 bg-card/75 shadow-sm backdrop-blur-md">
        <PullRequestHeader pullRequest={pullRequest} />
        <div className="flex min-h-0 flex-1">
          <aside className="min-h-0 w-full max-w-[22rem] shrink-0 overflow-auto border-r border-border/70 bg-muted/25">
            {isFilesLoading ? (
              <div className="px-5 py-5 text-sm text-muted-foreground">Loading files...</div>
            ) : filesError ? (
              <div className="px-5 py-5 text-sm text-destructive">{filesError}</div>
            ) : (
              <FileTree
                files={files}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                onSelectDescription={handleSelectDescription}
              />
            )}
          </aside>
          <section className="min-h-0 min-w-0 flex-1 overflow-auto">
            {selectedPath ? (
              <FileDiffPanel
                file={selectedFile}
                patch={selectedFile ? buildPullRequestFilePatch(selectedFile) : null}
                isLoading={isDiffLoading}
                error={diffError}
              />
            ) : (
              <PullRequestDescription pullRequest={pullRequest} />
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
