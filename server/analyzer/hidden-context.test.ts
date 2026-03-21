import test from "node:test";
import assert from "node:assert/strict";
import { getHiddenContextWindow, splitFileLines } from "./hidden-context";

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
    totalLines: 200,
    lines: [],
    hasMoreAbove: true,
    hasMoreBelow: true,
    remainingAbove: 79,
    remainingBelow: 80
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
    totalLines: 200,
    lines: [],
    hasMoreAbove: true,
    hasMoreBelow: true,
    remainingAbove: 79,
    remainingBelow: 100
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
    totalLines: 200,
    lines: [],
    hasMoreAbove: true,
    hasMoreBelow: true,
    remainingAbove: 99,
    remainingBelow: 80
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
    totalLines: 50,
    lines: [],
    hasMoreAbove: false,
    hasMoreBelow: true,
    remainingAbove: 0,
    remainingBelow: 27
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
    totalLines: 50,
    lines: [],
    hasMoreAbove: true,
    hasMoreBelow: false,
    remainingAbove: 27,
    remainingBelow: 0
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

test("splitFileLines preserves line separators", () => {
  assert.deepEqual(splitFileLines("alpha\r\nbeta\ngamma\rdelta"), [
    "alpha\r\n",
    "beta\n",
    "gamma\r",
    "delta"
  ]);
});
