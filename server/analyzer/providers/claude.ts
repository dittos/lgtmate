import { readFile } from "node:fs/promises";
import { buildPullRequestAnalysisPrompt } from "../prompt";
import { parseAndNormalizePullRequestAnalysis } from "../normalize";
import { ensureAnalyzerSchemaFile } from "../storage";
import { runCommand } from "../process";
import type {
  AnalyzePullRequestInput,
  AnalyzePullRequestResult,
  PullRequestAnalyzer
} from "../types";

export class ClaudePullRequestAnalyzer implements PullRequestAnalyzer {
  readonly provider = "claude";
  readonly defaultModel = "sonnet";

  async analyzePullRequest(
    input: AnalyzePullRequestInput
  ): Promise<AnalyzePullRequestResult> {
    const schemaPath = await ensureAnalyzerSchemaFile();
    const schema = await readFile(schemaPath, "utf8");
    const model = input.model?.trim() || this.defaultModel;
    const { stdout } = await runCommand(
      "claude",
      [
        "-p",
        "--output-format",
        "json",
        "--permission-mode",
        "bypassPermissions",
        "--json-schema",
        schema,
        "--model",
        model,
        buildPullRequestAnalysisPrompt(input)
      ],
      {
        cwd: input.worktreePath
      }
    );

    return {
      provider: this.provider,
      model,
      completedAt: new Date().toISOString(),
      headOid: input.headOid,
      baseOid: input.baseOid,
      analysis: parseAndNormalizePullRequestAnalysis(stdout)
    };
  }
}
