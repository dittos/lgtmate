import { createScenarioDeps, runCli } from "../cli/index.ts";

const scenarioName = process.argv[2] ?? "existing-analysis";

const scenarios = {
  "existing-analysis": {
    analysis: {
      existingAnalysis: {
        provider: "codex",
        completedAt: "2026-03-18T00:00:00.000Z"
      }
    },
    server: {
      reused: true,
      port: 1973
    }
  },
  "analysis-complete": {
    analysis: {
      delayMs: 5000,
      job: {
        id: "job-42",
        status: "queued",
        progressMessage: "Queued"
      },
      triggerJob: {
        id: "job-42",
        status: "queued"
      },
      updates: [
        {
          job: {
            id: "job-42",
            status: "running",
            progressMessage: "Collecting pull request context"
          }
        }
      ],
      finalState: {
        ok: true,
        analysis: {
          provider: "codex",
          completedAt: "2026-03-18T00:00:05.000Z"
        },
        repository: { hasMapping: true, path: "/tmp/owner-repo", error: null },
        providers: {
          codex: { available: true, reason: null },
          claude: { available: true, reason: null }
        },
        job: {
          id: "job-42",
          status: "completed",
          progressMessage: "Analysis complete"
        }
      }
    }
  },
  "analysis-failed": {
    analysis: {
      delayMs: 5000,
      triggerJob: {
        id: "job-9",
        status: "queued"
      },
      updates: [
        {
          job: {
            id: "job-9",
            status: "running",
            progressMessage: "Running analyzer"
          }
        }
      ],
      finalState: {
        ok: true,
        analysis: null,
        repository: { hasMapping: true, path: "/tmp/owner-repo", error: null },
        providers: {
          codex: { available: true, reason: null },
          claude: { available: true, reason: null }
        },
        job: {
          id: "job-9",
          status: "failed",
          error: "Analyzer crashed",
          progressMessage: "Analyzer crashed"
        }
      }
    }
  },
  "manual-open": {
    analysis: {
      delayMs: 5000,
      triggerJob: {
        id: "job-manual",
        status: "queued"
      }
    }
  }
} as const;

const scenario = scenarios[scenarioName as keyof typeof scenarios];

if (!scenario) {
  process.stderr.write(`Unknown scenario: ${scenarioName}\n`);
  process.exit(1);
}

const deps = createScenarioDeps(scenario, {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin
});
const exitCode = await runCli(["owner/repo", "123"], deps);
process.exit(exitCode);
