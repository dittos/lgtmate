import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getGithubStatus, type GithubStatusResponse } from "@/lib/github";

export function HomePage() {
  const [status, setStatus] = useState<GithubStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function loadGithubStatus(isActive?: () => boolean) {
    try {
      setIsLoading(true);
      setRequestError(null);

      const response = await getGithubStatus();

      if (!isActive || isActive()) {
        setStatus(response);
      }
    } catch (error) {
      if (!isActive || isActive()) {
        setRequestError(
          error instanceof Error ? error.message : "Failed to fetch GitHub status"
        );
      }
    } finally {
      if (!isActive || isActive()) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    let isActive = true;
    void loadGithubStatus(() => isActive);

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main className="min-h-screen px-5 py-12 md:px-8 md:py-16">
      <section className="mx-auto w-full max-w-6xl">
        <p className="mb-3 text-[0.82rem] uppercase tracking-[0.12em] text-amber-300">
          Local pull request review
        </p>
        <h1 className="text-5xl leading-none font-semibold tracking-tight md:text-7xl">
          lgtmate
        </h1>
        <p className="mt-5 mb-8 max-w-2xl text-lg text-zinc-300 md:text-xl">
          A local web UI for reviewing GitHub pull requests with the GitHub CLI
          handling authentication.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-white/12 bg-black/35 p-5 backdrop-blur-sm">
            <h2 className="mb-2 text-base font-medium">SPA foundation</h2>
            <p className="text-sm leading-6 text-zinc-300">
              Vite, React, TypeScript, and React Router are wired up.
            </p>
          </article>
          <article className="rounded-3xl border border-white/12 bg-black/35 p-5 backdrop-blur-sm">
            <h2 className="mb-2 text-base font-medium">API shape</h2>
            <p className="text-sm leading-6 text-zinc-300">
              Vite exposes GitHub-style pull request and changed-file REST
              endpoints through the GitHub CLI.
            </p>
          </article>
          <article className="rounded-3xl border border-white/12 bg-black/35 p-5 backdrop-blur-sm md:col-span-2 xl:col-span-1">
            <h2 className="mb-2 text-base font-medium">GitHub status</h2>
            <div className="mb-4">
              <Button onClick={() => void loadGithubStatus()} disabled={isLoading}>
                {isLoading ? "Loading..." : "Refresh status"}
              </Button>
            </div>
            {isLoading ? (
              <p className="text-sm leading-6 text-zinc-300">
                Loading `/api/github/status`...
              </p>
            ) : null}
            {requestError ? (
              <p className="text-sm leading-6 text-red-300">{requestError}</p>
            ) : null}
            {status?.ok ? (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">
                {status.output}
              </pre>
            ) : null}
          </article>
          <article className="rounded-3xl border border-white/12 bg-black/35 p-5 backdrop-blur-sm">
            <h2 className="mb-2 text-base font-medium">Route pattern</h2>
            <p className="text-sm leading-6 text-zinc-300">
              Open `/:owner/:repo/pull/:number` to browse a pull request locally.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
