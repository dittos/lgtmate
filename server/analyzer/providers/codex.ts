import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPullRequestAnalysisPrompt } from "../prompt";
import { parseAndNormalizePullRequestAnalysis } from "../normalize";
import { ensureAnalyzerSchemaFile } from "../storage";
import { runCommand } from "../process";
import type {
  AnalyzePullRequestInput,
  AnalyzePullRequestResult,
  PullRequestAnalyzer
} from "../types";

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

    await runCommand(
      "codex",
      [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
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
        input: buildPullRequestAnalysisPrompt(input)
      }
    );

    const rawOutput = await readFile(outputPath, "utf8");

    return {
      provider: this.provider,
      model,
      completedAt: new Date().toISOString(),
      headOid: input.headOid,
      baseOid: input.baseOid,
      analysis: parseAndNormalizePullRequestAnalysis(rawOutput)
    };
  }
}
