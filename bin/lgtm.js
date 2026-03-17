#!/usr/bin/env -S node --experimental-strip-types

import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

if (!process.execArgv.includes("--experimental-strip-types")) {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      stdio: "inherit"
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
} else {
  const { createNodeCliDependencies, runCli } = await import("../cli/index.ts");
  const exitCode = await runCli(process.argv.slice(2), createNodeCliDependencies());
  process.exit(exitCode);
}
