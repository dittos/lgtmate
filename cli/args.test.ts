import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "./args.ts";

test("parseArgs accepts a full GitHub pull request URL", () => {
  assert.deepEqual(parseArgs(["https://github.com/mastodon/mastodon/pull/38107"]), {
    kind: "run",
    repositoryRef: {
      owner: "mastodon",
      repo: "mastodon"
    },
    prNumber: 38107,
    provider: null,
    port: 1973,
    openBrowser: true
  });
});

test("parseArgs accepts a full GitHub pull request URL with query params", () => {
  assert.deepEqual(
    parseArgs(["https://github.com/mastodon/mastodon/pull/38107?diff=split"]),
    {
      kind: "run",
      repositoryRef: {
        owner: "mastodon",
        repo: "mastodon"
      },
      prNumber: 38107,
      provider: null,
      port: 1973,
      openBrowser: true
    }
  );
});

test("parseArgs accepts a full GitHub pull request URL with extra path segments", () => {
  assert.deepEqual(parseArgs(["https://github.com/mastodon/mastodon/pull/38107/changes"]), {
    kind: "run",
    repositoryRef: {
      owner: "mastodon",
      repo: "mastodon"
    },
    prNumber: 38107,
    provider: null,
    port: 1973,
    openBrowser: true
  });
});

test("parseArgs keeps supporting a plain PR number", () => {
  assert.deepEqual(parseArgs(["38107"]), {
    kind: "run",
    repositoryRef: null,
    prNumber: 38107,
    provider: null,
    port: 1973,
    openBrowser: true
  });
});
