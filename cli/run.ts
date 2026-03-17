import chalk from "chalk";
import { parseArgs } from "./args.ts";
import { CliError, toErrorMessage } from "./errors.ts";
import type { CliOutput } from "./output.ts";
import { formatAnalysisProgress, formatWaitingForAnalysisText } from "./state.ts";

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
    ensureServerInstance(preferredPort: number): Promise<{
      pid: number;
      port: number;
      startedAt: string;
      reused: boolean;
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

    await deps.storage.ensureStorageRoot();

    const { repository } = await deps.repository.resolveRepository(parsed.repositoryRef);

    const serverStatus = deps.output.createStatusReporter("Checking local lgtmate server");
    const server = await deps.server.ensureServerInstance(parsed.port);
    serverStatus.succeed(
      server.reused
        ? `Server ready on ${chalk.bold(`http://127.0.0.1:${server.port}`)}`
        : `Server started on ${chalk.bold(`http://127.0.0.1:${server.port}`)}`
    );

    const analysisLookup = await deps.analysis.lookupPullRequestAnalysis({
      owner: repository.owner,
      repo: repository.repo,
      prNumber: parsed.prNumber,
      port: server.port
    });

    let selectedProvider: string | null = null;
    let job: { id?: string; status?: string } | null = null;

    if (!analysisLookup.analysis) {
      selectedProvider = await deps.provider.resolveProvider(parsed.provider);

      const analysisStartStatus = deps.output.createStatusReporter(
        `Starting analysis with ${selectedProvider}`
      );
      job = await deps.analysis.triggerAnalysis({
        owner: repository.owner,
        repo: repository.repo,
        prNumber: parsed.prNumber,
        provider: selectedProvider,
        port: server.port
      });
      analysisStartStatus.succeed(`Analysis started with ${chalk.bold(selectedProvider)}`);
    }

    const url = `http://127.0.0.1:${server.port}/${repository.owner}/${repository.repo}/pull/${parsed.prNumber}`;

    deps.output.printSpacer();
    deps.output.printKeyValue(
      "Repository / PR",
      `${chalk.bold(`${repository.owner}/${repository.repo}`)} ${chalk.dim("/")} ${chalk.bold(
        `#${parsed.prNumber}`
      )}`
    );

    if (analysisLookup.analysis) {
      deps.output.printKeyValue(
        "Analysis",
        `existing ${chalk.bold(analysisLookup.analysis.provider)} result from ${analysisLookup.analysis.completedAt}`
      );
    } else if (job && selectedProvider) {
      deps.output.printKeyValue("Provider", chalk.bold(selectedProvider));
      deps.output.printKeyValue("Analysis Job", `${chalk.bold(job.id ?? "unknown")} (${job.status ?? "queued"})`);
    }
    deps.output.printSpacer();

    if (!parsed.openBrowser) {
      return 0;
    }

    if (analysisLookup.analysis) {
      return openBrowser(url, deps);
    }

    const enterToOpen = deps.output.waitForEnter();
    let stopWaitingForAnalysis = false;

    const waitReporter = deps.output.createStatusReporter(
      formatWaitingForAnalysisText(
        parsed.prNumber,
        null,
        deps.output.isInteractivePrompts
      )
    );
    const winner = await Promise.race([
      enterToOpen.promise.then(() => ({
        type: "manual" as const
      })),
      deps.analysis
        .waitForAnalysisCompletion({
          owner: repository.owner,
          repo: repository.repo,
          prNumber: parsed.prNumber,
          port: server.port,
          initialState: { ...analysisLookup, job },
          shouldStop: () => stopWaitingForAnalysis,
          onUpdate: (currentJob) => {
            const progress = formatAnalysisProgress(currentJob);

            if (progress) {
              waitReporter.update(
                formatWaitingForAnalysisText(
                  parsed.prNumber,
                  progress,
                  deps.output.isInteractivePrompts
                )
              );
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
      waitReporter.succeed("Browser opened before analysis completed");
      deps.output.info("Opening browser before analysis completes.");
      return openBrowser(url, deps);
    }

    enterToOpen.cleanup();

    if (winner.finalState.analysis) {
      waitReporter.succeed("Analysis complete");
      deps.output.info("Opening browser after analysis completed.");
    } else if (winner.finalState.job?.status === "failed") {
      waitReporter.fail(`Analysis failed: ${winner.finalState.job.error ?? "Unknown error"}`);
      deps.output.warn("Opening browser with the failed analysis state.");
    } else if (winner.finalState.job?.status === "cancelled") {
      waitReporter.warn(`Analysis cancelled: ${winner.finalState.job.error ?? "Cancelled"}`);
      deps.output.warn("Opening browser with the cancelled analysis state.");
    } else {
      waitReporter.stop();
    }

    return openBrowser(url, deps);
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
  const openReporter = deps.output.createStatusReporter("Opening browser");
  const opened = await deps.browser.openUrl(url);

  if (opened) {
    openReporter.succeed(`Opened ${chalk.underline(url)}`);
    return 0;
  }

  openReporter.fail("Could not open browser automatically");
  deps.output.error(`could not open browser automatically. Open ${url}`);
  return 1;
}
