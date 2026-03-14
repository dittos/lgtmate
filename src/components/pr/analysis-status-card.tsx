import { AlertCircle, Bot, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  AnalyzePullRequestResult,
  AnalyzerProviderAvailability,
  AnalyzerProvider
} from "@/lib/analyzer";

function formatCompletedAt(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AnalysisStatusCard({
  provider,
  onProviderChange,
  providerAvailability,
  repositoryError,
  hasMapping,
  analysis,
  isOutdated,
  isLoading,
  error,
  onAnalyze
}: {
  provider: AnalyzerProvider;
  onProviderChange: (provider: AnalyzerProvider) => void;
  providerAvailability: Record<AnalyzerProvider, AnalyzerProviderAvailability>;
  repositoryError: string | null;
  hasMapping: boolean;
  analysis: AnalyzePullRequestResult | null;
  isOutdated: boolean;
  isLoading: boolean;
  error: string | null;
  onAnalyze: () => void;
}) {
  const providerState = providerAvailability[provider];
  const canAnalyze = hasMapping && !repositoryError && providerState.available && !isLoading;

  return (
    <section className="rounded-[28px] border border-border/70 bg-card/85 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-zinc-400">
            <Bot className="size-3.5" />
            AI Analysis
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em]">
            PR-level review summary
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Provider</span>
            <select
              className="bg-transparent font-medium outline-none"
              value={provider}
              onChange={(event) => onProviderChange(event.target.value as AnalyzerProvider)}
              disabled={isLoading}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <Button type="button" onClick={onAnalyze} disabled={!canAnalyze}>
            {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {analysis ? "Re-analyze" : "Analyze"}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        {repositoryError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            {repositoryError}
          </div>
        ) : null}
        {!providerState.available ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            {providerState.reason}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            {error}
          </div>
        ) : null}
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Analyzing pull request in an isolated worktree...
          </div>
        ) : null}
        {analysis ? (
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1">
              {analysis.provider} / {analysis.model}
            </span>
            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1">
              {formatCompletedAt(analysis.completedAt)}
            </span>
            {isOutdated ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
                <AlertCircle className="size-3" />
                Outdated
              </span>
            ) : null}
          </div>
        ) : null}
        {!analysis && !isLoading && !error && !repositoryError && providerState.available ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-muted-foreground">
            No cached analysis yet. Run the analyzer to generate a PR summary from the local clone.
          </div>
        ) : null}
      </div>
    </section>
  );
}
