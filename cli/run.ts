import chalk from "chalk";
import { parseArgs } from "./args.ts";
import { CliError, toErrorMessage } from "./errors.ts";
import type { CliOutput } from "./output.ts";
import { formatAnalysisProgress } from "./state.ts";

type Repository = {
  owner: string;
  repo: string;
};

type AnalysisState = {
  analysis: {
    provider: string;
    completedAt: string;
  } | null;
  job: {
    id?: string;
    status?: string;
    progressMessage?: string | null;
    error?: string | null;
  } | null;
};

type CliDeps = {
  output: CliOutput;
  printUsage(output?: { write(chunk: string): boolean }): void;
  storage: {
    ensureStorageRoot(): Promise<void>;
  };
  repository: {
    resolveRepository(
      repositoryRef: { owner: string | null; repo: string } | null
    ): Promise<{ repositoryPath: string; repository: Repository }>;
  };
  provider: {
    resolveProvider(requestedProvider: string | null): Promise<string>;
  };
  server: {
    findReusableServerInstance(): Promise<{
      pid: number;
      port: number;
      startedAt: string;
    } | null>;
    startServer(preferredPort: number): Promise<{
      pid: number;
      port: number;
      startedAt: string;
    }>;
  };
  analysis: {
    lookupPullRequestAnalysis(input: {
      owner: string;
      repo: string;
      prNumber: number;
      port: number;
    }): Promise<AnalysisState>;
    triggerAnalysis(input: {
      owner: string;
      repo: string;
      prNumber: number;
      provider: string;
      port: number;
    }): Promise<{ id?: string; status?: string }>;
    waitForAnalysisCompletion(input: {
      owner: string;
      repo: string;
      prNumber: number;
      port: number;
      initialState: AnalysisState;
      shouldStop(): boolean;
      onUpdate?(job: { status?: string; progressMessage?: string | null }): void;
    }): Promise<AnalysisState>;
  };
  browser: {
    openUrl(url: string): Promise<boolean>;
  };
};

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  try {
    const parsed = parseArgs(argv);

    if (parsed.kind === "help") {
      deps.printUsage(deps.output.stderr);
      return 0;
    }

    const runArgs = parsed;

    let repository!: Repository;
    let repositoryPath = "";
    let server!: { pid: number; port: number; startedAt: string };
    let analysisLookup!: AnalysisState;
    let selectedProvider: string | null = null;
    let job: { id?: string; status?: string } | null = null;
    let analysisReporter: ReturnType<CliOutput["createStatusReporter"]> | null = null;

    function formatAnalysisStatus(provider: string, progress: string): string {
      const base = `Analysis with ${chalk.bold(provider)}: ${progress}`;

      if (!deps.output.isInteractivePrompts) {
        return base;
      }

      return `${base}\n\nPress Enter to open in the browser before analysis completes.`;
    }

    function printRepositoryHeader(): void {
      deps.output.info(
        `${chalk.bold(`${repository.owner}/${repository.repo}`)} ${chalk.dim(`(${repositoryPath})`)} ${chalk.bold(
          `#${runArgs.prNumber}`
        )}`
      );
    }

    async function loadRepository(): Promise<void> {
      await deps.storage.ensureStorageRoot();
      const resolved = await deps.repository.resolveRepository(runArgs.repositoryRef);
      repository = resolved.repository;
      repositoryPath = resolved.repositoryPath;
      printRepositoryHeader();
      deps.output.printSpacer();
    }

    async function ensureServer(): Promise<void> {
      const existingServer = await deps.server.findReusableServerInstance();

      if (existingServer) {
        server = existingServer;
        return;
      }

      server = await (async () => {
        const serverStatus = deps.output.createStatusReporter("Starting local lgtmate server");
        const startedServer = await deps.server.startServer(runArgs.port);
        serverStatus.succeed(`Server started on ${chalk.bold(`http://127.0.0.1:${startedServer.port}`)}`);
        return startedServer;
      })();
    }

    async function ensureAnalysis(): Promise<void> {
      analysisLookup = await deps.analysis.lookupPullRequestAnalysis({
        owner: repository.owner,
        repo: repository.repo,
        prNumber: runArgs.prNumber,
        port: server.port
      });

      if (analysisLookup.analysis) {
        const cachedMessage = `Analysis with ${chalk.bold(analysisLookup.analysis.provider)}: cached result from ${analysisLookup.analysis.completedAt}`;

        if (deps.output.isInteractiveOutput) {
          deps.output.createStatusReporter(cachedMessage).succeed(cachedMessage);
        } else {
          deps.output.success(cachedMessage);
        }

        return;
      }

      selectedProvider = await deps.provider.resolveProvider(runArgs.provider);
      job = await deps.analysis.triggerAnalysis({
        owner: repository.owner,
        repo: repository.repo,
        prNumber: runArgs.prNumber,
        provider: selectedProvider,
        port: server.port
      });
      const progress = formatAnalysisProgress(job) || (job?.status ?? "queued");
      analysisReporter = deps.output.createStatusReporter(formatAnalysisStatus(selectedProvider, progress));
    }

    async function waitForAnalysisBeforeOpening(url: string): Promise<number> {
      if (analysisLookup.analysis) {
        return openBrowser(url, deps);
      }

      const enterToOpen = deps.output.waitForEnter();
      let stopWaitingForAnalysis = false;

      const winner = await Promise.race([
        enterToOpen.promise.then(() => ({
          type: "manual" as const
        })),
        deps.analysis
          .waitForAnalysisCompletion({
            owner: repository.owner,
            repo: repository.repo,
            prNumber: runArgs.prNumber,
            port: server.port,
            initialState: { ...analysisLookup, job },
            shouldStop: () => stopWaitingForAnalysis,
            onUpdate: (currentJob) => {
              const progress = formatAnalysisProgress(currentJob);

              if (progress && analysisReporter && selectedProvider) {
                analysisReporter.update(formatAnalysisStatus(selectedProvider, progress));
              }
            }
          })
          .then((finalState) => ({
            type: "analysis" as const,
            finalState
          }))
      ]);

      if (winner.type === "manual") {
        stopWaitingForAnalysis = true;
        analysisReporter?.stop();
        return openBrowser(url, deps);
      }

      enterToOpen.cleanup();

      if (winner.finalState.analysis) {
        analysisReporter?.succeed(`Analysis with ${chalk.bold(winner.finalState.analysis.provider)}: completed`);
      } else if (winner.finalState.job?.status === "failed") {
        analysisReporter?.fail(
          `Analysis with ${chalk.bold(selectedProvider ?? "unknown")}: failed - ${winner.finalState.job.error ?? "Unknown error"}`
        );
      } else if (winner.finalState.job?.status === "cancelled") {
        analysisReporter?.warn(
          `Analysis with ${chalk.bold(selectedProvider ?? "unknown")}: cancelled - ${winner.finalState.job.error ?? "Cancelled"}`
        );
      } else {
        analysisReporter?.stop();
      }

      return openBrowser(url, deps);
    }

    await loadRepository();
    await ensureServer();
    await ensureAnalysis();

    if (!runArgs.openBrowser) {
      return 0;
    }

    const url = `http://127.0.0.1:${server.port}/${repository.owner}/${repository.repo}/pull/${runArgs.prNumber}`;
    return waitForAnalysisBeforeOpening(url);
  } catch (error) {
    deps.output.stopActiveSpinner();

    if (error instanceof CliError) {
      if (error.showUsage) {
        deps.printUsage(deps.output.stderr);
      }

      if (error.message) {
        deps.output.error(error.message);
      }

      return error.exitCode;
    }

    deps.output.error(toErrorMessage(error));
    return 1;
  }
}

async function openBrowser(url: string, deps: CliDeps): Promise<number> {
  deps.output.printSpacer();
  const opened = await deps.browser.openUrl(url);

  if (opened) {
    return 0;
  }

  deps.output.error(`could not open browser automatically. Open ${url}`);
  return 1;
}
