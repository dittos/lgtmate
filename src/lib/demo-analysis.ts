import type {
  AnalyzePullRequestResult,
  AnalyzerProvider,
  AnalyzerProviderAvailability
} from "./analyzer";

type BundledAnalysisResult = AnalyzePullRequestResult & {
  repository: {
    owner: string;
    repo: string;
  };
  number: number;
};

type BundledAnalysisModule = {
  default: BundledAnalysisResult;
};

type AnalysisSourceMode = "api" | "auto" | "bundled";

const bundledAnalysisModules = import.meta.glob<BundledAnalysisModule>(
  "../demo/analyses/**/*.json"
);

export const DEMO_PROVIDER_REASON = "Analysis is read-only in the public demo.";

export function isDemoProviderReason(reason: string | null | undefined) {
  return reason === DEMO_PROVIDER_REASON;
}

export function getAnalysisSourceMode(): AnalysisSourceMode {
  const configuredMode = import.meta.env.VITE_ANALYSIS_SOURCE;

  if (
    configuredMode === "api" ||
    configuredMode === "auto" ||
    configuredMode === "bundled"
  ) {
    return configuredMode;
  }

  return "api";
}

export function getBundledAnalysisAvailability(): Record<
  AnalyzerProvider,
  AnalyzerProviderAvailability
> {
  return {
    codex: { available: false, reason: DEMO_PROVIDER_REASON },
    claude: { available: false, reason: DEMO_PROVIDER_REASON }
  };
}

export const BUNDLED_ANALYSIS_REPOSITORY_STATE = {
  hasMapping: false,
  path: null,
  error: null
} as const;

export async function loadBundledAnalysis(
  owner: string,
  repo: string,
  number: number
) {
  const modulePath = `../demo/analyses/${owner}/${repo}/${number}/analysis.json`;
  const loader = bundledAnalysisModules[modulePath];

  if (!loader) {
    return null;
  }

  const imported = await loader();
  return imported.default;
}
