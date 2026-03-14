import { Link, Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/theme-toggle";

export function RootLayout() {
  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-2.5 md:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 rounded-lg hover:text-amber-700 dark:hover:text-amber-300"
          >
            <span className="text-base font-semibold tracking-tight md:text-lg">
              lgtmate
            </span>
            <span className="hidden text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
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
