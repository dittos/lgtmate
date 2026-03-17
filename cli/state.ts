export type AnalysisJobLike = {
  status?: string | null;
  progressMessage?: string | null;
};

export function formatAnalysisProgress(job: AnalysisJobLike | null | undefined): string {
  const parts: string[] = [];

  if (job?.status) {
    parts.push(`status: ${job.status}`);
  }

  if (job?.progressMessage) {
    parts.push(job.progressMessage);
  }

  return parts.join(" - ");
}

export function formatWaitingForAnalysisText(
  prNumber: number,
  progress: string | null = null,
  interactive = false
): string {
  const base = progress
    ? `Waiting for analysis on PR #${prNumber} - ${progress}`
    : `Waiting for analysis on PR #${prNumber}`;

  if (!interactive) {
    return base;
  }

  return `${base}\nPress Enter to open in the browser before analysis completes.`;
}
