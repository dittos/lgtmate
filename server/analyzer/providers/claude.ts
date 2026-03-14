import { readFile } from "node:fs/promises";
import { buildPullRequestAnalysisPrompt, ensureAnalyzerSchemaFile } from "../prompt";
import { parseAndNormalizePullRequestAnalysis } from "../normalize";
import { runCommand } from "../process";
import type {
  AnalyzePullRequestInput,
  AnalyzePullRequestResult,
  PullRequestAnalyzer
} from "../types";

type ClaudeStreamEnvelope =
  | {
      type: "system";
      subtype?: string;
    }
  | {
      type: "assistant";
      message?: {
        content?: Array<{
          type: string;
          text?: string;
          name?: string;
        }>;
      };
    }
  | {
      type: "result";
      subtype?: string;
      duration_ms?: number;
      duration_api_ms?: number;
      is_error?: boolean;
      result?: string;
      structured_output?: unknown;
    }
  | {
      type: "stream_event";
      event: ClaudeStreamEvent;
    };

type ClaudeStreamEvent =
  | {
      type: "message_start" | "message_stop";
    }
  | {
      type: "content_block_start";
      index?: number;
      content_block?: {
        type?: string;
        text?: string;
        name?: string;
      };
    }
  | {
      type: "content_block_stop";
      index?: number;
    };

function truncate(value: string, maxLength = 120) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

function normalizeProgressSnippet(value: string) {
  return truncate(value.replace(/\s+/g, " ").trim(), 120);
}

function parseClaudeStreamLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as ClaudeStreamEnvelope;
  } catch {
    return null;
  }
}

export class ClaudePullRequestAnalyzer implements PullRequestAnalyzer {
  readonly provider = "claude";
  readonly defaultModel = "sonnet";

  async analyzePullRequest(
    input: AnalyzePullRequestInput
  ): Promise<AnalyzePullRequestResult> {
    const schemaPath = await ensureAnalyzerSchemaFile();
    const schema = await readFile(schemaPath, "utf8");
    const model = input.model?.trim() || this.defaultModel;

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let lastProgressMessage: string | null = null;
    let finalStructuredOutput: unknown = null;
    let finalResultText: string | null = null;
    let activeToolName: string | null = null;

    const emitProgress = (message: string) => {
      const normalized = normalizeProgressSnippet(message);

      if (!normalized || normalized === lastProgressMessage) {
        return;
      }

      lastProgressMessage = normalized;
      input.onProgress?.({ message: normalized });
    };

    const handleStreamEvent = (event: ClaudeStreamEvent) => {
      switch (event.type) {
        case "message_start":
          emitProgress("Analyzing pull request");
          return;
        case "message_stop":
          emitProgress("Preparing structured result");
          return;
        case "content_block_start": {
          const blockType = event.content_block?.type;

          if (blockType === "tool_use") {
            activeToolName = event.content_block?.name?.trim() || "tool";
            emitProgress(`Using ${activeToolName}`);
            return;
          }

          if (blockType === "text") {
            emitProgress("Drafting analysis");
          }

          return;
        }
        case "content_block_stop":
          if (activeToolName) {
            emitProgress(`Finished ${activeToolName}`);
            activeToolName = null;
          }
      }
    };

    const handleStreamLine = (line: string) => {
      const parsed = parseClaudeStreamLine(line);

      if (!parsed) {
        emitProgress(line);
        return;
      }

      switch (parsed.type) {
        case "system":
          if (parsed.subtype === "init") {
            emitProgress("Claude session started");
          }
          return;
        case "assistant": {
          const text = parsed.message?.content
            ?.filter((block) => block.type === "text" && typeof block.text === "string")
            .map((block) => block.text?.trim())
            .filter(Boolean)
            .join(" ");

          if (text) {
            const snippet = normalizeProgressSnippet(text);

            emitProgress(snippet);
          }

          return;
        }
        case "stream_event":
          handleStreamEvent(parsed.event);
          return;
        case "result":
          if (parsed.structured_output !== undefined) {
            finalStructuredOutput = parsed.structured_output;
          }

          if (typeof parsed.result === "string" && parsed.result.trim()) {
            finalResultText = parsed.result;
          }

          if (parsed.is_error) {
            emitProgress(parsed.result ?? "Claude analysis failed");
            return;
          }

          emitProgress("Analysis complete");
      }
    };

    const handleStderrChunk = (chunk: string) => {
      stderrBuffer += chunk;

      let newlineIndex = stderrBuffer.lastIndexOf("\n");

      if (newlineIndex < 0) {
        return;
      }

      const completedOutput = stderrBuffer.slice(0, newlineIndex);
      stderrBuffer = stderrBuffer.slice(newlineIndex + 1);

      const lines = completedOutput
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const lastLine = lines.at(-1);

      if (lastLine) {
        emitProgress(lastLine);
      }
    };

    await runCommand(
      "claude",
      [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--permission-mode",
        "bypassPermissions",
        "--json-schema",
        schema,
        "--model",
        model,
        buildPullRequestAnalysisPrompt(input)
      ],
      {
        cwd: input.worktreePath,
        onStdout: (chunk) => {
          stdoutBuffer += chunk;

          let newlineIndex = stdoutBuffer.indexOf("\n");

          while (newlineIndex >= 0) {
            handleStreamLine(stdoutBuffer.slice(0, newlineIndex));
            stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
            newlineIndex = stdoutBuffer.indexOf("\n");
          }
        },
        onStderr: (chunk) => {
          handleStderrChunk(chunk);
        }
      }
    );

    handleStreamLine(stdoutBuffer);

    const trailingStderrLine = stderrBuffer.trim();

    if (trailingStderrLine) {
      emitProgress(trailingStderrLine);
    }

    let rawAnalysis = "";

    if (finalStructuredOutput !== null) {
      rawAnalysis = JSON.stringify(finalStructuredOutput);
    } else {
      rawAnalysis = String(finalResultText ?? "").trim();
    }

    if (!rawAnalysis) {
      throw new Error("Claude did not return structured output");
    }

    return {
      provider: this.provider,
      model,
      completedAt: new Date().toISOString(),
      headOid: input.headOid,
      baseOid: input.baseOid,
      analysis: parseAndNormalizePullRequestAnalysis(rawAnalysis, input.files)
    };
  }
}
