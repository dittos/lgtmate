import type { ReactNode } from "react";
import { AlertCircle, ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useAnalysisController,
  useAnalysisControllerSelector
} from "@/lib/analysis-controller";
import type { AnalyzerProvider } from "@/lib/analyzer";

function getProviderLabel(provider: AnalyzerProvider) {
  return provider === "codex" ? "Codex" : "Claude";
}

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

export function PrAnalysisPanel({
  owner,
  repo,
  number,
  provider,
  pullRequestHeadOid,
  onAnalyze
}: {
  owner: string;
  repo: string;
  number: number;
  provider: AnalyzerProvider;
  pullRequestHeadOid: string;
  onAnalyze: (provider: AnalyzerProvider) => void;
}) {
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const controller = useAnalysisController({ owner, repo, number, provider });
  const providerAvailability = useAnalysisControllerSelector(
    controller,
    (state) => state.providers
  );
  const repositoryError = useAnalysisControllerSelector(
    controller,
    (state) => state.repository.error
  );
  const hasMapping = useAnalysisControllerSelector(
    controller,
    (state) => state.repository.hasMapping
  );
  const analysis = useAnalysisControllerSelector(controller, (state) => state.analysis);
  const job = useAnalysisControllerSelector(controller, (state) => state.job);
  const isLookupLoading = useAnalysisControllerSelector(
    controller,
    (state) => state.isLookupLoading
  );
  const isStarting = useAnalysisControllerSelector(controller, (state) => state.isStarting);
  const isStreamConnected = useAnalysisControllerSelector(
    controller,
    (state) => state.isStreamConnected
  );
  const error = useAnalysisControllerSelector(controller, (state) => state.error);
  const providerState = providerAvailability[provider];
  const isOutdated = Boolean(analysis && analysis.headOid !== pullRequestHeadOid);
  const isJobActive = job?.status === "queued" || job?.status === "running";
  const isLoading = isLookupLoading || isStarting || isJobActive;
  const progressMessage = job?.progressMessage ?? null;
  const warning = analysis && job?.status === "failed" ? job.error : null;
  const canAnalyze =
    hasMapping && !repositoryError && providerState.available && !isLoading;
  const alternateProvider: AnalyzerProvider = provider === "codex" ? "claude" : "codex";
  const alternateProviderState = providerAvailability[alternateProvider];

  useEffect(() => {
    if (!isProviderMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        providerMenuRef.current &&
        !providerMenuRef.current.contains(event.target as Node)
      ) {
        setIsProviderMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProviderMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProviderMenuOpen]);

  let statusTone = "text-muted-foreground";
  let statusContent: ReactNode = "Run analysis to start the review.";

  if (isLoading) {
    statusContent = (
      <span className="inline-flex min-w-0 max-w-[60ch] items-center gap-2 whitespace-nowrap">
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
        <span className="truncate">
          {progressMessage ?? "Analyzing pull request in an isolated worktree..."}
        </span>
        {!isStreamConnected && job ? (
          <span className="text-xs text-muted-foreground/80">Reconnecting...</span>
        ) : null}
      </span>
    );
  } else if (repositoryError) {
    statusTone = "text-destructive";
    statusContent = repositoryError;
  } else if (!providerState.available) {
    statusTone = "text-destructive";
    statusContent = providerState.reason;
  } else if (error) {
    statusTone = "text-destructive";
    statusContent = error;
  } else if (warning) {
    statusTone = "text-amber-700 dark:text-amber-300";
    statusContent = warning;
  } else if (analysis) {
    statusContent = (
      <>
        <span>
          Analyzed with {analysis.provider}/{analysis.model} at{" "}
          {formatCompletedAt(analysis.completedAt)}
        </span>
        {isOutdated ? (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <AlertCircle className="size-3.5" />
            Outdated
          </span>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex w-full max-w-md shrink-0 flex-col justify-center space-y-2 md:w-[26rem] md:text-right">
      <div className="flex justify-start md:justify-end">
        <div ref={providerMenuRef} className="relative flex items-center">
          <Button
            type="button"
            onClick={() => onAnalyze(provider)}
            disabled={!canAnalyze}
            size="lg"
            className="rounded-r-none"
          >
            <Sparkles className="size-4" />
            {analysis ? "Re-analyze" : "Analyze"} with {getProviderLabel(provider)}
          </Button>
          <Button
            type="button"
            aria-label={`Select analyzer provider, current ${getProviderLabel(provider)}`}
            aria-haspopup="menu"
            aria-expanded={isProviderMenuOpen}
            disabled={isLoading}
            size="lg"
            className="w-9 rounded-l-none border-l border-primary-foreground/15 px-2"
            onClick={() => {
              setIsProviderMenuOpen((open) => !open);
            }}
          >
            <ChevronDown className="size-4" />
          </Button>
          {isProviderMenuOpen ? (
            <div
              role="menu"
              className="absolute top-full right-0 z-10 mt-2 min-w-56 rounded-2xl border border-border/70 bg-popover p-1.5 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setIsProviderMenuOpen(false);
                  onAnalyze(alternateProvider);
                }}
                disabled={
                  !hasMapping ||
                  !!repositoryError ||
                  !alternateProviderState.available ||
                  isLoading
                }
              >
                <span>
                  {analysis ? "Re-analyze" : "Analyze"} with{" "}
                  {getProviderLabel(alternateProvider)}
                </span>
                {!alternateProviderState.available ? (
                  <span className="text-xs text-destructive">Unavailable</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div
        className={`flex flex-wrap items-center justify-start gap-x-3 gap-y-1 text-sm ${statusTone} md:justify-end`}
      >
        {statusContent}
      </div>
    </div>
  );
}
