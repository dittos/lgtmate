import test from "node:test";
import assert from "node:assert/strict";
import { getHiddenContextWindow } from "./hidden-context.ts";

test("returns a symmetric 20-line window around the anchor", () => {
  const result = getHiddenContextWindow({
    totalLines: 200,
    anchorLine: 100,
    direction: "both",
    lineCount: 20
  });

  assert.deepEqual(result, {
    startLine: 80,
    endLine: 120,
    lines: [],
    hasMoreAbove: true,
    hasMoreBelow: true
  });
});

test("returns only lines before the anchor when direction is before", () => {
  const result = getHiddenContextWindow({
    totalLines: 200,
    anchorLine: 100,
    direction: "before",
    lineCount: 20
  });

  assert.deepEqual(result, {
    startLine: 80,
    endLine: 100,
    lines: [],
    hasMoreAbove: true,
    hasMoreBelow: true
  });
});

test("returns only lines after the anchor when direction is after", () => {
  const result = getHiddenContextWindow({
    totalLines: 200,
    anchorLine: 100,
    direction: "after",
    lineCount: 20
  });

  assert.deepEqual(result, {
    startLine: 100,
    endLine: 120,
    lines: [],
    hasMoreAbove: true,
    hasMoreBelow: true
  });
});

test("clamps the range at the start of the file", () => {
  const result = getHiddenContextWindow({
    totalLines: 50,
    anchorLine: 3,
    direction: "both",
    lineCount: 20
  });

  assert.deepEqual(result, {
    startLine: 1,
    endLine: 23,
    lines: [],
    hasMoreAbove: false,
    hasMoreBelow: true
  });
});

test("clamps the range at the end of the file", () => {
  const result = getHiddenContextWindow({
    totalLines: 50,
    anchorLine: 48,
    direction: "both",
    lineCount: 20
  });

  assert.deepEqual(result, {
    startLine: 28,
    endLine: 50,
    lines: [],
    hasMoreAbove: true,
    hasMoreBelow: false
  });
});

test("rejects anchor lines outside the file", () => {
  assert.throws(
    () =>
      getHiddenContextWindow({
        totalLines: 10,
        anchorLine: 11,
        direction: "both",
        lineCount: 20
      }),
    /outside the file/
  );
});
