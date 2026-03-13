import { Link, Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/theme-toggle";

export function RootLayout() {
  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-3 rounded-lg transition-colors hover:text-amber-700 dark:hover:text-amber-300"
          >
            <span className="text-lg font-semibold tracking-tight md:text-xl">
              lgtmate
            </span>
            <span className="hidden text-xs uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              local PR review
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <Outlet />
    </div>
  );
}
