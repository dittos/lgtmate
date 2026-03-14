import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPullRequestAnalysisPrompt, ensureAnalyzerSchemaFile } from "../prompt";
import { parseAndNormalizePullRequestAnalysis } from "../normalize";
import { runCommand } from "../process";
import type {
  AnalyzePullRequestInput,
  AnalyzePullRequestResult,
  PullRequestAnalyzer
} from "../types";

type CodexThreadItem =
  | {
      id?: string;
      type: "agent_message";
      text: string;
    }
  | {
      id?: string;
      type: "reasoning";
      text: string;
    }
  | {
      id?: string;
      type: "command_execution";
      command: string;
      aggregated_output: string;
      exit_code?: number;
      status: "in_progress" | "completed" | "failed";
    }
  | {
      id?: string;
      type: "file_change";
      changes: Array<{
        path: string;
        kind: "add" | "delete" | "update";
      }>;
      status: "completed" | "failed";
    }
  | {
      id?: string;
      type: "mcp_tool_call";
      server: string;
      tool: string;
      arguments: unknown;
      result?: {
        content: unknown[];
        structured_content: unknown;
      };
      error?: {
        message: string;
      };
      status: "in_progress" | "completed" | "failed";
    }
  | {
      id?: string;
      type: "web_search";
      query: string;
    }
  | {
      id?: string;
      type: "todo_list";
      items: Array<{
        text: string;
        completed: boolean;
      }>;
    }
  | {
      id?: string;
      type: "error";
      message: string;
    };

type CodexThreadEvent =
  | {
      type: "thread.started";
      thread_id: string;
    }
  | {
      type: "turn.started";
    }
  | {
      type: "turn.completed";
      usage: {
        input_tokens: number;
        cached_input_tokens: number;
        output_tokens: number;
      };
    }
  | {
      type: "turn.failed";
      error: {
        message: string;
      };
    }
  | {
      type: "item.started" | "item.updated" | "item.completed";
      item: CodexThreadItem;
    }
  | {
      type: "error";
      message: string;
    };

function truncate(value: string, maxLength = 120) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

function looksLikeJson(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function summarizeTodoList(
  items: Array<{
    text: string;
    completed: boolean;
  }>
) {
  if (items.length === 0) {
    return "Updating plan";
  }

  const completedCount = items.filter((item) => item.completed).length;
  const nextItem = items.find((item) => !item.completed)?.text;

  if (nextItem) {
    return `Plan ${completedCount}/${items.length}: ${truncate(nextItem, 90)}`;
  }

  return `Plan ${completedCount}/${items.length}`;
}

function summarizeFileChanges(
  changes: Array<{
    path: string;
    kind: "add" | "delete" | "update";
  }>
) {
  if (changes.length === 0) {
    return "Applied file changes";
  }

  const labels = changes.slice(0, 3).map((change) => `${change.kind} ${change.path}`);
  const suffix = changes.length > 3 ? ` (+${changes.length - 3} more)` : "";

  return `${changes.length} file change${changes.length === 1 ? "" : "s"}: ${labels.join(", ")}${suffix}`;
}

function summarizeItemEvent(event: Extract<CodexThreadEvent, { item: CodexThreadItem }>) {
  const { item, type } = event;

  switch (item.type) {
    case "reasoning":
      return truncate(item.text || "Reasoning...", 90);
    case "command_execution": {
      return truncate(item.command, 90);
    }
    case "file_change":
      return summarizeFileChanges(item.changes);
    case "mcp_tool_call": {
      const label = `${item.server}/${item.tool}`;

      if (item.status === "failed") {
        return label;
      }

      return label;
    }
    case "web_search":
      return truncate(item.query, 90);
    case "todo_list":
      return summarizeTodoList(item.items);
    case "error":
      return item.message;
    case "agent_message":
      if (type !== "item.completed") {
        return "Drafting response";
      }

      if (!item.text.trim() || looksLikeJson(item.text)) {
        return "Structured response ready";
      }

      return truncate(item.text, 120);
  }
}

function emitCodexProgressLine(
  line: string,
  onProgress: AnalyzePullRequestInput["onProgress"] | undefined,
  emitProgress: (message: string) => void
) {
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  try {
    const event = JSON.parse(trimmed) as CodexThreadEvent;

    switch (event.type) {
      case "thread.started":
        emitProgress("Session started");
        return;
      case "turn.started":
        emitProgress("Analyzing pull request");
        return;
      case "turn.completed":
        emitProgress("Analysis complete");
        return;
      case "turn.failed":
        emitProgress(event.error.message);
        return;
      case "error":
        emitProgress(event.message);
        return;
      case "item.started":
      case "item.updated":
      case "item.completed":
        emitProgress(summarizeItemEvent(event));
        return;
    }
  } catch {
    onProgress?.({ message: trimmed });
  }
}

export class CodexPullRequestAnalyzer implements PullRequestAnalyzer {
  readonly provider = "codex";
  readonly defaultModel = "gpt-5.4";

  async analyzePullRequest(
    input: AnalyzePullRequestInput
  ): Promise<AnalyzePullRequestResult> {
    const schemaPath = await ensureAnalyzerSchemaFile();
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "lgtmate-codex-"));
    const outputPath = path.join(tempDir, "result.json");
    const model = input.model?.trim() || this.defaultModel;

    let stdoutBuffer = "";
    let lastProgressMessage: string | null = null;

    const emitProgress = (message: string) => {
      const normalized = message.trim();

      if (!normalized || normalized === lastProgressMessage) {
        return;
      }

      lastProgressMessage = normalized;
      input.onProgress?.({ message: normalized });
    };

    await runCommand(
      "codex",
      [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "-c",
        'model_reasoning_effort="low"',
        "--json",
        "-C",
        input.worktreePath,
        "-m",
        model,
        "--output-schema",
        schemaPath,
        "-o",
        outputPath,
        "-"
      ],
      {
        cwd: input.worktreePath,
        input: buildPullRequestAnalysisPrompt(input),
        onStdout: (chunk) => {
          stdoutBuffer += chunk;

          let newlineIndex = stdoutBuffer.indexOf("\n");

          while (newlineIndex >= 0) {
            emitCodexProgressLine(
              stdoutBuffer.slice(0, newlineIndex),
              input.onProgress,
              emitProgress
            );
            stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
            newlineIndex = stdoutBuffer.indexOf("\n");
          }
        },
        onStderr: (chunk) => {
          emitProgress(chunk);
        }
      }
    );

    emitCodexProgressLine(stdoutBuffer, input.onProgress, emitProgress);

    const rawOutput = await readFile(outputPath, "utf8");

    return {
      provider: this.provider,
      model,
      completedAt: new Date().toISOString(),
      headOid: input.headOid,
      baseOid: input.baseOid,
      analysis: parseAndNormalizePullRequestAnalysis(rawOutput, input.files)
    };
  }
}
