import type { AnalyzerProvider, AnalyzerProviderAvailability } from "./types";
import { runCommand } from "./process";
import { ClaudePullRequestAnalyzer } from "./providers/claude";
import { CodexPullRequestAnalyzer } from "./providers/codex";

async function isExecutableAvailable(command: string) {
  try {
    await runCommand("bash", ["-lc", `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

export async function getAnalyzerProviderAvailability(): Promise<
  Record<AnalyzerProvider, AnalyzerProviderAvailability>
> {
  const [hasCodex, hasClaude] = await Promise.all([
    isExecutableAvailable("codex"),
    isExecutableAvailable("claude")
  ]);

  return {
    codex: {
      available: hasCodex,
      reason: hasCodex ? null : "The Codex CLI is not available in this environment."
    },
    claude: {
      available: hasClaude,
      reason: hasClaude ? null : "The Claude CLI is not available in this environment."
    }
  };
}

export async function createAnalyzer(provider: AnalyzerProvider) {
  const availability = await getAnalyzerProviderAvailability();
  const providerAvailability = availability[provider];

  if (!providerAvailability.available) {
    throw new Error(providerAvailability.reason ?? "The analyzer provider is not available.");
  }

  if (provider === "codex") {
    return new CodexPullRequestAnalyzer();
  }

  return new ClaudePullRequestAnalyzer();
}
