import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "../constants.ts";
import { CliError } from "../errors.ts";
import { createCliOutput, printUsage } from "../output.ts";
import { createProviderService } from "../services/provider.ts";
import { createRepositoryService } from "../services/repository.ts";
import { formatAnalysisProgress } from "../state.ts";

const SERVER_START_TIMEOUT_MS = 20000;
const HEALTH_POLL_INTERVAL_MS = 250;
const ANALYSIS_POLL_INTERVAL_MS = 1000;

type JsonValue = Record<string, unknown> | null;

function getAppRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function getStorageRoot(): string {
  return path.join(os.homedir(), ".lgtmate");
}

function getSettingsPath(): string {
  return path.join(getStorageRoot(), "settings.json");
}

function getServerInstancePath(): string {
  return path.join(getStorageRoot(), "server-instance.json");
}

async function readJsonFile(filePath: string, fallback: JsonValue): Promise<JsonValue> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as JsonValue;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string }> {
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

async function getGitRepositoryRoot(): Promise<string> {
  const { stdout } = await runCommand("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

function normalizeGithubRemote(remote: string): { owner: string; repo: string } | null {
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

async function getGithubRepository(repositoryPath: string): Promise<{ owner: string; repo: string }> {
  const { stdout } = await runCommand(
    "git",
    ["-C", repositoryPath, "remote", "get-url", "origin"]
  );
  const repository = normalizeGithubRemote(stdout);

  if (!repository) {
    throw new CliError("`origin` is not a supported GitHub remote.");
  }

  return repository;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isPortOpen(port: number): Promise<boolean> {
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

async function isHealthcheckReady(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealthcheck(port: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isHealthcheckReady(port)) {
      return true;
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  return false;
}

async function findOpenPort(preferredPort: number): Promise<number> {
  if (!(await isPortOpen(preferredPort))) {
    return preferredPort;
  }

  for (let candidate = preferredPort + 1; candidate < preferredPort + 100; candidate += 1) {
    if (!(await isPortOpen(candidate))) {
      return candidate;
    }
  }

  throw new CliError(`No free port found near ${preferredPort}.`);
}

function createStorage() {
  return {
    async ensureStorageRoot(): Promise<void> {
      await mkdir(getStorageRoot(), { recursive: true });
    },
    async readSettings(): Promise<{
      repoMappings: Record<string, string>;
      launcher: Record<string, unknown>;
    }> {
      const settings = ((await readJsonFile(getSettingsPath(), {})) ?? {}) as Record<string, unknown>;
      return {
        repoMappings:
          settings.repoMappings && typeof settings.repoMappings === "object"
            ? (settings.repoMappings as Record<string, string>)
            : {},
        launcher:
          settings.launcher && typeof settings.launcher === "object"
            ? (settings.launcher as Record<string, unknown>)
            : {}
      };
    },
    async writeSettings(settings: {
      repoMappings: Record<string, string>;
      launcher: Record<string, unknown>;
    }): Promise<void> {
      await writeJsonFile(getSettingsPath(), settings);
    },
    async readLauncherConfig(): Promise<Record<string, unknown>> {
      const settings = await this.readSettings();
      return settings.launcher;
    },
    async writeLauncherConfig(config: Record<string, unknown>): Promise<void> {
      const settings = await this.readSettings();
      await this.writeSettings({
        ...settings,
        launcher: config
      });
    },
    async readServerInstance(): Promise<{ pid: number; port: number; startedAt: string } | null> {
      return (await readJsonFile(getServerInstancePath(), null)) as {
        pid: number;
        port: number;
        startedAt: string;
      } | null;
    },
    async writeServerInstance(instance: { pid: number; port: number; startedAt: string }): Promise<void> {
      await writeJsonFile(getServerInstancePath(), instance);
    },
    async clearServerInstance(): Promise<void> {
      await rm(getServerInstancePath(), { force: true });
    }
  };
}

function createServerService(storage: ReturnType<typeof createStorage>) {
  return {
    async findReusableServerInstance(): Promise<{
      pid: number;
      port: number;
      startedAt: string;
    } | null> {
      const existing = await storage.readServerInstance();

      if (existing && Number.isInteger(existing.pid) && Number.isInteger(existing.port)) {
        if (isProcessAlive(existing.pid)) {
          if (await isHealthcheckReady(existing.port)) {
            return existing;
          }

          if (await waitForHealthcheck(existing.port, 5000)) {
            return existing;
          }
        }

        await storage.clearServerInstance();
      }

      return null;
    },
    async startServer(preferredPort = DEFAULT_PORT): Promise<{
      pid: number;
      port: number;
      startedAt: string;
    }> {
      const existing = await this.findReusableServerInstance();

      if (existing) {
        return existing;
      }

      const port = await findOpenPort(preferredPort);
      const appRoot = getAppRoot();
      const command = process.platform === "win32" ? "npm.cmd" : "npm";

      try {
        await access(path.join(appRoot, "package.json"));
      } catch {
        throw new CliError(`Could not locate lgtmate app root at ${appRoot}.`);
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
        pid: child.pid ?? 0,
        port,
        startedAt: new Date().toISOString()
      };

      await storage.writeServerInstance(instance);

      const ready = await waitForHealthcheck(port, SERVER_START_TIMEOUT_MS);

      if (!ready) {
        await storage.clearServerInstance();
        throw new CliError(`Timed out waiting for the local server on port ${port}.`);
      }

      return instance;
    }
  };
}

function createAnalysisService() {
  async function lookupPullRequestAnalysis(input: {
    owner: string;
    repo: string;
    prNumber: number;
    port: number;
  }): Promise<{
    analysis: { provider: string; completedAt: string } | null;
    job: {
      id?: string;
      status?: string;
      progressMessage?: string | null;
      error?: string | null;
    } | null;
  }> {
    const response = await fetch(
      `http://127.0.0.1:${input.port}/api/analyzer/pull-requests/${input.owner}/${input.repo}/${input.prNumber}`
    );

    const payload = await response.json().catch(() => null) as
      | { ok?: boolean; error?: string; analysis?: { provider: string; completedAt: string } | null; job?: Record<string, unknown> | null }
      | null;

    if (!response.ok || !payload?.ok) {
      const message = payload?.error || `Analysis lookup failed with status ${response.status}`;
      throw new CliError(message);
    }

    return {
      analysis: payload.analysis ?? null,
      job: (payload.job as {
        id?: string;
        status?: string;
        progressMessage?: string | null;
        error?: string | null;
      } | null) ?? null
    };
  }

  return {
    lookupPullRequestAnalysis,
    async triggerAnalysis(input: {
      owner: string;
      repo: string;
      prNumber: number;
      provider: string;
      port: number;
    }): Promise<{ id?: string; status?: string }> {
      const response = await fetch(
        `http://127.0.0.1:${input.port}/api/analyzer/pull-requests/${input.owner}/${input.repo}/${input.prNumber}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ provider: input.provider, forceRefresh: true })
        }
      );

      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; error?: string; job?: { id?: string; status?: string } }
        | null;

      if (!response.ok || !payload?.ok) {
        const message = payload?.error || `Analysis request failed with status ${response.status}`;
        throw new CliError(message);
      }

      return payload.job ?? {};
    },
    async waitForAnalysisCompletion(input: {
      owner: string;
      repo: string;
      prNumber: number;
      port: number;
      initialState: {
        analysis: { provider: string; completedAt: string } | null;
        job: {
          id?: string;
          status?: string;
          progressMessage?: string | null;
          error?: string | null;
        } | null;
      };
      shouldStop(): boolean;
      onUpdate?(job: { status?: string; progressMessage?: string | null }): void;
    }): Promise<{
      analysis: { provider: string; completedAt: string } | null;
      job: {
        id?: string;
        status?: string;
        progressMessage?: string | null;
        error?: string | null;
      } | null;
    }> {
      let latestState = input.initialState;
      let lastStatusLine: string | null = null;

      while (true) {
        if (input.shouldStop?.()) {
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
            input.onUpdate?.(currentJob);
          }

          if (currentJob.status === "failed" || currentJob.status === "cancelled") {
            return latestState;
          }
        }

        await sleep(ANALYSIS_POLL_INTERVAL_MS);

        if (input.shouldStop?.()) {
          return latestState;
        }

        latestState = await lookupPullRequestAnalysis(input);
      }
    }
  };
}

function createBrowserService() {
  function spawnDetached(command: string, args: string[]): Promise<boolean> {
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

  function isWsl(): boolean {
    return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
  }

  async function isExecutableAvailable(command: string): Promise<boolean> {
    try {
      await runCommand("bash", ["-lc", `command -v ${command}`]);
      return true;
    } catch {
      return false;
    }
  }

  async function findFirstAvailableCommand(commands: string[]): Promise<string | null> {
    for (const command of commands) {
      if (await isExecutableAvailable(command)) {
        return command;
      }
    }

    return null;
  }

  return {
    isExecutableAvailable,
    async openUrl(url: string): Promise<boolean> {
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
  };
}

export function createNodeCliDependencies() {
  const output = createCliOutput();
  const storage = createStorage();
  const browser = createBrowserService();
  const repository = createRepositoryService({
    storage,
    getGitRepositoryRoot,
    getGithubRepository
  });
  const provider = createProviderService({
    storage,
    output,
    isExecutableAvailable: browser.isExecutableAvailable
  });

  return {
    output,
    printUsage,
    storage,
    repository,
    provider,
    server: createServerService(storage),
    analysis: createAnalysisService(),
    browser
  };
}
