import { FileCode2, FolderTree, Minus, Plus } from "lucide-react";
import type { PullRequestFile } from "@/lib/github";
import { cn } from "@/lib/utils";

type FileTreeNode = {
  name: string;
  path: string | null;
  file: PullRequestFile | null;
  children: FileTreeNode[];
};

type CompressedDirectoryNode = {
  label: string;
  node: FileTreeNode;
};

function buildFileTree(files: PullRequestFile[]) {
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
  onSelect
}: {
  files: PullRequestFile[];
  selectedPath: string | null;
  onSelect(path: string): void;
}) {
  const nodes = buildFileTree(files);

  return (
    <div className="px-3 py-3">
      <div className="mb-3 flex items-center justify-between px-2 text-xs uppercase tracking-[0.14em] text-zinc-400">
        <span className="inline-flex items-center gap-2">
          <FolderTree className="size-3.5" />
          Files changed
        </span>
        <span>{files.length}</span>
      </div>
      <div className="space-y-1">
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

  if (isDirectory) {
    const compressed = compressDirectoryNode(node);

    return (
      <div>
        <div
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-zinc-300"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <span className="text-zinc-500">/</span>
          <span>{compressed.label}</span>
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

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors",
        selectedPath === node.path
          ? "bg-amber-300/14 text-white ring-1 ring-amber-200/20"
          : "text-zinc-300 hover:bg-white/6 hover:text-white"
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      onClick={() => node.path && onSelect(node.path)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FileCode2 className="size-3.5 shrink-0 text-zinc-500" />
        <span className="truncate">{node.name}</span>
      </span>
      {node.file ? (
        <span className="flex shrink-0 items-center gap-2 text-[0.72rem] tabular-nums">
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <Plus className="size-3" />
            {node.file.additions}
          </span>
          <span className="inline-flex items-center gap-1 text-rose-300">
            <Minus className="size-3" />
            {node.file.deletions}
          </span>
        </span>
      ) : null}
    </button>
  );
}
