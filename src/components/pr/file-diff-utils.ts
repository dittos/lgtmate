import {
  getHunkSeparatorSlotName,
  type HunkData,
  type ContextContent
} from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import type { PullRequestHiddenContextDirection } from "@/lib/github";

export type RenderedFileDiff = FileDiffMetadata & {
  trailingHiddenLines: number;
};

export type AppliedHiddenContext = {
  hunkIndex: number;
  direction: PullRequestHiddenContextDirection;
  lines: string[];
};

export type HiddenContextExpandAction = {
  anchorLine: number;
  direction: Exclude<PullRequestHiddenContextDirection, "both">;
};

export type HiddenContextSeparatorSlot = {
  slotName: string;
  hunkIndex: number;
  lines: number;
  type: HunkData["type"];
  expandActions: HiddenContextExpandAction[];
};

export type TrailingHiddenContextSeparator = Pick<
  HiddenContextSeparatorSlot,
  "hunkIndex" | "lines" | "type" | "expandActions"
>;

export type HiddenContextSeparators = {
  slots: HiddenContextSeparatorSlot[];
  trailingHiddenContext: TrailingHiddenContextSeparator | null;
};

export function getHiddenContextSeparatorSlots(
  fileDiff: FileDiffMetadata | RenderedFileDiff,
  diffStyle: "unified" | "split"
): HiddenContextSeparators {
  const slotTypes: HiddenContextSeparatorSlot["type"][] =
    diffStyle === "unified" ? ["unified"] : ["deletions", "additions"];
  const slots: HiddenContextSeparatorSlot[] = [];
  let previousEnd = 0;

  for (const [hunkIndex, hunk] of fileDiff.hunks.entries()) {
    if (hunk.collapsedBefore > 0) {
      const expandActions: HiddenContextExpandAction[] = [];

      if (hunkIndex > 0) {
        expandActions.push({
          anchorLine: previousEnd + 1,
          direction: "after"
        });
      }

      expandActions.push({
        anchorLine: Math.max(1, hunk.additionStart - 1),
        direction: "before"
      });

      for (const type of slotTypes) {
        slots.push({
          slotName: getHunkSeparatorSlotName(type, hunkIndex),
          hunkIndex,
          lines: hunk.collapsedBefore,
          type,
          expandActions
        });
      }
    }

    previousEnd = hunk.additionStart + hunk.additionCount - 1;
  }

  const trailingHiddenLines =
    "trailingHiddenLines" in fileDiff ? fileDiff.trailingHiddenLines : 0;
  const lastHunk = fileDiff.hunks.at(-1);
  const trailingHiddenContext =
    trailingHiddenLines > 0 && lastHunk
      ? {
          hunkIndex: fileDiff.hunks.length,
          lines: trailingHiddenLines,
          type: "unified" as const,
          expandActions: [
            {
              anchorLine: lastHunk.additionStart + lastHunk.additionCount,
              direction: "after"
            } satisfies HiddenContextExpandAction
          ]
        }
      : null;

  return {
    slots,
    trailingHiddenContext
  };
}

export function applyHiddenContextToFileDiff<T extends FileDiffMetadata>(
  baseFileDiff: T,
  hiddenContext: AppliedHiddenContext
): T {
  if (hiddenContext.lines.length < 1) {
    return baseFileDiff;
  }

  const nextFileDiff = cloneFileDiff(baseFileDiff);
  applyHiddenContextMutation(nextFileDiff, hiddenContext);
  return nextFileDiff;
}

function cloneFileDiff<T extends FileDiffMetadata>(fileDiff: T): T {
  return {
    ...fileDiff,
    hunks: fileDiff.hunks.map((hunk) => ({
      ...hunk,
      hunkContent: hunk.hunkContent.map((content) => ({ ...content }))
    })),
    deletionLines: [...fileDiff.deletionLines],
    additionLines: [...fileDiff.additionLines]
  } as T;
}

function applyHiddenContextMutation(
  fileDiff: FileDiffMetadata,
  hiddenContext: AppliedHiddenContext
) {
  if (hiddenContext.direction === "before") {
    expandContextBeforeHunk(fileDiff, hiddenContext.hunkIndex, hiddenContext.lines);
    return;
  }

  if (hiddenContext.direction === "after") {
    expandContextAfterHunk(fileDiff, hiddenContext.hunkIndex, hiddenContext.lines);
  }
}

function expandContextBeforeHunk(
  fileDiff: FileDiffMetadata,
  hunkIndex: number,
  lines: string[]
) {
  const hunk = fileDiff.hunks[hunkIndex];

  if (!hunk || hunk.collapsedBefore < 1 || lines.length < 1) {
    return;
  }

  const visibleCount = Math.min(lines.length, hunk.collapsedBefore);
  const visibleLines = lines.slice(-visibleCount);

  if (visibleLines.length < 1) {
    return;
  }

  if (fileDiff.isPartial) {
    fileDiff.additionLines.splice(hunk.additionLineIndex, 0, ...visibleLines);
    fileDiff.deletionLines.splice(hunk.deletionLineIndex, 0, ...visibleLines);
    shiftHunkLineIndices(hunk, visibleLines.length);

    for (let index = hunkIndex + 1; index < fileDiff.hunks.length; index += 1) {
      const nextHunk = fileDiff.hunks[index];
      nextHunk.additionLineIndex += visibleLines.length;
      nextHunk.deletionLineIndex += visibleLines.length;
      shiftHunkLineIndices(nextHunk, visibleLines.length);
    }
  } else {
    hunk.additionLineIndex -= visibleLines.length;
    hunk.deletionLineIndex -= visibleLines.length;
  }

  hunk.splitLineStart -= visibleLines.length;
  hunk.unifiedLineStart -= visibleLines.length;

  for (let index = hunkIndex + 1; index < fileDiff.hunks.length; index += 1) {
    const nextHunk = fileDiff.hunks[index];
    nextHunk.splitLineStart -= visibleLines.length;
    nextHunk.unifiedLineStart -= visibleLines.length;
  }

  hunk.collapsedBefore -= visibleLines.length;
  hunk.additionStart -= visibleLines.length;
  hunk.deletionStart -= visibleLines.length;
  hunk.additionCount += visibleLines.length;
  hunk.deletionCount += visibleLines.length;
  hunk.splitLineCount += visibleLines.length;
  hunk.unifiedLineCount += visibleLines.length;
  fileDiff.splitLineCount += visibleLines.length;
  fileDiff.unifiedLineCount += visibleLines.length;
  prependContextLines(hunk, visibleLines.length);
}

function expandContextAfterHunk(
  fileDiff: FileDiffMetadata,
  hunkIndex: number,
  lines: string[]
) {
  if (hunkIndex < fileDiff.hunks.length) {
    expandContextAfterIntermediateGap(fileDiff, hunkIndex, lines);
    return;
  }

  const lastHunk = fileDiff.hunks.at(-1);

  if (
    !lastHunk ||
    hunkIndex !== fileDiff.hunks.length ||
    lines.length < 1
  ) {
    return;
  }

  const visibleLines = lines.slice();

  if (visibleLines.length < 1) {
    return;
  }

  const additionInsertIndex = lastHunk.additionLineIndex + lastHunk.additionCount;
  const deletionInsertIndex = lastHunk.deletionLineIndex + lastHunk.deletionCount;

  if (fileDiff.isPartial) {
    fileDiff.additionLines.splice(additionInsertIndex, 0, ...visibleLines);
    fileDiff.deletionLines.splice(deletionInsertIndex, 0, ...visibleLines);
  }

  lastHunk.additionCount += visibleLines.length;
  lastHunk.deletionCount += visibleLines.length;
  lastHunk.splitLineCount += visibleLines.length;
  lastHunk.unifiedLineCount += visibleLines.length;
  fileDiff.splitLineCount += visibleLines.length;
  fileDiff.unifiedLineCount += visibleLines.length;
  appendContextLines(lastHunk, visibleLines.length);
}

function expandContextAfterIntermediateGap(
  fileDiff: FileDiffMetadata,
  hunkIndex: number,
  lines: string[]
) {
  const hunk = fileDiff.hunks[hunkIndex];
  const previousHunk = fileDiff.hunks[hunkIndex - 1];

  if (!hunk || !previousHunk || hunk.collapsedBefore < 1 || lines.length < 1) {
    return;
  }

  const visibleCount = Math.min(lines.length, hunk.collapsedBefore);
  const visibleLines = lines.slice(0, visibleCount);

  if (visibleLines.length < 1) {
    return;
  }

  const additionInsertIndex =
    previousHunk.additionLineIndex + previousHunk.additionCount;
  const deletionInsertIndex =
    previousHunk.deletionLineIndex + previousHunk.deletionCount;

  if (fileDiff.isPartial) {
    fileDiff.additionLines.splice(additionInsertIndex, 0, ...visibleLines);
    fileDiff.deletionLines.splice(deletionInsertIndex, 0, ...visibleLines);
  }

  previousHunk.additionCount += visibleLines.length;
  previousHunk.deletionCount += visibleLines.length;
  previousHunk.splitLineCount += visibleLines.length;
  previousHunk.unifiedLineCount += visibleLines.length;

  for (let index = hunkIndex; index < fileDiff.hunks.length; index += 1) {
    const nextHunk = fileDiff.hunks[index];
    nextHunk.splitLineStart += visibleLines.length;
    nextHunk.unifiedLineStart += visibleLines.length;

    if (fileDiff.isPartial) {
      nextHunk.additionLineIndex += visibleLines.length;
      nextHunk.deletionLineIndex += visibleLines.length;
      shiftHunkLineIndices(nextHunk, visibleLines.length);
    }
  }

  hunk.collapsedBefore -= visibleLines.length;
  fileDiff.splitLineCount += visibleLines.length;
  fileDiff.unifiedLineCount += visibleLines.length;
  appendContextLines(previousHunk, visibleLines.length);
}

function shiftHunkLineIndices(hunk: FileDiffMetadata["hunks"][number], delta: number) {
  hunk.hunkContent = hunk.hunkContent.map((content) => ({
    ...content,
    additionLineIndex: content.additionLineIndex + delta,
    deletionLineIndex: content.deletionLineIndex + delta
  }));
}

function prependContextLines(
  hunk: FileDiffMetadata["hunks"][number],
  lines: number
) {
  const firstContent = hunk.hunkContent[0];

  if (firstContent?.type === "context") {
    firstContent.lines += lines;
    firstContent.additionLineIndex = hunk.additionLineIndex;
    firstContent.deletionLineIndex = hunk.deletionLineIndex;
    return;
  }

  const contextContent: ContextContent = {
    type: "context",
    lines,
    additionLineIndex: hunk.additionLineIndex,
    deletionLineIndex: hunk.deletionLineIndex
  };
  hunk.hunkContent.unshift(contextContent);
}

function appendContextLines(
  hunk: FileDiffMetadata["hunks"][number],
  lines: number
) {
  const additionLineIndex = hunk.additionLineIndex + hunk.additionCount - lines;
  const deletionLineIndex = hunk.deletionLineIndex + hunk.deletionCount - lines;
  const lastContent = hunk.hunkContent.at(-1);

  if (lastContent?.type === "context") {
    lastContent.lines += lines;
    return;
  }

  const contextContent: ContextContent = {
    type: "context",
    lines,
    additionLineIndex,
    deletionLineIndex
  };
  hunk.hunkContent.push(contextContent);
}
