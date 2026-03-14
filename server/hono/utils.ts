import type { AnalysisJobStreamEvent, AnalyzerProvider } from "../analyzer/types";

export function getRouteNumber(value: string, label: string) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    throw new Error(`Invalid ${label}`);
  }

  return number;
}

export function isAnalyzerProvider(value: unknown): value is AnalyzerProvider {
  return value === "codex" || value === "claude";
}

export function encodeSseEvent(event: AnalysisJobStreamEvent) {
  return JSON.stringify(event);
}
