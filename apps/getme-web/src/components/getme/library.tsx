import { Button } from "@/components/ui/button";
import { Panel, Pill } from "@/components/getme/bits";
import { ACCESS, formatWhen, methodOf, softwareById } from "@/lib/getme/model";
import { useGetme } from "@/lib/getme/store";

export function Library() {
  const installs = useGetme((s) => s.installs);
  const events = useGetme((s) => s.events);
  const openHelp = useGetme((s) => s.openHelp);
  const openGone = useGetme((s) => s.openGone);
  const setView = useGetme((s) => s.setView);
  const submit = useGetme((s) => s.submit);
  const live = installs.filter((i) => i.status === "installed");
  const removed = installs.filter((i) => i.status === "removed");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Yours</h1>
        <p className="mt-1 text-muted">Software this profile asked GetMe to be responsible for. An alias picks an install. It is not a list of files to delete.</p>
      </div>
      {live.length === 0 ? (
        <Panel>
          <p className="text-muted">Nothing is managed right now.</p>
          <Button className="mt-4" onClick={() => setView("ask")}>
            Ask for something
          </Button>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {live.map((install) => {
            const software = softwareById(install.softwareId);
            const method = software && methodOf(software, install.methodId);
            const count = events.filter((event) => event.installId === install.id).length;
            if (!software) return null;
            return (
              <li key={install.id}>
                <Panel className={install.attention ? "border-accent/60" : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{software.name}</h2>
                      <p className="mt-1 text-sm text-muted">{software.blurb}</p>
                    </div>
                    <Pill tone="quiet">{install.alias}</Pill>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-faint">How it opens</dt>
                      <dd className="mt-1">
                        {install.access.map((id) => ACCESS.find((a) => a.id === id)?.label ?? id).join(", ")}
                        {install.hotkey ? ` · ${install.hotkey}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-faint">Since</dt>
                      <dd className="mt-1 tabular-nums">{formatWhen(install.installedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Method</dt>
                      <dd className="mt-1">{method?.label}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Record</dt>
                      <dd className="mt-1 tabular-nums">
                        Pin {install.version}
                        {install.updateTo ? ` · ${install.updateTo} waiting` : ""} · {count} events
                      </dd>
                    </div>
                  </dl>
                  {install.attention ? <p className="mt-4 text-sm text-accent">{install.attention}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="quiet" onClick={() => openHelp(install.id)}>
                      How I use it
                    </Button>
                    {install.updateTo ? (
                      <Button variant="quiet" onClick={() => setView("updates")}>
                        Update
                      </Button>
                    ) : null}
                    <Button variant="brass" onClick={() => openGone(install.id)}>
                      Remove
                    </Button>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
      {removed.length ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">Removed, still in the record</h2>
          <ul className="flex flex-col gap-2">
            {removed.map((install) => {
              const software = softwareById(install.softwareId);
              return (
                <li key={install.id}>
                  <button
                    type="button"
                    onClick={() => submit(software?.name ?? install.alias)}
                    className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-line px-4 text-left text-sm"
                  >
                    <span>{software?.name}</span>
                    <span className="text-faint">Ask again</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
