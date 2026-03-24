import { getHunkSeparatorSlotName, type ChangeContent, type ContextContent } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { describe, expect, it } from "vitest";
import {
  applyHiddenContextToFileDiff,
  getHiddenContextSeparatorSlots,
  type RenderedFileDiff,
} from "./file-diff-utils";

function createFileDiff(): FileDiffMetadata {
  return {
    name: "src/example.ts",
    type: "change",
    hunks: [
      {
        collapsedBefore: 2,
        additionStart: 5,
        additionCount: 2,
        additionLines: 2,
        additionLineIndex: 0,
        deletionStart: 5,
        deletionCount: 2,
        deletionLines: 2,
        deletionLineIndex: 0,
        hunkContent: [
          {
            type: "change",
            additions: 2,
            additionLineIndex: 0,
            deletions: 2,
            deletionLineIndex: 0
          } satisfies ChangeContent
        ],
        splitLineStart: 0,
        splitLineCount: 2,
        unifiedLineStart: 0,
        unifiedLineCount: 2,
        noEOFCRAdditions: false,
        noEOFCRDeletions: false
      },
      {
        collapsedBefore: 1,
        additionStart: 10,
        additionCount: 2,
        additionLines: 1,
        additionLineIndex: 2,
        deletionStart: 10,
        deletionCount: 2,
        deletionLines: 1,
        deletionLineIndex: 2,
        hunkContent: [
          {
            type: "context",
            lines: 1,
            additionLineIndex: 2,
            deletionLineIndex: 2
          } satisfies ContextContent,
          {
            type: "change",
            additions: 1,
            additionLineIndex: 3,
            deletions: 1,
            deletionLineIndex: 3
          } satisfies ChangeContent
        ],
        splitLineStart: 4,
        splitLineCount: 2,
        unifiedLineStart: 4,
        unifiedLineCount: 2,
        noEOFCRAdditions: false,
        noEOFCRDeletions: false
      }
    ],
    splitLineCount: 6,
    unifiedLineCount: 6,
    isPartial: true,
    deletionLines: ["base-5", "base-6", "base-10", "base-11"],
    additionLines: ["base-5", "base-6", "base-10", "base-11"]
  };
}

function createFileDiffWithThreeLineGap(): FileDiffMetadata {
  return {
    name: "src/example.ts",
    type: "change",
    hunks: [
      {
        collapsedBefore: 2,
        additionStart: 5,
        additionCount: 2,
        additionLines: 2,
        additionLineIndex: 0,
        deletionStart: 5,
        deletionCount: 2,
        deletionLines: 2,
        deletionLineIndex: 0,
        hunkContent: [
          {
            type: "change",
            additions: 2,
            additionLineIndex: 0,
            deletions: 2,
            deletionLineIndex: 0
          } satisfies ChangeContent
        ],
        splitLineStart: 0,
        splitLineCount: 2,
        unifiedLineStart: 0,
        unifiedLineCount: 2,
        noEOFCRAdditions: false,
        noEOFCRDeletions: false
      },
      {
        collapsedBefore: 3,
        additionStart: 10,
        additionCount: 2,
        additionLines: 1,
        additionLineIndex: 7,
        deletionStart: 10,
        deletionCount: 2,
        deletionLines: 1,
        deletionLineIndex: 7,
        hunkContent: [
          {
            type: "context",
            lines: 1,
            additionLineIndex: 7,
            deletionLineIndex: 7
          } satisfies ContextContent,
          {
            type: "change",
            additions: 1,
            additionLineIndex: 8,
            deletions: 1,
            deletionLineIndex: 8
          } satisfies ChangeContent
        ],
        splitLineStart: 7,
        splitLineCount: 2,
        unifiedLineStart: 7,
        unifiedLineCount: 2,
        noEOFCRAdditions: false,
        noEOFCRDeletions: false
      }
    ],
    splitLineCount: 9,
    unifiedLineCount: 11,
    isPartial: false,
    deletionLines: [
      "pre-3",
      "pre-4",
      "base-5",
      "base-6",
      "between-7",
      "between-8",
      "between-9",
      "base-10",
      "base-11"
    ],
    additionLines: [
      "pre-3",
      "pre-4",
      "base-5",
      "base-6",
      "between-7",
      "between-8",
      "between-9",
      "base-10",
      "base-11"
    ]
  };
}

describe("getHiddenContextSeparatorSlots", () => {
  it("creates one separator per hidden region for unified diffs", () => {
    const { slots, trailingHiddenContext } = getHiddenContextSeparatorSlots(
      createFileDiff(),
      "unified"
    );

    expect(slots).toEqual([
      {
        slotName: getHunkSeparatorSlotName("unified", 0),
        hunkIndex: 0,
        lines: 2,
        type: "unified",
        expandActions: [
          {
            anchorLine: 4,
            direction: "before"
          }
        ]
      },
      {
        slotName: getHunkSeparatorSlotName("unified", 1),
        hunkIndex: 1,
        lines: 1,
        type: "unified",
        expandActions: [
          {
            anchorLine: 7,
            direction: "after"
          },
          {
            anchorLine: 9,
            direction: "before"
          }
        ]
      }
    ]);
    expect(trailingHiddenContext).toBeNull();
  });

  it("creates paired separators for split diffs", () => {
    const { slots, trailingHiddenContext } = getHiddenContextSeparatorSlots(
      createFileDiff(),
      "split"
    );

    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => slot.type)).toEqual([
      "deletions",
      "additions",
      "deletions",
      "additions"
    ]);
    expect(slots[0]?.slotName).toBe(getHunkSeparatorSlotName("deletions", 0));
    expect(slots[3]?.slotName).toBe(getHunkSeparatorSlotName("additions", 1));
    expect(trailingHiddenContext).toBeNull();
  });

  it("returns trailing hidden context for rendered file diffs", () => {
    const { slots, trailingHiddenContext } = getHiddenContextSeparatorSlots(
      {
        ...createFileDiff(),
        trailingHiddenLines: 3
      },
      "unified"
    );

    expect(slots).toHaveLength(2);
    expect(trailingHiddenContext).toEqual({
      hunkIndex: 2,
      lines: 3,
      type: "unified",
      expandActions: [
        {
          anchorLine: 12,
          direction: "after"
        }
      ]
    });
  });
});

describe("applyHiddenContextToFileDiff", () => {
  it("appends visible context after the last hunk", () => {
    const baseFileDiff = createFileDiff();

    const nextFileDiff = applyHiddenContextToFileDiff(baseFileDiff, {
      hunkIndex: 2,
      direction: "after",
      lines: ["after-12", "after-13", "after-14"]
    });

    expect(baseFileDiff.additionLines).toEqual(["base-5", "base-6", "base-10", "base-11"]);
    expect(baseFileDiff.deletionLines).toEqual(baseFileDiff.additionLines);

    expect(nextFileDiff.additionLines).toEqual([
      "base-5",
      "base-6",
      "base-10",
      "base-11",
      "after-12",
      "after-13",
      "after-14"
    ]);
    expect(nextFileDiff.deletionLines).toEqual(nextFileDiff.additionLines);
    expect(nextFileDiff.splitLineCount).toBe(9);
    expect(nextFileDiff.unifiedLineCount).toBe(9);

    expect(nextFileDiff.hunks[1]).toMatchObject({
      additionLineIndex: 2,
      deletionLineIndex: 2,
      additionCount: 5,
      deletionCount: 5,
      splitLineCount: 5,
      unifiedLineCount: 5
    });
    expect(nextFileDiff.hunks[1]?.hunkContent).toEqual([
      {
        type: "context",
        lines: 1,
        additionLineIndex: 2,
        deletionLineIndex: 2
      },
      {
        type: "change",
        additions: 1,
        additionLineIndex: 3,
        deletions: 1,
        deletionLineIndex: 3
      },
      {
        type: "context",
        lines: 3,
        additionLineIndex: 4,
        deletionLineIndex: 4
      }
    ]);
  });

  it("expands visible context before the target hunk and after the last hunk without mutating the base diff", () => {
    const baseFileDiff = createFileDiff();

    const nextFileDiff = applyHiddenContextToFileDiff(
      applyHiddenContextToFileDiff(baseFileDiff, {
        hunkIndex: 0,
        direction: "before",
        lines: ["ignore-me", "before-3", "before-4"]
      }),
      {
        hunkIndex: 2,
        direction: "after",
        lines: ["after-12", "after-13", "after-14"]
      }
    );

    expect(baseFileDiff.additionLines).toEqual(["base-5", "base-6", "base-10", "base-11"]);
    expect(baseFileDiff.hunks[0]?.collapsedBefore).toBe(2);

    expect(nextFileDiff.additionLines).toEqual([
      "before-3",
      "before-4",
      "base-5",
      "base-6",
      "base-10",
      "base-11",
      "after-12",
      "after-13",
      "after-14"
    ]);
    expect(nextFileDiff.deletionLines).toEqual(nextFileDiff.additionLines);

    expect(nextFileDiff.hunks[0]).toMatchObject({
      collapsedBefore: 0,
      additionStart: 3,
      deletionStart: 3,
      additionCount: 4,
      deletionCount: 4,
      splitLineStart: -2,
      unifiedLineStart: -2
    });
    expect(nextFileDiff.hunks[0]?.hunkContent[0]).toEqual({
      type: "context",
      lines: 2,
      additionLineIndex: 0,
      deletionLineIndex: 0
    });

    expect(nextFileDiff.hunks[1]).toMatchObject({
      additionLineIndex: 4,
      deletionLineIndex: 4,
      additionCount: 5,
      deletionCount: 5
    });
    expect(nextFileDiff.hunks[1]?.hunkContent).toEqual([
      {
        type: "context",
        lines: 1,
        additionLineIndex: 4,
        deletionLineIndex: 4
      },
      {
        type: "change",
        additions: 1,
        additionLineIndex: 5,
        deletions: 1,
        deletionLineIndex: 5
      },
      {
        type: "context",
        lines: 3,
        additionLineIndex: 6,
        deletionLineIndex: 6
      }
    ]);
  });

  it("merges newly expanded lines into an existing leading context block", () => {
    const nextFileDiff = applyHiddenContextToFileDiff(createFileDiff(), {
      hunkIndex: 1,
      direction: "before",
      lines: ["before-9"]
    });

    expect(nextFileDiff.additionLines).toEqual([
      "base-5",
      "base-6",
      "before-9",
      "base-10",
      "base-11"
    ]);
    expect(nextFileDiff.hunks[1]).toMatchObject({
      collapsedBefore: 0,
      additionStart: 9,
      deletionStart: 9,
      additionCount: 3,
      deletionCount: 3,
      splitLineStart: 3,
      unifiedLineStart: 3
    });
    expect(nextFileDiff.hunks[1]?.hunkContent[0]).toEqual({
      type: "context",
      lines: 2,
      additionLineIndex: 2,
      deletionLineIndex: 2
    });
  });

  it("expands visible context after the previous hunk for intermediate gaps", () => {
    const nextFileDiff = applyHiddenContextToFileDiff(createFileDiffWithThreeLineGap(), {
      hunkIndex: 1,
      direction: "after",
      lines: ["between-7", "between-8"]
    });

    expect(nextFileDiff.additionLines).toEqual([
      "pre-3",
      "pre-4",
      "base-5",
      "base-6",
      "between-7",
      "between-8",
      "between-9",
      "base-10",
      "base-11"
    ]);
    expect(nextFileDiff.deletionLines).toEqual(nextFileDiff.additionLines);

    expect(nextFileDiff.hunks[0]).toMatchObject({
      additionCount: 4,
      deletionCount: 4,
      splitLineCount: 4,
      unifiedLineCount: 4
    });
    expect(nextFileDiff.hunks[0]?.hunkContent.at(-1)).toEqual({
      type: "context",
      lines: 2,
      additionLineIndex: 2,
      deletionLineIndex: 2
    });

    expect(nextFileDiff.hunks[1]).toMatchObject({
      collapsedBefore: 1,
      additionLineIndex: 7,
      deletionLineIndex: 7,
      splitLineStart: 9,
      unifiedLineStart: 9
    });
    expect(nextFileDiff.hunks[1]?.hunkContent[0]).toEqual({
      type: "context",
      lines: 1,
      additionLineIndex: 7,
      deletionLineIndex: 7
    });
  });

  it("keeps adjacent hunks separate even when hidden context fills the entire gap", () => {
    const nextFileDiff = applyHiddenContextToFileDiff(createFileDiffWithThreeLineGap(), {
      hunkIndex: 1,
      direction: "before",
      lines: [
        "between-7",
        "between-8",
        "between-9"
      ]
    });

    expect(nextFileDiff.additionLines).toEqual([
      "pre-3",
      "pre-4",
      "base-5",
      "base-6",
      "between-7",
      "between-8",
      "between-9",
      "base-10",
      "base-11"
    ]);
    expect(nextFileDiff.deletionLines).toEqual(nextFileDiff.additionLines);
    expect(nextFileDiff.splitLineCount).toBe(12);
    expect(nextFileDiff.unifiedLineCount).toBe(14);

    expect(nextFileDiff.hunks).toHaveLength(2);
    expect(nextFileDiff.hunks[1]).toMatchObject({
      collapsedBefore: 0,
      additionStart: 7,
      deletionStart: 7,
      additionLineIndex: 4,
      deletionLineIndex: 4,
      additionCount: 5,
      deletionCount: 5,
      splitLineStart: 4,
      unifiedLineStart: 4
    });
    expect(nextFileDiff.hunks[1]?.hunkContent).toEqual([
      {
        type: "context",
        lines: 4,
        additionLineIndex: 4,
        deletionLineIndex: 4
      },
      {
        type: "change",
        additions: 1,
        additionLineIndex: 8,
        deletions: 1,
        deletionLineIndex: 8
      }
    ]);
  });

  it("preserves extra metadata on extended file diff types", () => {
    const baseFileDiff: RenderedFileDiff = {
      ...createFileDiff(),
      trailingHiddenLines: 3
    };

    const nextFileDiff = applyHiddenContextToFileDiff(baseFileDiff, {
      hunkIndex: 2,
      direction: "after",
      lines: ["after-12"]
    });

    expect(nextFileDiff.trailingHiddenLines).toBe(3);
  });
});
