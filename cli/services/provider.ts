import { DEFAULT_PROVIDER } from "../constants.ts";
import { CliError } from "../errors.ts";
import type { CliOutput } from "../output.ts";

type LauncherConfig = {
  defaultProvider?: string;
  [key: string]: unknown;
};

export function createProviderService(deps: {
  storage: {
    readLauncherConfig(): Promise<LauncherConfig>;
    writeLauncherConfig(config: LauncherConfig): Promise<void>;
  };
  output: CliOutput;
  isExecutableAvailable(command: string): Promise<boolean>;
}) {
  return {
    async resolveProvider(requestedProvider: string | null): Promise<string> {
      if (requestedProvider) {
        return requestedProvider;
      }

      const availableProviders: string[] = [];

      for (const candidate of ["codex", "claude"]) {
        if (await deps.isExecutableAvailable(candidate)) {
          availableProviders.push(candidate);
        }
      }

      if (availableProviders.length === 0) {
        throw new CliError("No supported analyzer provider is available on this machine.");
      }

      const config = await deps.storage.readLauncherConfig();
      const savedProvider = config.defaultProvider;

      if (typeof savedProvider === "string" && availableProviders.includes(savedProvider)) {
        return savedProvider;
      }

      if (availableProviders.length === 1) {
        await deps.storage.writeLauncherConfig({
          ...config,
          defaultProvider: availableProviders[0]
        });
        return availableProviders[0];
      }

      const chosenProvider = await deps.output.chooseProvider(
        availableProviders,
        DEFAULT_PROVIDER
      );

      if (chosenProvider) {
        await deps.storage.writeLauncherConfig({
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
  };
}
