import { useEffect, useState } from "react";
import { Cpu, Library, MessageSquare, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ask } from "@/components/getme/ask";
import { Library as LibraryView } from "@/components/getme/library";
import { Machine } from "@/components/getme/machine";
import { Overlays } from "@/components/getme/overlays";
import { Record } from "@/components/getme/record";
import { Updates } from "@/components/getme/updates";
import { cn } from "@/lib/cn";
import { useGetme, type View } from "@/lib/getme/store";

const NAV: { id: View; label: string; icon: typeof Library }[] = [
  { id: "ask", label: "Ask", icon: MessageSquare },
  { id: "library", label: "Yours", icon: Library },
  { id: "updates", label: "Updates", icon: RefreshCw },
  { id: "record", label: "Record", icon: ScrollText },
];

export function GetMeApp() {
  const removed = useGetme((s) => s.selfRemoved);
  useEffect(() => {
    void useGetme.persist.rehydrate();
  }, []);
  if (removed) return <Departure />;
  return <Shell />;
}

function Departure() {
  const reset = useGetme((s) => s.reset);
  const count = useGetme((s) => s.events.length);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-6 py-16">
      <img src="/mark.png" alt="" width={72} height={72} className="mark-glow size-16 rounded-3xl" />
      <div>
        <p className="text-sm text-primary">Removed</p>
        <h1 className="mt-1 text-3xl font-semibold">GetMe has left this rehearsal.</h1>
        <p className="mt-3 text-muted">
          Observation is off. The journal had <span className="tabular-nums text-fg">{count}</span> events. If you exported it, that file is the copy you kept. Nothing was uploaded, so there is nothing remote to undo.
        </p>
      </div>
      <Button onClick={reset} className="self-start">
        Put GetMe back
      </Button>
    </main>
  );
}

function Shell() {
  const view = useGetme((s) => s.view);
  const setView = useGetme((s) => s.setView);
  const notice = useGetme((s) => s.notice);
  const setNotice = useGetme((s) => s.setNotice);
  const installs = useGetme((s) => s.installs);
  const drift = installs.filter((i) => i.status === "installed" && i.attention).length;
  const updates = installs.filter((i) => i.status === "installed" && i.updateTo).length;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-bg-raised px-4 py-5 lg:flex">
        <Brand />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              count={item.id === "library" ? drift : item.id === "updates" ? updates : 0}
              onClick={() => setView(item.id)}
            />
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setView("machine")}
          className={cn(
            "mt-auto flex min-h-11 items-center gap-3 rounded-2xl px-3 text-left text-sm",
            view === "machine" ? "bg-primary text-primary-ink" : "text-muted hover:bg-surface hover:text-fg",
          )}
        >
          <Cpu className="size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="block font-medium">This PC</span>
            <span className={view === "machine" ? "block text-primary-ink/80" : "block text-faint"}>Sample profile</span>
          </span>
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 lg:hidden">
          <Brand compact />
          <button
            type="button"
            onClick={() => setView("machine")}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm",
              view === "machine" ? "bg-primary text-primary-ink" : "text-fg",
            )}
          >
            <Cpu className="size-4" aria-hidden="true" />
            This PC
          </button>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-4 pb-24 lg:pt-6 lg:pb-10">
          <CommandBar prominent={view === "ask"} />
          {notice ? (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <p>{notice}</p>
              <button type="button" onClick={() => setNotice(null)} className="min-h-11 shrink-0 text-muted">
                Dismiss
              </button>
            </div>
          ) : null}
          <div key={view} className="rise mt-4">
            {view === "ask" ? <Ask /> : null}
            {view === "library" ? <LibraryView /> : null}
            {view === "updates" ? <Updates /> : null}
            {view === "record" ? <Record /> : null}
            {view === "machine" ? <Machine /> : null}
          </div>
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg lg:hidden">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-sm",
              view === item.id ? "text-primary" : "text-faint",
            )}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
            {item.id === "library" && drift > 0 ? <span className="sr-only">{drift} need attention</span> : null}
            {item.id === "updates" && updates > 0 ? <span className="sr-only">{updates} updates</span> : null}
          </button>
        ))}
      </nav>
      <Overlays />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/mark.png" alt="" width={44} height={44} className="mark-glow size-11 rounded-2xl" />
      <div>
        <p className="text-lg font-semibold leading-none">
          Get<span className="text-primary">Me</span>
        </p>
        {compact ? null : <p className="mt-1 text-sm text-faint">because we got you</p>}
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  count,
  onClick,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm",
        active ? "bg-primary font-medium text-primary-ink" : "text-muted hover:bg-surface hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left">{item.label}</span>
      {count > 0 ? (
        <span className={cn("tabular-nums", active ? "text-primary-ink" : "text-accent")}>{count}</span>
      ) : null}
    </button>
  );
}

function CommandBar({ prominent }: { prominent: boolean }) {
  const submit = useGetme((s) => s.submit);
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const next = value.trim();
        if (!next) return;
        submit(next);
        setValue("");
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="getme-command" className={prominent ? "text-sm font-medium text-muted" : "sr-only"}>
        Ask, or type getme, getgone, gethelp, getupdates
      </label>
      <div className="flex gap-2">
        <input
          id="getme-command"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={prominent ? "comfyui, or something that takes dictation" : "getgone beacon"}
          autoComplete="off"
          className="min-h-12 w-full flex-1 rounded-full border border-line bg-bg-raised px-5 text-base text-fg outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <Button type="submit">Go</Button>
      </div>
    </form>
  );
}
