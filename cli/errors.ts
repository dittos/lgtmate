export class CliError extends Error {
  exitCode: number;
  showUsage: boolean;

  constructor(message: string, options: { exitCode?: number; showUsage?: boolean } = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? 1;
    this.showUsage = options.showUsage ?? false;
  }
}

export function toErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallback;
}
