import { createScenarioDeps, runCli } from "../cli/index.ts";

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
  "server-start": {
    analysis: {
      existingAnalysis: {
        provider: "codex",
        completedAt: "2026-03-18T00:00:05.000Z"
      }
    },
    server: {
      reused: false,
      delayMs: 5000,
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
          delayMs: 600,
          job: {
            id: "job-42",
            status: "queued",
            progressMessage: "Preparing analysis job"
          }
        },
        {
          delayMs: 900,
          job: {
            id: "job-42",
            status: "running",
            progressMessage: "Collecting pull request context"
          }
        },
        {
          delayMs: 1000,
          job: {
            id: "job-42",
            status: "running",
            progressMessage: "Reviewing changed files"
          }
        },
        {
          delayMs: 900,
          job: {
            id: "job-42",
            status: "running",
            progressMessage: "Drafting review summary"
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

const scenarioNames = Object.keys(scenarios) as Array<keyof typeof scenarios>;

function resolveScenarioName(selection: string | undefined): keyof typeof scenarios | null {
  if (!selection) {
    return "existing-analysis";
  }

  const byName = selection as keyof typeof scenarios;

  if (byName in scenarios) {
    return byName;
  }

  if (/^\d+$/.test(selection)) {
    const index = Number(selection) - 1;
    return scenarioNames[index] ?? null;
  }

  return null;
}

const scenarioSelection = process.argv[2];
const scenarioName = resolveScenarioName(scenarioSelection);

if (!scenarioName) {
  const availableScenarios = scenarioNames
    .map((name, index) => `${index + 1}. ${name}`)
    .join("\n");
  const label = scenarioSelection ?? "(none)";
  process.stderr.write(`Unknown scenario: ${label}\nAvailable scenarios:\n${availableScenarios}\n`);
  process.exit(1);
}

const deps = createScenarioDeps(scenarios[scenarioName], {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin
});
const exitCode = await runCli(["owner/repo", "123"], deps);
process.exit(exitCode);
