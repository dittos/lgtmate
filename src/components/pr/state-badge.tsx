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
        state === "open" && "bg-emerald-400/16 text-emerald-200 ring-1 ring-emerald-300/20",
        state === "merged" && "bg-violet-400/16 text-violet-200 ring-1 ring-violet-300/20",
        state === "closed" && "bg-zinc-400/16 text-zinc-200 ring-1 ring-white/10"
      )}
    >
      {state}
    </span>
  );
}
