import { type FormEvent, useState } from "react";
import { LocateFixed } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const EXAMPLE_PULL_REQUESTS = [
  {
    href: "/mastodon/mastodon/pull/19059",
    label: "mastodon/mastodon#19059"
  }
];

function parsePullRequestInput(value: string) {
  const trimmedValue = value.trim();

  const shorthandMatch = trimmedValue.match(
    /^([\w.-]+)\/([\w.-]+)#([1-9]\d*)$/u
  );

  if (shorthandMatch) {
    const [, owner, repo, number] = shorthandMatch;
    return { owner, repo, number };
  }

  const normalizedValue = trimmedValue.startsWith("http")
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const parsedUrl = new URL(normalizedValue);

    if (parsedUrl.hostname !== "github.com") {
      return null;
    }

    const pathMatch = parsedUrl.pathname.match(
      /^\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/u
    );

    if (!pathMatch) {
      return null;
    }

    const [, owner, repo, number] = pathMatch;
    return { owner, repo, number };
  } catch {
    return null;
  }
}

export function HomePage() {
  const navigate = useNavigate();
  const [pullRequestInput, setPullRequestInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedPullRequest = parsePullRequestInput(pullRequestInput);

    if (!parsedPullRequest) {
      setInputError(
        "Enter a GitHub pull request URL or shorthand like owner/repo#123."
      );
      return;
    }

    setInputError(null);
    void navigate(
      `/${parsedPullRequest.owner}/${parsedPullRequest.repo}/pull/${parsedPullRequest.number}`
    );
  }

  return (
    <main className="flex flex-1 items-center px-5 py-12 md:px-8 md:py-16">
      <section className="w-full">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-md md:p-8">
            <div className="mb-6">
              <p className="mb-3 text-[0.82rem] uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300">
                Local pull request review
              </p>
              <h1 className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
                Open a GitHub pull request directly
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                Paste a full GitHub pull request URL or use the compact
                `owner/repo#number` format to jump straight into the review UI.
              </p>
            </div>

            <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="pull-request-input">
                GitHub pull request URL
              </label>
              <div className="relative flex-1">
                <LocateFixed className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="pull-request-input"
                  type="text"
                  value={pullRequestInput}
                  onChange={(event) => setPullRequestInput(event.target.value)}
                  placeholder="https://github.com/owner/repo/pull/123 or owner/repo#123"
                  className="h-12 w-full rounded-2xl border border-border/70 bg-background/80 pr-4 pl-11 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15"
                />
              </div>
              <Button className="h-12 rounded-2xl px-6 text-sm font-medium" size="lg" type="submit">
                Go
              </Button>
            </form>

            <div className="mt-4 min-h-6 text-sm">
              {inputError ? (
                <p className="text-destructive">{inputError}</p>
              ) : (
                <p className="text-muted-foreground">
                  Accepts GitHub PR URLs and shorthand references.
                </p>
              )}
            </div>

            <div className="mt-8 rounded-2xl border border-border/60 bg-background/45 p-5">
              <p className="text-sm text-muted-foreground">
                Demo pull request with bundled analysis:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_PULL_REQUESTS.map((pullRequest) => (
                  <Link
                    key={pullRequest.href}
                    to={pullRequest.href}
                    className="inline-flex rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-sm hover:border-amber-400/70 hover:text-amber-700 dark:hover:text-amber-300"
                  >
                    {pullRequest.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
