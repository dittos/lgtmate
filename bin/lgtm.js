#!/usr/bin/env node

import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_PROVIDER = "codex";
const DEFAULT_PORT = 1973;
const SERVER_START_TIMEOUT_MS = 20000;
const HEALTH_POLL_INTERVAL_MS = 250;
const ANALYSIS_POLL_INTERVAL_MS = 1000;
const INTERACTIVE_OUTPUT = Boolean(process.stdout.isTTY);
const INTERACTIVE_PROMPTS = Boolean(process.stdin.isTTY && process.stdout.isTTY);

const VALID_PROVIDERS = new Set(["codex", "claude"]);

let activeSpinner = null;

function formatPrefix(label, color = chalk.blueBright) {
  return color(`[${label}]`);
}

function logInfo(message) {
  console.log(`${formatPrefix("lgtm")} ${message}`);
}

function logSuccess(message) {
  console.log(`${formatPrefix("done", chalk.green)} ${message}`);
}

function logWarn(message) {
  console.warn(`${formatPrefix("warn", chalk.yellow)} ${message}`);
}

function logError(message) {
  console.error(`${formatPrefix("error", chalk.red)} ${message}`);
}

function printKeyValue(label, value) {
  console.log(`${chalk.bold(`${label}:`)} ${value}`);
}

function printSpacer() {
  console.log("");
}

function formatEnterToOpenHint() {
  return chalk.dim("Press Enter to open in the browser before analysis completes.");
}

function formatWaitingForAnalysisText(prNumber, progress = null) {
  const base = progress
    ? `Waiting for analysis on PR #${prNumber} - ${progress}`
    : `Waiting for analysis on PR #${prNumber}`;

  if (!INTERACTIVE_PROMPTS) {
    return base;
  }

  return `${base}\n${formatEnterToOpenHint()}`;
}

function createStatusReporter(text) {
  if (INTERACTIVE_OUTPUT) {
    const spinner = ora({
      text,
      discardStdin: false
    }).start();
    activeSpinner = spinner;

    return {
      update(nextText) {
        spinner.text = nextText;
      },
      succeed(message = spinner.text) {
        spinner.succeed(message);
        if (activeSpinner === spinner) {
          activeSpinner = null;
        }
      },
      warn(message = spinner.text) {
        spinner.warn(message);
        if (activeSpinner === spinner) {
          activeSpinner = null;
        }
      },
      fail(message = spinner.text) {
        spinner.fail(message);
        if (activeSpinner === spinner) {
          activeSpinner = null;
        }
      },
      stop() {
        spinner.stop();
        if (activeSpinner === spinner) {
          activeSpinner = null;
        }
      }
    };
  }

  let currentText = text;
  let didPrintStart = false;

  const printStart = () => {
    if (!didPrintStart) {
      logInfo(currentText);
      didPrintStart = true;
    }
  };

  return {
    update(nextText) {
      if (nextText !== currentText) {
        currentText = nextText;
        logInfo(currentText);
        didPrintStart = true;
      }
    },
    succeed(message = currentText) {
      printStart();
      logSuccess(message);
    },
    warn(message = currentText) {
      printStart();
      logWarn(message);
    },
    fail(message = currentText) {
      printStart();
      logError(message);
    },
    stop() {}
  };
}

function printUsage() {
  console.error(
    `${chalk.bold("Usage:")} lgtm [owner/]repo <pr-number> [--provider codex|claude] [--port <number>] [--no-open]`
  );
  console.error(
    "       lgtm <pr-number> [--provider codex|claude] [--port <number>] [--no-open]"
  );
}

function fail(message) {
  if (activeSpinner) {
    activeSpinner.stop();
    activeSpinner = null;
  }

  logError(message);
  process.exit(1);
}

function parseArgs(argv) {
  const positionals = [];
  let provider = null;
  let port = null;
  let openBrowser = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--provider") {
      const value = argv[index + 1];

      if (!value || !VALID_PROVIDERS.has(value)) {
        fail("`--provider` must be followed by `codex` or `claude`.");
      }

      provider = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      const value = arg.slice("--provider=".length);

      if (!VALID_PROVIDERS.has(value)) {
        fail("`--provider` must be `codex` or `claude`.");
      }

      provider = value;
      continue;
    }

    if (arg === "--port") {
      const value = Number(argv[index + 1]);

      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        fail("`--port` must be followed by a valid port number.");
      }

      port = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      const value = Number(arg.slice("--port=".length));

      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        fail("`--port` must be a valid port number.");
      }

      port = value;
      continue;
    }

    if (arg === "--no-open") {
      openBrowser = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals.length === 0 || positionals.length > 2) {
    printUsage();
    process.exit(1);
  }

  if (positionals.length === 1) {
    return {
      repositoryRef: null,
      prNumber: parsePullRequestNumber(positionals[0]),
      provider,
      port,
      openBrowser
    };
  }

  return {
    repositoryRef: parseRepositoryReference(positionals[0]),
    prNumber: parsePullRequestNumber(positionals[1]),
    provider,
    port,
    openBrowser
  };
}

function parsePullRequestNumber(value) {
  const normalized = value.trim().replace(/^#/, "");
  const number = Number(normalized);

  if (!Number.isInteger(number) || number <= 0) {
    fail(`Invalid pull request number: ${value}`);
  }

  return number;
}

function parseRepositoryReference(value) {
  const normalized = value.trim().replace(/^github\.com\//i, "").replace(/^\/+|\/+$/g, "");

  if (!normalized) {
    fail(`Invalid repository reference: ${value}`);
  }

  const segments = normalized.split("/");

  if (
    segments.length > 2 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    fail(`Invalid repository reference: ${value}`);
  }

  if (segments.length === 1) {
    return { owner: null, repo: segments[0] };
  }

  return { owner: segments[0], repo: segments[1] };
}

function getAppRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function getStorageRoot() {
  return path.join(os.homedir(), ".lgtmate");
}

function getSettingsPath() {
  return path.join(getStorageRoot(), "settings.json");
}

function getServerInstancePath() {
  return path.join(getStorageRoot(), "server-instance.json");
}

async function ensureStorageRoot() {
  await mkdir(getStorageRoot(), { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readSettings() {
  const settings = await readJsonFile(getSettingsPath(), {});
  return {
    repoMappings:
      settings.repoMappings && typeof settings.repoMappings === "object"
        ? settings.repoMappings
        : {},
    launcher:
      settings.launcher && typeof settings.launcher === "object"
        ? settings.launcher
        : {}
  };
}

async function writeSettings(settings) {
  await writeJsonFile(getSettingsPath(), settings);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          stderr.trim() || stdout.trim() || `Command failed with exit code ${code}`
        )
      );
    });
  });
}

async function getGitRepositoryRoot() {
  const { stdout } = await runCommand("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

function normalizeGithubRemote(remote) {
  const trimmed = remote.trim().replace(/\.git$/, "");
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i);

  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2]
    };
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);

  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2]
    };
  }

  return null;
}

async function getGithubRepository(repositoryPath) {
  const { stdout } = await runCommand(
    "git",
    ["-C", repositoryPath, "remote", "get-url", "origin"]
  );
  const repository = normalizeGithubRemote(stdout);

  if (!repository) {
    fail("`origin` is not a supported GitHub remote.");
  }

  return repository;
}

async function registerRepositoryMapping(owner, repo, repositoryPath) {
  const settings = await readSettings();
  const repositoryKey = `${owner}/${repo}`.toLowerCase();

  await writeSettings({
    ...settings,
    repoMappings: {
      ...settings.repoMappings,
      [repositoryKey]: repositoryPath
    }
  });
}

function normalizeRepositoryKey(value) {
  return value.trim().toLowerCase();
}

async function resolveMappedRepository(repositoryRef) {
  const settings = await readSettings();
  const entries = Object.entries(settings.repoMappings);

  if (entries.length === 0) {
    fail("No local clone mappings are configured. Run `lgtm <pr-number>` inside a clone first.");
  }

  if (repositoryRef.owner) {
    const repositoryKey = normalizeRepositoryKey(`${repositoryRef.owner}/${repositoryRef.repo}`);
    const repositoryPath = settings.repoMappings[repositoryKey];

    if (!repositoryPath) {
      fail(`No local clone mapping found for ${repositoryRef.owner}/${repositoryRef.repo}.`);
    }

    const repository = await getGithubRepository(repositoryPath);
    return { repositoryPath, repository };
  }

  const requestedRepo = normalizeRepositoryKey(repositoryRef.repo);
  const matches = entries.filter(([repositoryKey]) => {
    const [, mappedRepo = ""] = repositoryKey.split("/");
    return mappedRepo === requestedRepo;
  });

  if (matches.length === 0) {
    fail(`No local clone mapping found for ${repositoryRef.repo}.`);
  }

  if (matches.length > 1) {
    const choices = matches.map(([repositoryKey]) => repositoryKey).sort();
    fail(
      `Repository name \`${repositoryRef.repo}\` is ambiguous. Use one of: ${choices.join(", ")}`
    );
  }

  const [, repositoryPath] = matches[0];
  const repository = await getGithubRepository(repositoryPath);
  return { repositoryPath, repository };
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });

    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function isHealthcheckReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealthcheck(port, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isHealthcheckReady(port)) {
      return true;
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  return false;
}

async function findOpenPort(preferredPort) {
  if (!(await isPortOpen(preferredPort))) {
    return preferredPort;
  }

  for (let candidate = preferredPort + 1; candidate < preferredPort + 100; candidate += 1) {
    if (!(await isPortOpen(candidate))) {
      return candidate;
    }
  }

  fail(`No free port found near ${preferredPort}.`);
}

async function readServerInstance() {
  return readJsonFile(getServerInstancePath(), null);
}

async function clearServerInstance() {
  await rm(getServerInstancePath(), { force: true });
}

async function readLauncherConfig() {
  const settings = await readSettings();
  return settings.launcher;
}

async function writeLauncherConfig(config) {
  const settings = await readSettings();
  await writeSettings({
    ...settings,
    launcher: config
  });
}

async function ensureServerInstance(preferredPort) {
  const existing = await readServerInstance();

  if (existing && Number.isInteger(existing.pid) && Number.isInteger(existing.port)) {
    if (isProcessAlive(existing.pid)) {
      if (await isHealthcheckReady(existing.port)) {
        return { ...existing, reused: true };
      }

      if (await waitForHealthcheck(existing.port, 5000)) {
        return { ...existing, reused: true };
      }
    }

    await clearServerInstance();
  }

  const port = await findOpenPort(preferredPort ?? DEFAULT_PORT);
  const appRoot = getAppRoot();
  const command = process.platform === "win32" ? "npm.cmd" : "npm";

  try {
    await access(path.join(appRoot, "package.json"));
  } catch {
    fail(`Could not locate lgtmate app root at ${appRoot}.`);
  }

  const child = spawn(
    command,
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: appRoot,
      detached: true,
      stdio: "ignore",
      env: process.env
    }
  );

  child.unref();

  const instance = {
    pid: child.pid,
    port,
    startedAt: new Date().toISOString()
  };

  await writeJsonFile(getServerInstancePath(), instance);

  const ready = await waitForHealthcheck(port, SERVER_START_TIMEOUT_MS);

  if (!ready) {
    await clearServerInstance();
    fail(`Timed out waiting for the local server on port ${port}.`);
  }

  return { ...instance, reused: false };
}

async function triggerAnalysis({ owner, repo, prNumber, provider, port }) {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/analyzer/pull-requests/${owner}/${repo}/${prNumber}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ provider, forceRefresh: true })
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    const message = payload?.error || `Analysis request failed with status ${response.status}`;
    fail(message);
  }

  return payload.job;
}

async function lookupPullRequestAnalysis({ owner, repo, prNumber, port }) {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/analyzer/pull-requests/${owner}/${repo}/${prNumber}`
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    const message = payload?.error || `Analysis lookup failed with status ${response.status}`;
    fail(message);
  }

  return payload;
}

function formatAnalysisProgress(job) {
  const parts = [];

  if (job?.status) {
    parts.push(`status: ${job.status}`);
  }

  if (job?.progressMessage) {
    parts.push(job.progressMessage);
  }

  return parts.join(" - ");
}

async function waitForAnalysisCompletion({
  owner,
  repo,
  prNumber,
  port,
  initialState,
  shouldStop,
  onUpdate
}) {
  let latestState = initialState;
  let lastStatusLine = null;

  while (true) {
    if (shouldStop?.()) {
      return latestState;
    }

    if (latestState.analysis) {
      return latestState;
    }

    const currentJob = latestState.job;

    if (currentJob) {
      const currentStatusLine = formatAnalysisProgress(currentJob);

      if (currentStatusLine && currentStatusLine !== lastStatusLine) {
        lastStatusLine = currentStatusLine;
        onUpdate?.(currentJob);
      }

      if (currentJob.status === "failed" || currentJob.status === "cancelled") {
        return latestState;
      }
    }

    await sleep(ANALYSIS_POLL_INTERVAL_MS);

    if (shouldStop?.()) {
      return latestState;
    }

    latestState = await lookupPullRequestAnalysis({ owner, repo, prNumber, port });
  }
}

function waitForEnterToOpen(url) {
  if (!process.stdin.isTTY) {
    return {
      promise: new Promise(() => {}),
      cleanup() {}
    };
  }

  let settled = false;
  let handleData = null;

  const cleanup = () => {
    if (handleData) {
      process.stdin.off("data", handleData);
    }

    process.stdin.pause();
  };

  const promise = new Promise((resolve) => {
    handleData = async (chunk) => {
      const text = chunk.toString();

      if (!text.includes("\n") && !text.includes("\r")) {
        return;
      }

      cleanup();
      settled = true;
      logInfo("Opening browser before analysis completes.");
      resolve(await openUrl(url));
    };

    process.stdin.on("data", handleData);
    process.stdin.resume();
  });

  return {
    promise,
    cleanup() {
      if (!settled) {
        cleanup();
      }
    }
  };
}

async function isExecutableAvailable(command) {
  try {
    await runCommand("bash", ["-lc", `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

async function chooseProviderInteractively(providers) {
  if (!INTERACTIVE_PROMPTS) {
    return null;
  }

  const response = await prompts(
    {
      type: "select",
      name: "provider",
      message: "Choose default analyzer provider",
      choices: providers.map((provider) => ({
        title: provider === DEFAULT_PROVIDER ? `${provider} (default)` : provider,
        value: provider
      })),
      initial: Math.max(
        providers.findIndex((provider) => provider === DEFAULT_PROVIDER),
        0
      )
    },
    {
      onCancel: () => true
    }
  );

  if (typeof response.provider === "string") {
    return response.provider;
  }

  return null;
}

async function resolveProvider(requestedProvider) {
  if (requestedProvider) {
    return requestedProvider;
  }

  const availableProviders = [];

  for (const candidate of ["codex", "claude"]) {
    if (await isExecutableAvailable(candidate)) {
      availableProviders.push(candidate);
    }
  }

  if (availableProviders.length === 0) {
    fail("No supported analyzer provider is available on this machine.");
  }

  const config = await readLauncherConfig();
  const savedProvider = config.defaultProvider;

  if (typeof savedProvider === "string" && availableProviders.includes(savedProvider)) {
    return savedProvider;
  }

  if (availableProviders.length === 1) {
    await writeLauncherConfig({
      ...config,
      defaultProvider: availableProviders[0]
    });
    return availableProviders[0];
  }

  const chosenProvider = await chooseProviderInteractively(availableProviders);

  if (chosenProvider) {
    await writeLauncherConfig({
      ...config,
      defaultProvider: chosenProvider
    });
    return chosenProvider;
  }

  if (availableProviders.includes(DEFAULT_PROVIDER)) {
    return DEFAULT_PROVIDER;
  }

  return availableProviders[0];
}

async function openUrl(url) {
  function spawnDetached(command, args) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore"
      });

      child.once("error", () => {
        resolve(false);
      });

      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    });
  }

  function isWsl() {
    return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
  }

  async function findFirstAvailableCommand(commands) {
    for (const command of commands) {
      if (await isExecutableAvailable(command)) {
        return command;
      }
    }

    return null;
  }

  if (process.platform === "darwin") {
    return spawnDetached("open", [url]);
  }

  if (process.platform === "win32") {
    return spawnDetached("cmd", ["/c", "start", "", url]);
  }

  if (isWsl()) {
    const wslBrowserCommand = await findFirstAvailableCommand([
      "wslview",
      "cmd.exe",
      "powershell.exe"
    ]);

    if (wslBrowserCommand === "wslview") {
      return spawnDetached("wslview", [url]);
    }

    if (wslBrowserCommand === "cmd.exe") {
      return spawnDetached("cmd.exe", ["/c", "start", "", url]);
    }

    if (wslBrowserCommand === "powershell.exe") {
      return spawnDetached("powershell.exe", ["-NoProfile", "-Command", "Start-Process", url]);
    }
  }

  const openedWithXdg = await spawnDetached("xdg-open", [url]);

  if (openedWithXdg) {
    return true;
  }

  return false;
}

async function main() {
  const { repositoryRef, prNumber, provider, port, openBrowser } = parseArgs(
    process.argv.slice(2)
  );

  await ensureStorageRoot();

  const { repository } = repositoryRef
    ? await resolveMappedRepository(repositoryRef)
    : await (async () => {
        const repositoryPath = await getGitRepositoryRoot().catch((error) => {
          fail(error instanceof Error ? error.message : "Current directory is not a git repository.");
        });
        const resolvedRepository = await getGithubRepository(repositoryPath);

        await registerRepositoryMapping(
          resolvedRepository.owner,
          resolvedRepository.repo,
          repositoryPath
        );

        return {
          repositoryPath,
          repository: resolvedRepository
        };
      })();

  const serverStatus = createStatusReporter("Checking local lgtmate server");
  const server = await ensureServerInstance(port);
  serverStatus.succeed(
    server.reused
      ? `Server ready on ${chalk.bold(`http://127.0.0.1:${server.port}`)}`
      : `Server started on ${chalk.bold(`http://127.0.0.1:${server.port}`)}`
  );

  const analysisLookup = await lookupPullRequestAnalysis({
    owner: repository.owner,
    repo: repository.repo,
    prNumber,
    port: server.port
  });

  let selectedProvider = null;
  let job = null;

  if (!analysisLookup.analysis) {
    selectedProvider = await resolveProvider(provider);

    const analysisStartStatus = createStatusReporter(`Starting analysis with ${selectedProvider}`);
    job = await triggerAnalysis({
      owner: repository.owner,
      repo: repository.repo,
      prNumber,
      provider: selectedProvider,
      port: server.port
    });
    analysisStartStatus.succeed(
      `Analysis started with ${chalk.bold(selectedProvider)}`
    );
  }

  const url = `http://127.0.0.1:${server.port}/${repository.owner}/${repository.repo}/pull/${prNumber}`;

  printSpacer();
  printKeyValue(
    "Repository / PR",
    `${chalk.bold(`${repository.owner}/${repository.repo}`)} ${chalk.dim("/")} ${chalk.bold(`#${prNumber}`)}`
  );

  if (analysisLookup.analysis) {
    printKeyValue(
      "Analysis",
      `existing ${chalk.bold(analysisLookup.analysis.provider)} result from ${analysisLookup.analysis.completedAt}`
    );
  } else if (job && selectedProvider) {
    printKeyValue("Provider", chalk.bold(selectedProvider));
    printKeyValue("Analysis Job", `${chalk.bold(job.id)} (${job.status})`);
  }
  printSpacer();

  if (!openBrowser) {
    return;
  }

  if (analysisLookup.analysis) {
    const openReporter = createStatusReporter("Opening browser");
    const opened = await openUrl(url);

    if (opened) {
      openReporter.succeed(`Opened ${chalk.underline(url)}`);
      return;
    }

    openReporter.fail("Could not open browser automatically");
    logError(`could not open browser automatically. Open ${url}`);
    return;
  }

  const enterToOpen = waitForEnterToOpen(url);
  let stopWaitingForAnalysis = false;

  const waitReporter = createStatusReporter(formatWaitingForAnalysisText(prNumber));
  const winner = await Promise.race([
    enterToOpen.promise.then((opened) => ({
      type: "manual",
      opened
    })),
    waitForAnalysisCompletion({
      owner: repository.owner,
      repo: repository.repo,
      prNumber,
      port: server.port,
      initialState: { ...analysisLookup, job },
      shouldStop: () => stopWaitingForAnalysis,
      onUpdate: (currentJob) => {
        const progress = formatAnalysisProgress(currentJob);

        if (progress) {
          waitReporter.update(formatWaitingForAnalysisText(prNumber, progress));
        }
      }
    }).then((finalState) => ({
      type: "analysis",
      finalState
    }))
  ]);

  if (winner.type === "manual") {
    stopWaitingForAnalysis = true;
    waitReporter.succeed("Browser opened before analysis completed");
    const openReporter = createStatusReporter("Opening browser");

    if (winner.opened) {
      openReporter.succeed(`Opened ${chalk.underline(url)}`);
      return;
    }

    openReporter.fail("Could not open browser automatically");
    logError(`could not open browser automatically. Open ${url}`);
    return;
  }

  enterToOpen.cleanup();

  if (winner.finalState.analysis) {
    waitReporter.succeed("Analysis complete");
    logInfo("Opening browser after analysis completed.");
  } else if (winner.finalState.job?.status === "failed") {
    waitReporter.fail(`Analysis failed: ${winner.finalState.job.error ?? "Unknown error"}`);
    logWarn("Opening browser with the failed analysis state.");
  } else if (winner.finalState.job?.status === "cancelled") {
    waitReporter.warn(`Analysis cancelled: ${winner.finalState.job.error ?? "Cancelled"}`);
    logWarn("Opening browser with the cancelled analysis state.");
  } else {
    waitReporter.stop();
  }

  const openReporter = createStatusReporter("Opening browser");
  const opened = await openUrl(url);

  if (opened) {
    openReporter.succeed(`Opened ${chalk.underline(url)}`);
    return;
  }

  openReporter.fail("Could not open browser automatically");
  logError(`could not open browser automatically. Open ${url}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
