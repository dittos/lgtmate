import type { ReactNode } from "react";
import { AlertTriangle, CheckCheck, Files, HelpCircle, ShieldAlert } from "lucide-react";
import type { AnalyzePullRequestResult } from "@/lib/analyzer";

function Section({
  title,
  icon: Icon,
  children
}: {
  title: string;
  icon: typeof Files;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-border/70 bg-card/85 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-zinc-400">
        <Icon className="size-3.5" />
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FileChips({
  files,
  onSelectFile
}: {
  files: string[];
  onSelectFile: (path: string) => void;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((file) => (
        <button
          key={file}
          type="button"
          className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={() => onSelectFile(file)}
        >
          {file}
        </button>
      ))}
    </div>
  );
}

export function PullRequestAnalysis({
  result,
  onSelectFile
}: {
  result: AnalyzePullRequestResult;
  onSelectFile: (path: string) => void;
}) {
  const analysis = result.analysis;

  return (
    <div className="space-y-5">
      <Section title="Summary" icon={Files}>
        <p className="text-sm leading-7 text-foreground/90">
          {analysis.summary || "No summary was returned."}
        </p>
      </Section>

      {analysis.changeAreas.length > 0 ? (
        <Section title="Key Change Areas" icon={Files}>
          <div className="space-y-4">
            {analysis.changeAreas.map((area) => (
              <article
                key={`${area.title}-${area.summary}`}
                className="rounded-2xl border border-border/60 bg-background/55 p-4"
              >
                <h3 className="text-sm font-semibold">{area.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {area.summary}
                </p>
                <FileChips files={area.files} onSelectFile={onSelectFile} />
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      {analysis.risks.length > 0 ? (
        <Section title="Risks" icon={ShieldAlert}>
          <div className="space-y-4">
            {analysis.risks.map((risk) => (
              <article
                key={`${risk.title}-${risk.details}`}
                className="rounded-2xl border border-border/60 bg-background/55 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {risk.severity}
                  </span>
                  <h3 className="text-sm font-semibold">{risk.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {risk.details}
                </p>
                <FileChips files={risk.files} onSelectFile={onSelectFile} />
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      {(analysis.testing.existingSignals.length > 0 ||
        analysis.testing.recommendedChecks.length > 0) ? (
        <Section title="Testing" icon={CheckCheck}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <h3 className="text-sm font-semibold">Existing signals</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {analysis.testing.existingSignals.length > 0 ? (
                  analysis.testing.existingSignals.map((signal) => (
                    <li key={signal}>{signal}</li>
                  ))
                ) : (
                  <li>No explicit testing signals noted.</li>
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
              <h3 className="text-sm font-semibold">Recommended checks</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {analysis.testing.recommendedChecks.length > 0 ? (
                  analysis.testing.recommendedChecks.map((check) => (
                    <li key={check}>{check}</li>
                  ))
                ) : (
                  <li>No follow-up checks suggested.</li>
                )}
              </ul>
            </div>
          </div>
        </Section>
      ) : null}

      {analysis.reviewerQuestions.length > 0 ? (
        <Section title="Reviewer Questions" icon={HelpCircle}>
          <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
            {analysis.reviewerQuestions.map((question) => (
              <li
                key={question}
                className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3"
              >
                {question}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {analysis.notableFiles.length > 0 ? (
        <Section title="Notable Files" icon={AlertTriangle}>
          <div className="space-y-3">
            {analysis.notableFiles.map((file) => (
              <button
                key={`${file.path}-${file.reason}`}
                type="button"
                className="block w-full rounded-2xl border border-border/60 bg-background/55 px-4 py-3 text-left transition hover:bg-muted/60"
                onClick={() => onSelectFile(file.path)}
              >
                <div className="text-sm font-semibold">{file.path}</div>
                <div className="mt-1 text-sm leading-7 text-muted-foreground">
                  {file.reason}
                </div>
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
