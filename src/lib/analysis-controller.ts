import { useMemo, useSyncExternalStore } from "react";
import {
  analyzePullRequest,
  getPullRequestAnalysis,
  subscribeToAnalysisJob,
  type AnalysisJobSnapshot,
  type AnalysisJobStreamEvent,
  type AnalyzePullRequestResult,
  type AnalyzerProvider,
  type AnalyzerProviderAvailability
} from "./analyzer";
import {
  BUNDLED_ANALYSIS_REPOSITORY_STATE,
  DEMO_PROVIDER_REASON,
  getAnalysisSourceMode,
  getBundledAnalysisAvailability,
  loadBundledAnalysis
} from "./demo-analysis";

type AnalysisRepositoryState = {
  hasMapping: boolean;
  path: string | null;
  error: string | null;
};

type AnalysisControllerState = {
  analysis: AnalyzePullRequestResult | null;
  repository: AnalysisRepositoryState;
  providers: Record<AnalyzerProvider, AnalyzerProviderAvailability>;
  job: AnalysisJobSnapshot | null;
  isLookupLoading: boolean;
  isStarting: boolean;
  isStreamConnected: boolean;
  error: string | null;
};

type AnalysisControllerKey = {
  owner: string;
  repo: string;
  number: number;
  provider: AnalyzerProvider;
};

const DEFAULT_PROVIDERS: Record<AnalyzerProvider, AnalyzerProviderAvailability> = {
  codex: { available: false, reason: null },
  claude: { available: false, reason: null }
};

const DEFAULT_REPOSITORY: AnalysisRepositoryState = {
  hasMapping: false,
  path: null,
  error: null
};

const ANALYSIS_SOURCE_MODE = getAnalysisSourceMode();

function buildControllerKey(input: AnalysisControllerKey) {
  return `${input.owner}/${input.repo}#${input.number}:${input.provider}`;
}

class AnalysisController {
  private state: AnalysisControllerState = {
    analysis: null,
    repository: DEFAULT_REPOSITORY,
    providers: DEFAULT_PROVIDERS,
    job: null,
    isLookupLoading: false,
    isStarting: false,
    isStreamConnected: false,
    error: null
  };

  private readonly listeners = new Set<() => void>();
  private activeJobId: string | null = null;
  private unsubscribeJobStream: (() => void) | null = null;
  private loadRequestId = 0;
  private analyzeRequestId = 0;

  constructor(
    private readonly owner: string,
    private readonly repo: string,
    private readonly number: number,
    private readonly provider: AnalyzerProvider
  ) {}

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  async load() {
    const requestId = this.loadRequestId + 1;
    this.loadRequestId = requestId;
    this.setState((current) => ({
      ...current,
      isLookupLoading: true,
      error: null
    }));

    try {
      if (ANALYSIS_SOURCE_MODE === "bundled") {
        const analysis = await loadBundledAnalysis(
          this.owner,
          this.repo,
          this.number,
          this.provider
        );

        if (requestId !== this.loadRequestId) {
          return;
        }

        this.setState((current) => ({
          ...current,
          analysis,
          repository: BUNDLED_ANALYSIS_REPOSITORY_STATE,
          providers: getBundledAnalysisAvailability(),
          job: null,
          isLookupLoading: false,
          isStreamConnected: false,
          error: null
        }));
        this.ensureJobSubscription(null);
        return;
      }

      const response = await getPullRequestAnalysis(
        this.owner,
        this.repo,
        this.number,
        this.provider
      );

      if (requestId !== this.loadRequestId) {
        return;
      }

      this.setState((current) => ({
        ...current,
        analysis: response.analysis,
        repository: response.repository,
        providers: response.providers,
        job: response.job,
        isLookupLoading: false,
        error:
          response.analysis || response.job?.status !== "failed"
            ? null
            : response.job.error
      }));
      this.ensureJobSubscription(response.job);
    } catch (error) {
      if (ANALYSIS_SOURCE_MODE === "auto") {
        const analysis = await loadBundledAnalysis(
          this.owner,
          this.repo,
          this.number,
          this.provider
        );

        if (requestId !== this.loadRequestId) {
          return;
        }

        if (analysis) {
          this.setState((current) => ({
            ...current,
            analysis,
            repository: BUNDLED_ANALYSIS_REPOSITORY_STATE,
            providers: getBundledAnalysisAvailability(),
            job: null,
            isLookupLoading: false,
            isStreamConnected: false,
            error: null
          }));
          this.ensureJobSubscription(null);
          return;
        }
      }

      if (requestId !== this.loadRequestId) {
        return;
      }

      this.setState((current) => ({
        ...current,
        analysis: null,
        job: null,
        isLookupLoading: false,
        isStreamConnected: false,
        error: error instanceof Error ? error.message : "Failed to load analysis"
      }));
      this.ensureJobSubscription(null);
    }
  }

  async analyze(options: { forceRefresh?: boolean } = {}) {
    if (ANALYSIS_SOURCE_MODE === "bundled") {
      this.setState((current) => ({
        ...current,
        error: DEMO_PROVIDER_REASON
      }));
      return;
    }

    const requestId = this.analyzeRequestId + 1;
    this.analyzeRequestId = requestId;
    this.setState((current) => ({
      ...current,
      isStarting: true,
      error: null
    }));

    try {
      const response = await analyzePullRequest(this.owner, this.repo, this.number, {
        provider: this.provider,
        forceRefresh: options.forceRefresh ?? true
      });

      if (requestId !== this.analyzeRequestId) {
        return;
      }

      this.setState((current) => ({
        ...current,
        job: response.job,
        isStarting: false
      }));
      this.ensureJobSubscription(response.job);
    } catch (error) {
      if (requestId !== this.analyzeRequestId) {
        return;
      }

      this.setState((current) => ({
        ...current,
        isStarting: false,
        error: error instanceof Error ? error.message : "Failed to analyze pull request"
      }));
    }
  }

  private ensureJobSubscription(job: AnalysisJobSnapshot | null) {
    const isActiveJob = job && (job.status === "queued" || job.status === "running");

    if (!isActiveJob) {
      this.activeJobId = null;
      this.unsubscribeJobStream?.();
      this.unsubscribeJobStream = null;
      this.setState((current) =>
        current.isStreamConnected
          ? {
              ...current,
              isStreamConnected: false
            }
          : current
      );
      return;
    }

    if (this.activeJobId === job.id && this.unsubscribeJobStream) {
      return;
    }

    this.activeJobId = job.id;
    this.unsubscribeJobStream?.();
    this.unsubscribeJobStream = subscribeToAnalysisJob(job.id, {
      onOpen: () => {
        if (this.activeJobId !== job.id) {
          return;
        }

        this.setState((current) =>
          current.isStreamConnected
            ? current
            : {
                ...current,
                isStreamConnected: true
              }
        );
      },
      onEvent: (event) => {
        if (this.activeJobId !== job.id) {
          return;
        }

        this.applyJobStreamEvent(event);
      },
      onError: () => {
        if (this.activeJobId !== job.id) {
          return;
        }

        this.setState((current) =>
          current.isStreamConnected
            ? {
                ...current,
                isStreamConnected: false
              }
            : current
        );
      }
    });
  }

  private applyJobStreamEvent(event: AnalysisJobStreamEvent) {
    if (event.type === "heartbeat") {
      return;
    }

    if (event.type === "snapshot") {
      this.setState((current) => ({
        ...current,
        job: event.job
      }));
      return;
    }

    if (event.type === "progress") {
      this.setState((current) => {
        if (!current.job || current.job.id !== event.jobId) {
          return current;
        }

        return {
          ...current,
          job: {
            ...current.job,
            status: event.status,
            progressMessage: event.message,
            progressSequence: event.sequence
          }
        };
      });
      return;
    }

    if (event.type === "completed") {
      this.activeJobId = null;
      this.unsubscribeJobStream?.();
      this.unsubscribeJobStream = null;
      this.setState((current) => ({
        ...current,
        analysis: event.result,
        job: event.job,
        isStreamConnected: false,
        error: null
      }));
      return;
    }

    this.activeJobId = null;
    this.unsubscribeJobStream?.();
    this.unsubscribeJobStream = null;
    this.setState((current) => ({
      ...current,
      job: event.job,
      isStreamConnected: false,
      error: current.analysis ? null : event.job.error
    }));
  }

  private setState(
    updater: AnalysisControllerState | ((current: AnalysisControllerState) => AnalysisControllerState)
  ) {
    const nextState = typeof updater === "function" ? updater(this.state) : updater;

    if (Object.is(nextState, this.state)) {
      return;
    }

    this.state = nextState;

    for (const listener of this.listeners) {
      listener();
    }
  }
}

const controllers = new Map<string, AnalysisController>();

export function getAnalysisController(input: AnalysisControllerKey) {
  const key = buildControllerKey(input);
  const existing = controllers.get(key);

  if (existing) {
    return existing;
  }

  const controller = new AnalysisController(
    input.owner,
    input.repo,
    input.number,
    input.provider
  );
  controllers.set(key, controller);
  return controller;
}

export function useAnalysisController(input: AnalysisControllerKey) {
  return useMemo(
    () => getAnalysisController(input),
    [input.owner, input.repo, input.number, input.provider]
  );
}

export function useAnalysisControllerSelector<T>(
  controller: AnalysisController,
  selector: (state: AnalysisControllerState) => T
) {
  return useSyncExternalStore(controller.subscribe, () =>
    selector(controller.getSnapshot())
  );
}
