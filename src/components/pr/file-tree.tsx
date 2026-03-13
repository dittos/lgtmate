import { FileCode2, FileText, FolderTree, Minus, Plus } from "lucide-react";
import { TruncatedText } from "@/components/ui/truncated-text";
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

export function FileTree({
  files,
  selectedPath,
  onSelect,
  onSelectDescription
}: {
  files: GithubPullRequestFileNode[];
  selectedPath: string | null;
  onSelect(path: string): void;
  onSelectDescription(): void;
}) {
  const nodes = buildFileTree(files);

  return (
    <div className="px-3 py-3">
      <div className="mb-3 flex items-center justify-between px-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <FolderTree className="size-3.5" />
          Files changed
        </span>
        <span>{files.length}</span>
      </div>
      <div className="space-y-1">
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors",
            selectedPath === null
              ? "bg-amber-500/12 text-foreground ring-1 ring-amber-500/20"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          onClick={onSelectDescription}
        >
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">Description</span>
        </button>
        {nodes.map((node) => (
          <FileTreeNodeView
            key={node.name}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function FileTreeNodeView({
  node,
  depth,
  selectedPath,
  onSelect
}: {
  node: FileTreeNode;
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
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  const fileTypeBadge = node.file ? getFileTypeBadge(node.file.changeType) : null;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors",
        node.file ? getFileChangeClasses(node.file.changeType, isSelected) : null
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      onClick={() => node.path && onSelect(node.path)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FileCode2
          className={cn(
            "size-3.5 shrink-0",
            node.file?.changeType === "ADDED"
              ? "text-emerald-700 dark:text-emerald-300"
              : node.file?.changeType === "DELETED"
                ? "text-rose-700 dark:text-rose-300"
                : "text-muted-foreground"
          )}
        />
        {fileTypeBadge ? (
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-md border text-[0.65rem] font-semibold",
              fileTypeBadge.className
            )}
          >
            {fileTypeBadge.label}
          </span>
        ) : null}
        <TruncatedText text={node.name} className="min-w-0 flex-1" />
      </span>
      {node.file ? (
        <span className="flex shrink-0 items-center gap-2 text-[0.72rem] tabular-nums">
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
            <Plus className="size-3" />
            {node.file.additions}
          </span>
          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
            <Minus className="size-3" />
            {node.file.deletions}
          </span>
        </span>
      ) : null}
    </button>
  );
}
