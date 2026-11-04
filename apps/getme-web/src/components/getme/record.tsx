import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CertaintyPill, Panel } from "@/components/getme/bits";
import { downloadJson } from "@/lib/getme/download";
import { formatDay, formatWhen, MACHINE, type JournalEvent } from "@/lib/getme/model";
import { useGetme } from "@/lib/getme/store";

export function Record() {
  const events = useGetme((s) => s.events);
  const installs = useGetme((s) => s.installs);
  const chainTip = useGetme((s) => s.chainTip);
  const filter = useGetme((s) => s.recordFilter);
  const setFilter = useGetme((s) => s.setRecordFilter);
  const [openId, setOpenId] = useState<string | null>(null);

  const aliases = new Map<string, string>();
  aliases.set("getme", "getme");
  for (const event of events) aliases.set(event.installId, event.alias);
  for (const install of installs) {
    aliases.set(install.id, install.status === "removed" ? `${install.alias} · gone` : install.alias);
  }

  const visible = filter === "all" ? events : events.filter((event) => event.installId === filter || event.alias === filter);
  const reversed = [...visible].reverse();
  const groups: { day: string; items: JournalEvent[] }[] = [];
  for (const event of reversed) {
    const day = formatDay(event.at);
    const last = groups[groups.length - 1];
    if (!last || last.day !== day) groups.push({ day, items: [event] });
    else last.items.push(event);
  }

  const chips: { id: string; label: string }[] = [{ id: "all", label: "All" }];
  for (const [id, label] of aliases) {
    if (id === "getme" || installs.some((install) => install.id === id)) chips.push({ id, label });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Record</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Append-only, on this profile. Each line carries the hash of the line before it. A local chain lets you notice tampering. It does not stop an administrator from rewriting the file.
          </p>
        </div>
        <Button
          variant="quiet"
          onClick={() =>
            downloadJson("getme-record.json", {
              chainTip,
              machine: MACHINE,
              installs,
              events,
              note: "Sample profile rehearsal. Hashes are a local chain, not an external anchor.",
            })
          }
        >
          Export JSON
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={
              filter === chip.id
                ? "min-h-11 rounded-full bg-primary px-4 text-sm font-medium text-primary-ink"
                : "min-h-11 rounded-full border border-line px-4 text-sm text-muted"
            }
          >
            {chip.label}
          </button>
        ))}
      </div>
      <p className="font-mono text-sm text-faint">
        Tip {chainTip} · {events.length} events
      </p>
      {groups.map((group) => (
        <section key={group.day} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">{group.day}</h2>
          <ul className="flex flex-col gap-2">
            {group.items.map((event) => {
              const open = openId === event.id;
              return (
                <li key={event.id}>
                  <Panel className="p-4">
                    <button type="button" onClick={() => setOpenId(open ? null : event.id)} className="flex w-full flex-col gap-2 text-left">
                      <span className="flex flex-wrap items-center gap-2">
                        <CertaintyPill certainty={event.certainty} />
                        <span className="font-mono text-sm text-faint">{event.alias}</span>
                        <span className="font-mono text-sm text-faint tabular-nums">{formatWhen(event.at)}</span>
                      </span>
                      <span className="font-medium">{event.summary}</span>
                    </button>
                    {open ? (
                      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 text-sm text-muted">
                        <p>{event.detail}</p>
                        {event.before || event.after ? (
                          <p className="font-mono text-fg">
                            {event.before ?? "—"} → {event.after ?? "—"}
                          </p>
                        ) : null}
                        <p className="font-mono text-faint">
                          {event.kind} · {event.hash} · prev {event.prev}
                        </p>
                      </div>
                    ) : null}
                  </Panel>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
