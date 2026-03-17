import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";

type PromptResult = {
  provider?: string;
};

export type PromptFunction = (
  questions: Record<string, unknown>,
  options?: Record<string, unknown>
) => Promise<PromptResult>;

export type SpinnerLike = {
  text: string;
  start(): SpinnerLike;
  succeed(message?: string): void;
  warn(message?: string): void;
  fail(message?: string): void;
  stop(): void;
};

export type SpinnerFactory = (config: { text: string; discardStdin: boolean }) => SpinnerLike;

type StreamLike = {
  isTTY?: boolean;
  write(chunk: string): boolean;
};

type InputLike = {
  isTTY?: boolean;
  on(event: "data", handler: (chunk: string | Buffer) => void): InputLike;
  off(event: "data", handler: (chunk: string | Buffer) => void): InputLike;
  pause(): void;
  resume(): void;
};

export type StatusReporter = {
  update(nextText: string): void;
  succeed(message?: string): void;
  warn(message?: string): void;
  fail(message?: string): void;
  stop(): void;
};

export type CliOutput = {
  stderr: StreamLike;
  stdout: StreamLike;
  isInteractiveOutput: boolean;
  isInteractivePrompts: boolean;
  stopActiveSpinner(): void;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  printKeyValue(label: string, value: string): void;
  printSpacer(): void;
  createStatusReporter(text: string): StatusReporter;
  chooseProvider(providers: string[], defaultProvider: string): Promise<string | null>;
  waitForEnter(): {
    promise: Promise<boolean>;
    cleanup(): void;
  };
};

function formatPrefix(label: string, color: (text: string) => string = chalk.blueBright): string {
  return color(`[${label}]`);
}

export function printUsage(output: StreamLike = process.stderr): void {
  output.write(
    `${chalk.bold("Usage:")} lgtm [owner/]repo <pr-number> [--provider codex|claude] [--port <number>] [--no-open]\n`
  );
  output.write(
    "       lgtm <pr-number> [--provider codex|claude] [--port <number>] [--no-open]\n"
  );
  output.write(
    "       lgtm https://github.com/<owner>/<repo>/pull/<pr-number> [--provider codex|claude] [--port <number>] [--no-open]\n"
  );
}

export function createCliOutput(options: {
  stdout?: StreamLike;
  stderr?: StreamLike;
  stdin?: InputLike;
  stdoutIsTTY?: boolean;
  stdinIsTTY?: boolean;
  prompt?: PromptFunction;
  spinnerFactory?: SpinnerFactory;
} = {}): CliOutput {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const stdin = options.stdin ?? process.stdin;
  const isInteractiveOutput = options.stdoutIsTTY ?? Boolean(stdout.isTTY);
  const isInteractivePrompts =
    options.stdinIsTTY ?? Boolean(stdin.isTTY && stdout.isTTY);
  const prompt = options.prompt ?? (prompts as unknown as PromptFunction);
  const spinnerFactory = options.spinnerFactory ?? ((config) => ora(config) as unknown as SpinnerLike);

  let activeSpinner: SpinnerLike | null = null;

  function stopActiveSpinner(): void {
    if (activeSpinner) {
      activeSpinner.stop();
      activeSpinner = null;
    }
  }

  function writeLine(stream: StreamLike, message: string): void {
    stream.write(`${message}\n`);
  }

  function info(message: string): void {
    writeLine(stdout, `${formatPrefix("lgtm")} ${message}`);
  }

  function success(message: string): void {
    writeLine(stdout, `${formatPrefix("done", chalk.green)} ${message}`);
  }

  function warn(message: string): void {
    writeLine(stderr, `${formatPrefix("warn", chalk.yellow)} ${message}`);
  }

  function error(message: string): void {
    writeLine(stderr, `${formatPrefix("error", chalk.red)} ${message}`);
  }

  function printKeyValue(label: string, value: string): void {
    writeLine(stdout, `${chalk.bold(`${label}:`)} ${value}`);
  }

  function printSpacer(): void {
    writeLine(stdout, "");
  }

  function createStatusReporter(text: string): StatusReporter {
    if (isInteractiveOutput) {
      const spinner = spinnerFactory({
        text,
        discardStdin: false
      }).start();
      activeSpinner = spinner;

      return {
        update(nextText: string) {
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

    const printStart = (): void => {
      if (!didPrintStart) {
        info(currentText);
        didPrintStart = true;
      }
    };

    return {
      update(nextText: string) {
        if (nextText !== currentText) {
          currentText = nextText;
          info(currentText);
          didPrintStart = true;
        }
      },
      succeed(message = currentText) {
        printStart();
        success(message);
      },
      warn(message = currentText) {
        printStart();
        warn(message);
      },
      fail(message = currentText) {
        printStart();
        error(message);
      },
      stop() {}
    };
  }

  async function chooseProvider(providers: string[], defaultProvider: string): Promise<string | null> {
    if (!isInteractivePrompts) {
      return null;
    }

    const response = await prompt(
      {
        type: "select",
        name: "provider",
        message: "Choose default analyzer provider",
        choices: providers.map((provider) => ({
          title: provider === defaultProvider ? `${provider} (default)` : provider,
          value: provider
        })),
        initial: Math.max(
          providers.findIndex((provider) => provider === defaultProvider),
          0
        )
      },
      {
        onCancel: () => true
      }
    );

    return typeof response.provider === "string" ? response.provider : null;
  }

  function waitForEnter(): { promise: Promise<boolean>; cleanup(): void } {
    if (!isInteractivePrompts) {
      return {
        promise: new Promise<boolean>(() => {}),
        cleanup() {}
      };
    }

    let settled = false;
    let handleData: ((chunk: string | Buffer) => void) | null = null;

    const cleanup = (): void => {
      if (handleData) {
        stdin.off("data", handleData);
      }

      stdin.pause();
    };

    const promise = new Promise<boolean>((resolve) => {
      handleData = (chunk) => {
        const text = chunk.toString();

        if (!text.includes("\n") && !text.includes("\r")) {
          return;
        }

        cleanup();
        settled = true;
        resolve(true);
      };

      stdin.on("data", handleData);
      stdin.resume();
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

  return {
    stderr,
    stdout,
    isInteractiveOutput,
    isInteractivePrompts,
    stopActiveSpinner,
    info,
    success,
    warn,
    error,
    printKeyValue,
    printSpacer,
    createStatusReporter,
    chooseProvider,
    waitForEnter
  };
}
