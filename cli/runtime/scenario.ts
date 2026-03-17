import {
  createCliOutput,
  printUsage,
  type PromptFunction,
  type SpinnerFactory,
  type SpinnerLike
} from "../output.ts";

class MemoryStream {
  isTTY: boolean;
  sink: string[];
  merged: Array<{ channel: string; text: string }>;
  channel: string;

  constructor(
    isTTY: boolean,
    sink: string[],
    merged: Array<{ channel: string; text: string }>,
    channel: string
  ) {
    this.isTTY = isTTY;
    this.sink = sink;
    this.merged = merged;
    this.channel = channel;
  }

  write(chunk: string): boolean {
    const text = String(chunk);
    this.sink.push(text);
    this.merged.push({ channel: this.channel, text });
    return true;
  }
}

class ScenarioInput {
  isTTY: boolean;
  mode: string;
  handlers: Set<(chunk: string) => void>;

  constructor(isTTY: boolean, mode: string) {
    this.isTTY = isTTY;
    this.mode = mode;
    this.handlers = new Set();
  }

  on(event: "data", handler: (chunk: string) => void): ScenarioInput {
    if (event === "data") {
      this.handlers.add(handler);
    }

    return this;
  }

  off(event: "data", handler: (chunk: string) => void): ScenarioInput {
    if (event === "data") {
      this.handlers.delete(handler);
    }

    return this;
  }

  pause(): void {}

  resume(): void {
    if (this.mode === "immediate-enter") {
      queueMicrotask(() => {
        for (const handler of this.handlers) {
          handler("\n");
        }
      });
    }
  }
}

type Scenario = {
  stdoutIsTTY?: boolean;
  stdinIsTTY?: boolean;
  enterMode?: string;
  promptSelection?: string | null;
  browserOpened?: boolean;
  repoMappings?: Record<string, string>;
  launcherConfig?: Record<string, unknown>;
  currentRepository?: {
    repositoryPath: string;
    repository: { owner: string; repo: string };
  };
  mappedRepository?: {
    repositoryPath: string;
    repository: { owner: string; repo: string };
  };
  repositoryError?: unknown;
  providerError?: unknown;
  resolvedProvider?: string;
  serverError?: unknown;
  lookupError?: unknown;
  triggerError?: unknown;
  server?: {
    port?: number;
    reused?: boolean;
  };
  analysis?: {
    lookupStates?: Array<{
      ok?: boolean;
      analysis: { provider: string; completedAt: string } | null;
      repository?: { hasMapping: boolean; path: string | null; error: string | null };
      providers?: Record<string, { available: boolean; reason: string | null }>;
      job: {
        id?: string;
        status?: string;
        progressMessage?: string | null;
        error?: string | null;
      } | null;
    }>;
    existingAnalysis?: { provider: string; completedAt: string } | null;
    job?: {
      id?: string;
      status?: string;
      progressMessage?: string | null;
      error?: string | null;
    } | null;
    triggerJob?: {
      id?: string;
      status?: string;
    };
    delayMs?: number;
    updates?: ReadonlyArray<{
      job?: {
        id?: string;
        status?: string;
        progressMessage?: string | null;
        error?: string | null;
      };
    }>;
    finalState?: {
      ok?: boolean;
      analysis: { provider: string; completedAt: string } | null;
      repository?: { hasMapping: boolean; path: string | null; error: string | null };
      providers?: Record<string, { available: boolean; reason: string | null }>;
      job: {
        id?: string;
        status?: string;
        progressMessage?: string | null;
        error?: string | null;
      } | null;
    };
    pendingUntilStopped?: boolean;
  };
  spinnerFactory?: SpinnerFactory;
  prompt?: PromptFunction;
};

type ScenarioOverrides = {
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
};

export function createScenarioDeps(scenario: Scenario = {}, overrides: ScenarioOverrides = {}) {
  const stdoutLog: string[] = [];
  const stderrLog: string[] = [];
  const mergedLog: Array<{ channel: string; text: string }> = [];
  const useRealStdout = Boolean(overrides.stdout);
  const useRealStderr = Boolean(overrides.stderr);
  const useRealStdin = Boolean(overrides.stdin);
  const stdout =
    overrides.stdout ??
    new MemoryStream(scenario.stdoutIsTTY ?? false, stdoutLog, mergedLog, "stdout");
  const stderr =
    overrides.stderr ??
    new MemoryStream(false, stderrLog, mergedLog, "stderr");
  const stdin =
    overrides.stdin ??
    new ScenarioInput(
      scenario.stdinIsTTY ?? Boolean(scenario.stdoutIsTTY),
      scenario.enterMode ?? "never"
    );

  const output = createCliOutput({
    stdout,
    stderr,
    stdin,
    stdoutIsTTY:
      scenario.stdoutIsTTY ??
      (useRealStdout ? Boolean(overrides.stdout?.isTTY) : false),
    stdinIsTTY:
      scenario.stdinIsTTY ??
      (useRealStdin ? Boolean(overrides.stdin?.isTTY && overrides.stdout?.isTTY) : Boolean(scenario.stdoutIsTTY)),
    spinnerFactory:
      scenario.spinnerFactory ??
      (useRealStdout
        ? undefined
        : ((config) => {
            const spinner: SpinnerLike = {
              text: config.text,
              start() {
                stdout.write(`[spinner:start] ${config.text}\n`);
                return spinner;
              },
              succeed(message?: string) {
                stdout.write(`[spinner:done] ${message}\n`);
              },
              warn(message?: string) {
                stderr.write(`[spinner:warn] ${message}\n`);
              },
              fail(message?: string) {
                stderr.write(`[spinner:fail] ${message}\n`);
              },
              stop() {
                stdout.write("[spinner:stop]\n");
              }
            };

            return spinner;
          })),
    prompt:
      scenario.prompt ??
      (async () => ({ provider: scenario.promptSelection ?? undefined }))
  });

  const state = {
    lookupCalls: 0,
    writes: {
      settings: null as unknown,
      launcher: null as unknown
    }
  };

  const lookupStates = scenario.analysis?.lookupStates ?? [];

  const deps = {
    output,
    printUsage,
    storage: {
      async ensureStorageRoot(): Promise<void> {},
      async readSettings(): Promise<{
        repoMappings: Record<string, string>;
        launcher: Record<string, unknown>;
      }> {
        return {
          repoMappings: scenario.repoMappings ?? {
            "owner/repo": "/tmp/owner-repo"
          },
          launcher: scenario.launcherConfig ?? {}
        };
      },
      async writeSettings(settings: unknown): Promise<void> {
        state.writes.settings = settings;
      },
      async readLauncherConfig(): Promise<Record<string, unknown>> {
        return scenario.launcherConfig ?? {};
      },
      async writeLauncherConfig(config: unknown): Promise<void> {
        state.writes.launcher = config;
      }
    },
    repository: {
      async resolveRepository(): Promise<{
        repositoryPath: string;
        repository: { owner: string; repo: string };
      }> {
        if (scenario.repositoryError) {
          throw scenario.repositoryError;
        }

        return (
          scenario.currentRepository ??
          scenario.mappedRepository ?? {
            repositoryPath: "/tmp/owner-repo",
            repository: { owner: "owner", repo: "repo" }
          }
        );
      }
    },
    provider: {
      async resolveProvider(requestedProvider: string | null): Promise<string> {
        if (scenario.providerError) {
          throw scenario.providerError;
        }

        return requestedProvider ?? scenario.resolvedProvider ?? scenario.promptSelection ?? "codex";
      }
    },
    server: {
      async ensureServerInstance(preferredPort: number): Promise<{
        pid: number;
        port: number;
        startedAt: string;
        reused: boolean;
      }> {
        if (scenario.serverError) {
          throw scenario.serverError;
        }

        return {
          pid: 12345,
          port: scenario.server?.port ?? preferredPort ?? 1973,
          startedAt: "2026-03-18T00:00:00.000Z",
          reused: scenario.server?.reused ?? true
        };
      }
    },
    analysis: {
      async lookupPullRequestAnalysis(): Promise<{
        analysis: { provider: string; completedAt: string } | null;
        job: {
          id?: string;
          status?: string;
          progressMessage?: string | null;
          error?: string | null;
        } | null;
      }> {
        if (scenario.lookupError) {
          throw scenario.lookupError;
        }

        const next =
          lookupStates[Math.min(state.lookupCalls, Math.max(lookupStates.length - 1, 0))] ??
          {
            ok: true,
            analysis: scenario.analysis?.existingAnalysis ?? null,
            repository: { hasMapping: true, path: "/tmp/owner-repo", error: null },
            providers: {
              codex: { available: true, reason: null },
              claude: { available: true, reason: null }
            },
            job: scenario.analysis?.job ?? null
          };

        state.lookupCalls += 1;
        return {
          analysis: next.analysis,
          job: next.job
        };
      },
      async triggerAnalysis(): Promise<{ id?: string; status?: string }> {
        if (scenario.triggerError) {
          throw scenario.triggerError;
        }

        return (
          scenario.analysis?.triggerJob ?? {
            id: "job-1",
            status: "queued"
          }
        );
      },
      async waitForAnalysisCompletion(input: {
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
        onUpdate?(job: {
          id?: string;
          status?: string;
          progressMessage?: string | null;
          error?: string | null;
        }): void;
      }): Promise<{
        analysis: { provider: string; completedAt: string } | null;
        job: {
          id?: string;
          status?: string;
          progressMessage?: string | null;
          error?: string | null;
        } | null;
      }> {
        const updates = scenario.analysis?.updates ?? [];
        const delayMs = scenario.analysis?.delayMs ?? 0;

        if (delayMs > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, delayMs);
          });
        }

        for (const update of updates) {
          if (input.shouldStop?.()) {
            return input.initialState;
          }

          if (update.job) {
            input.onUpdate?.(update.job);
          }
        }

        if (scenario.analysis?.pendingUntilStopped) {
          while (!input.shouldStop?.()) {
            await new Promise((resolve) => {
              setTimeout(resolve, 0);
            });
          }

          return input.initialState;
        }

        return scenario.analysis?.finalState ?? input.initialState;
      }
    },
    browser: {
      async openUrl(url: string): Promise<boolean> {
        stdout.write(`[open] ${url}\n`);
        return scenario.browserOpened ?? true;
      }
    }
  };

  return {
    ...deps,
    inspect() {
      return {
        stdout: stdoutLog.join(""),
        stderr: stderrLog.join(""),
        transcript: mergedLog.map((entry) => entry.text).join(""),
        state
      };
    }
  };
}
