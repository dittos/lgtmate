import { useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  FileCode2,
  FileText,
  FolderTree,
  LoaderCircle,
  Minus,
  Plus,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  useAnalysisController,
  useAnalysisControllerSelector
} from "@/lib/analysis-controller";
import type { AnalyzerProvider } from "@/lib/analyzer";
import { getAnalysisSourceMode, isDemoProviderReason } from "@/lib/demo-analysis";
import type { GithubPullRequestFileNode } from "@/lib/github";
import { cn } from "@/lib/utils";

type FileTreeNode = {
  name: string;
  path: string | null;
  file: GithubPullRequestFileNode | null;
  children: FileTreeNode[];
};

type CompressedDirectoryNode = {
  label: string;
  node: FileTreeNode;
};

type TreeMode = "smart" | "plain";

const ANALYSIS_SOURCE_MODE = getAnalysisSourceMode();

function getFileChangeClasses(changeType: string, isSelected: boolean) {
  switch (changeType) {
    case "ADDED":
      return isSelected
        ? "bg-emerald-500/8 text-emerald-800 ring-1 ring-emerald-500/15 dark:text-emerald-100"
        : "text-emerald-700 hover:bg-emerald-500/6 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-500/8 dark:hover:text-emerald-100";
    case "DELETED":
      return isSelected
        ? "bg-rose-500/8 text-rose-800 ring-1 ring-rose-500/15 dark:text-rose-100"
        : "text-rose-700 hover:bg-rose-500/6 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-500/8 dark:hover:text-rose-100";
    default:
      return isSelected
        ? "bg-amber-500/12 text-foreground ring-1 ring-amber-500/20"
        : "text-muted-foreground hover:bg-muted hover:text-foreground";
  }
}

function getFileTypeBadge(changeType: string) {
  switch (changeType) {
    case "ADDED":
      return {
        label: "A",
        className:
          "border-emerald-500/15 bg-emerald-500/8 text-emerald-700 dark:text-emerald-200"
      };
    case "DELETED":
      return {
        label: "D",
        className: "border-rose-500/15 bg-rose-500/8 text-rose-700 dark:text-rose-200"
      };
    case "RENAMED":
      return {
        label: "R",
        className: "border-sky-500/15 bg-sky-500/8 text-sky-700 dark:text-sky-200"
      };
    default:
      return {
        label: "M",
        className: "border-border/70 bg-muted/60 text-muted-foreground"
      };
  }
}

function splitFilePath(path: string) {
  const lastSlashIndex = path.lastIndexOf("/");

  if (lastSlashIndex < 0) {
    return {
      name: path,
      parentPath: null
    };
  }

  return {
    name: path.slice(lastSlashIndex + 1),
    parentPath: path.slice(0, lastSlashIndex)
  };
}

function buildFileTree(files: GithubPullRequestFileNode[]) {
  const root: FileTreeNode = {
    name: "",
    path: null,
    file: null,
    children: []
  };

  for (const file of files) {
    const segments = file.path.split("/");
    let currentNode = root;

    segments.forEach((segment, index) => {
      let childNode = currentNode.children.find(
        (candidate) => candidate.name === segment
      );

      if (!childNode) {
        childNode = {
          name: segment,
          path: index === segments.length - 1 ? file.path : null,
          file: index === segments.length - 1 ? file : null,
          children: []
        };
        currentNode.children.push(childNode);
        currentNode.children.sort((left, right) => {
          const leftIsDirectory = left.children.length > 0 || left.path === null;
          const rightIsDirectory = right.children.length > 0 || right.path === null;

          if (leftIsDirectory !== rightIsDirectory) {
            return leftIsDirectory ? -1 : 1;
          }

          return left.name.localeCompare(right.name);
        });
      }

      currentNode = childNode;
    });
  }

  return root.children;
}

function compressDirectoryNode(node: FileTreeNode): CompressedDirectoryNode {
  let currentNode = node;
  const segments = [node.name];

  while (currentNode.path === null && currentNode.children.length === 1) {
    const [child] = currentNode.children;

    if (!child || child.path !== null) {
      break;
    }

    segments.push(child.name);
    currentNode = child;
  }

  return {
    label: segments.join("/"),
    node: currentNode
  };
}

function FileRow({
  file,
  commentCount,
  selectedPath,
  onSelect,
  indent = 0
}: {
  file: GithubPullRequestFileNode;
  commentCount: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  indent?: number;
}) {
  const isSelected = selectedPath === file.path;
  const fileTypeBadge = getFileTypeBadge(file.changeType);
  const { name, parentPath } = splitFilePath(file.path);

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm",
        getFileChangeClasses(file.changeType, isSelected)
      )}
      style={{ paddingLeft: `${indent}px` }}
      onClick={() => onSelect(file.path)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FileCode2
          className={cn(
            "size-3.5 shrink-0",
            file.changeType === "ADDED"
              ? "text-emerald-700 dark:text-emerald-300"
              : file.changeType === "DELETED"
                ? "text-rose-700 dark:text-rose-300"
                : "text-muted-foreground"
          )}
        />
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md border text-[0.65rem] font-semibold",
            fileTypeBadge.className
          )}
        >
          {fileTypeBadge.label}
        </span>
        <span className="min-w-0 flex-1">
          <TruncatedText text={name} className="block min-w-0 font-medium" />
          {parentPath ? (
            <TruncatedText
              text={parentPath}
              className="mt-0.5 block min-w-0 text-[0.72rem] text-muted-foreground"
            />
          ) : null}
        </span>
      </span>
      <FileCommentCountBadge count={commentCount} />
    </button>
  );
}

function PlainPathTree({
  files,
  commentCountsByPath,
  selectedPath,
  onSelect
}: {
  files: GithubPullRequestFileNode[];
  commentCountsByPath: Record<string, number>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const nodes = buildFileTree(files);

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <FileTreeNodeView
          key={node.name}
          node={node}
          commentCountsByPath={commentCountsByPath}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function SmartModeEmptyState({
  isLoading,
  canAnalyze,
  provider,
  onAnalyze,
  blockedReason
}: {
  isLoading: boolean;
  canAnalyze: boolean;
  provider: AnalyzerProvider;
  onAnalyze: (provider: AnalyzerProvider) => void;
  blockedReason: string | null;
}) {
  const analyzeDisabledReason = !canAnalyze && isDemoProviderReason(blockedReason)
    ? blockedReason
    : undefined;

  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-4">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          <span>Building smart file groups...</span>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No smart grouping is cached yet. Analyze this pull request to organize
            the changed files by concern.
          </p>
          {blockedReason && !isDemoProviderReason(blockedReason) ? (
            <p className="text-sm text-destructive">{blockedReason}</p>
          ) : null}
          {analyzeDisabledReason ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onAnalyze(provider)}
                    disabled={!canAnalyze}
                  >
                    <Sparkles className="size-4" />
                    Analyze
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{analyzeDisabledReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => onAnalyze(provider)}
              disabled={!canAnalyze}
            >
              <Sparkles className="size-4" />
              Analyze
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  owner,
  repo,
  number,
  files,
  commentCountsByPath,
  selectedPath,
  onSelect,
  onSelectDescription,
  provider,
  pullRequestHeadOid,
  onAnalyze
}: {
  owner: string;
  repo: string;
  number: number;
  files: GithubPullRequestFileNode[];
  commentCountsByPath: Record<string, number>;
  selectedPath: string | null;
  onSelect(path: string): void;
  onSelectDescription(): void;
  provider: AnalyzerProvider;
  pullRequestHeadOid: string;
  onAnalyze: (provider: AnalyzerProvider) => void;
}) {
  const [mode, setMode] = useState<TreeMode>("smart");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedChildren, setCollapsedChildren] = useState<Record<string, boolean>>({});
  const controller = useAnalysisController({ owner, repo, number });
  const analysis = useAnalysisControllerSelector(controller, (state) =>
    state.analysis?.provider === provider ? state.analysis : null
  );
  const repositoryError = useAnalysisControllerSelector(
    controller,
    (state) => state.repository.error
  );
  const hasMapping = useAnalysisControllerSelector(
    controller,
    (state) => state.repository.hasMapping
  );
  const providerAvailability = useAnalysisControllerSelector(
    controller,
    (state) => state.providers[provider]
  );
  const isLookupLoading = useAnalysisControllerSelector(
    controller,
    (state) => state.isLookupLoading
  );
  const isStarting = useAnalysisControllerSelector(controller, (state) => state.isStarting);
  const jobStatus = useAnalysisControllerSelector(controller, (state) =>
    state.job?.provider === provider ? state.job.status : null
  );
  const smartError = useAnalysisControllerSelector(controller, (state) =>
    state.analysis ? null : state.error
  );
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const smartAnalysis = analysis?.analysis ?? null;
  const hasSmartGroups = (smartAnalysis?.groups.length ?? 0) > 0;
  const isSmartLoading =
    isLookupLoading || isStarting || jobStatus === "queued" || jobStatus === "running";
  const canAnalyze =
    hasMapping &&
    !repositoryError &&
    providerAvailability.available &&
    !isSmartLoading;
  const isOutdated = Boolean(analysis && analysis.headOid !== pullRequestHeadOid);
  const blockedReason = isDemoProviderReason(providerAvailability.reason)
    ? providerAvailability.reason
    : repositoryError ?? (!hasMapping ? "A local repository mapping is required." : smartError);

  useEffect(() => {
    setCollapsedGroups({});
    setCollapsedChildren({});
  }, [analysis?.completedAt]);

  useEffect(() => {
    if (ANALYSIS_SOURCE_MODE !== "bundled" || isLookupLoading) {
      return;
    }

    setMode((current) => {
      if (analysis) {
        return current === "plain" ? current : "smart";
      }

      return current === "smart" ? "plain" : current;
    });
  }, [analysis, isLookupLoading]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/70 bg-muted/25 px-3 py-3">
        <div className="mb-3 flex items-center justify-between px-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <FolderTree className="size-3.5" />
            Files changed
          </span>
          <span>{files.length}</span>
        </div>

        <div className="px-2">
          <div className="inline-flex w-full items-center rounded-xl border border-border/70 bg-muted/50 p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={mode === "smart"}
              className={cn(
                "h-7 flex-1 rounded-lg px-2 text-xs",
                mode === "smart"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("smart")}
            >
              Smart File Tree
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={mode === "plain"}
              className={cn(
                "h-7 flex-1 rounded-lg px-2 text-xs",
                mode === "plain"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("plain")}
            >
              File Tree
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <div className="space-y-2">
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm",
              selectedPath === null
                ? "bg-amber-500/12 text-foreground ring-1 ring-amber-500/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            onClick={onSelectDescription}
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">Description</span>
          </button>

          {mode === "plain" ? (
            <PlainPathTree
              files={files}
              commentCountsByPath={commentCountsByPath}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ) : !smartAnalysis ? (
            <SmartModeEmptyState
              isLoading={isSmartLoading}
              canAnalyze={canAnalyze}
              provider={provider}
              onAnalyze={onAnalyze}
              blockedReason={blockedReason}
            />
          ) : !hasSmartGroups ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                Smart grouping was unavailable for this analysis, so the tree is
                falling back to the regular path view.
              </div>
              <PlainPathTree
                files={files}
                commentCountsByPath={commentCountsByPath}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {smartError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {smartError}
                </div>
              ) : null}
              {isOutdated ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                  Cached smart grouping is outdated for the current PR head commit.
                </div>
              ) : null}
              {isSmartLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  <span>Updating smart file groups...</span>
                </div>
              ) : null}

              {smartAnalysis.groups.map((group) => {
                const isCollapsed = collapsedGroups[group.id] ?? false;

                return (
                  <section
                    key={group.id}
                    className="overflow-hidden rounded-2xl border border-foreground/20 bg-background/80"
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 bg-muted/45 px-4 py-3 text-left"
                      onClick={() =>
                        setCollapsedGroups((current) => ({
                          ...current,
                          [group.id]: !isCollapsed
                        }))
                      }
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform",
                              isCollapsed ? "-rotate-90" : "rotate-0"
                            )}
                          />
                          <span className="text-sm font-semibold">{group.title}</span>
                        </div>
                        {group.rationale ? (
                          <p className="mt-1 pl-6 text-sm text-muted-foreground">
                            {group.rationale}
                          </p>
                        ) : null}
                      </div>
                    </button>

                    {isCollapsed ? null : (
                      <div className="space-y-3 border-t border-border/70 px-3 py-3">
                        {group.children.map((child) => {
                          const isChildCollapsed = collapsedChildren[child.id] ?? false;

                          return (
                            <div
                              key={child.id}
                              className="rounded-lg bg-muted/15"
                            >
                              <button
                                type="button"
                                className="flex w-full items-start justify-between gap-3 px-2 py-1.5 text-left"
                                onClick={() =>
                                  setCollapsedChildren((current) => ({
                                    ...current,
                                    [child.id]: !isChildCollapsed
                                  }))
                                }
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <ChevronDown
                                      className={cn(
                                        "size-4 shrink-0 text-muted-foreground transition-transform",
                                        isChildCollapsed ? "-rotate-90" : "rotate-0"
                                      )}
                                    />
                                    <span className="text-sm font-medium">{child.title}</span>
                                  </div>
                                </div>
                              </button>

                              {isChildCollapsed ? null : (
                                <div className="space-y-1 px-2 py-1">
                                  {child.filePaths.map((path) => {
                                    const file = filesByPath.get(path);

                                    if (!file) {
                                      return null;
                                    }

                                    return (
                                      <FileRow
                                        key={path}
                                        file={file}
                                        commentCount={commentCountsByPath[path] ?? 0}
                                        selectedPath={selectedPath}
                                        onSelect={onSelect}
                                        indent={8}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}

              {smartAnalysis.ungroupedPaths.length > 0 ? (
                <section className="rounded-2xl border border-border/70 bg-background/75">
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Other files</span>
                      <span className="rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
                        {smartAnalysis.ungroupedPaths.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 border-t border-border/70 px-2 py-2">
                    {smartAnalysis.ungroupedPaths.map((path) => {
                      const file = filesByPath.get(path);

                      if (!file) {
                        return null;
                      }

                      return (
                        <FileRow
                          key={path}
                          file={file}
                          commentCount={commentCountsByPath[path] ?? 0}
                          selectedPath={selectedPath}
                          onSelect={onSelect}
                          indent={8}
                        />
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileTreeNodeView({
  node,
  commentCountsByPath,
  depth,
  selectedPath,
  onSelect
}: {
  node: FileTreeNode;
  commentCountsByPath: Record<string, number>;
  depth: number;
  selectedPath: string | null;
  onSelect(path: string): void;
}) {
  const isDirectory = node.children.length > 0 && node.path === null;
  const isSelected = selectedPath === node.path;

  if (isDirectory) {
    const compressed = compressDirectoryNode(node);

    return (
      <div>
        <div
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <span className="text-muted-foreground">/</span>
          <TruncatedText text={compressed.label} className="block min-w-0 flex-1" />
        </div>
        <div className="space-y-1">
          {compressed.node.children.map((child) => (
            <FileTreeNodeView
              key={`${compressed.label}/${child.name}`}
              node={child}
              commentCountsByPath={commentCountsByPath}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!node.file) {
    return null;
  }

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm",
        getFileChangeClasses(node.file.changeType, isSelected)
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      onClick={() => node.path && onSelect(node.path)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FileCode2
          className={cn(
            "size-3.5 shrink-0",
            node.file.changeType === "ADDED"
              ? "text-emerald-700 dark:text-emerald-300"
              : node.file.changeType === "DELETED"
                ? "text-rose-700 dark:text-rose-300"
                : "text-muted-foreground"
          )}
        />
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md border text-[0.65rem] font-semibold",
            getFileTypeBadge(node.file.changeType).className
          )}
        >
          {getFileTypeBadge(node.file.changeType).label}
        </span>
        <TruncatedText text={node.name} className="min-w-0 flex-1" />
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[0.72rem] tabular-nums">
        <FileCommentCountBadge count={commentCountsByPath[node.file.path] ?? 0} />
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
          <Plus className="size-3" />
          {node.file.additions}
        </span>
        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
          <Minus className="size-3" />
          {node.file.deletions}
        </span>
      </span>
    </button>
  );
}

function FileCommentCountBadge({ count }: { count: number }) {
  if (count < 1) {
    return null;
  }

  return (
    <span className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-sky-700 dark:text-sky-200">
      {count}
    </span>
  );
}
