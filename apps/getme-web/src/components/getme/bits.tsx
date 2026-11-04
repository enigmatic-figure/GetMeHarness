import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Certainty, RecipeState } from "@/lib/getme/model";
import { recipeLabel } from "@/lib/getme/model";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl border border-line bg-surface p-5", className)}>{children}</section>;
}

export function Pill({ children, tone = "quiet" }: { children: ReactNode; tone?: "quiet" | "live" | "brass" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-sm",
        tone === "live" && "border-primary/40 bg-primary/10 text-primary",
        tone === "brass" && "border-accent/50 bg-accent/10 text-accent",
        tone === "quiet" && "border-line bg-bg text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function RecipePill({ state }: { state: RecipeState }) {
  return <Pill tone={state === "missing" ? "brass" : "live"}>{recipeLabel(state)}</Pill>;
}

export function CertaintyPill({ certainty }: { certainty: Certainty }) {
  const label = certainty === "observed" ? "Observed" : certainty === "partial" ? "Partial" : "Gap";
  return <Pill tone={certainty === "observed" ? "quiet" : "brass"}>{label}</Pill>;
}

export function Transcript({ lines }: { lines: string[] }) {
  if (!lines.length) {
    return <p className="font-mono text-sm text-faint">Waiting.</p>;
  }
  return (
    <ol aria-live="polite" className="flex flex-col gap-2">
      {lines.map((line, index) => (
        <li key={`${index}-${line.slice(0, 24)}`} className="border-l border-primary pl-3 font-mono text-sm text-fg">
          {line}
        </li>
      ))}
    </ol>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-fg">{label}</span>
      {children}
      {hint ? <span className="text-faint">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-2xl border border-line bg-bg px-3 text-base text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
