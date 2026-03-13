import { cn } from "@/lib/utils";

export function StateBadge({
  state
}: {
  state: "open" | "closed" | "merged";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em]",
        state === "open" &&
          "bg-emerald-500/12 text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-200",
        state === "merged" &&
          "bg-violet-500/12 text-violet-800 ring-1 ring-violet-500/20 dark:text-violet-200",
        state === "closed" &&
          "bg-muted text-muted-foreground ring-1 ring-border/70"
      )}
    >
      {state}
    </span>
  );
}
