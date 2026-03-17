export type AnalysisJobLike = {
  status?: string | null;
  progressMessage?: string | null;
};

export function formatAnalysisProgress(job: AnalysisJobLike | null | undefined): string {
  if (job?.progressMessage) {
    return job.progressMessage;
  }

  return job?.status ?? "";
}
