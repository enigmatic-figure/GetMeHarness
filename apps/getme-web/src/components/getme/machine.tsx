import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/getme/bits";
import { downloadJson } from "@/lib/getme/download";
import { MACHINE, PERSISTENCE } from "@/lib/getme/model";
import { useGetme } from "@/lib/getme/store";

const FACTS: { label: string; value: string; note?: string }[] = [
  { label: "System", value: `${MACHINE.os} · build ${MACHINE.build}` },
  { label: "Architecture", value: MACHINE.arch },
  { label: "CPU", value: MACHINE.cpu },
  { label: "Memory", value: MACHINE.ram },
  { label: "Disk", value: MACHINE.diskFree },
  { label: "WSL", value: MACHINE.wsl },
  { label: "Scoop", value: MACHINE.scoop },
  { label: "GPU", value: MACHINE.gpu, note: MACHINE.gpuNote },
  { label: "Execution policy", value: MACHINE.executionPolicy },
];

export function Machine() {
  const policy = useGetme((s) => s.policy);
  const setPolicy = useGetme((s) => s.setPolicy);
  const events = useGetme((s) => s.events);
  const installs = useGetme((s) => s.installs);
  const chainTip = useGetme((s) => s.chainTip);
  const depart = useGetme((s) => s.depart);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">This PC</h1>
        <p className="mt-1 text-muted">
          A sample Windows profile the front end can rehearse against. The native harness is not attached, so nothing here changes a real computer.
        </p>
      </div>
      <Panel>
        <h2 className="text-lg font-semibold">What was collected</h2>
        <p className="mt-1 text-sm text-muted">Enough to choose an install. Not a personal inventory.</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <dt className="text-sm text-faint">{fact.label}</dt>
              <dd className="mt-1">{fact.value}</dd>
              {fact.note ? <dd className="text-sm text-muted">{fact.note}</dd> : null}
            </div>
          ))}
        </dl>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">When something turns itself back on</h2>
        <div className="mt-3 flex flex-col gap-2">
          {PERSISTENCE.map((item) => (
            <label key={item.id} className="flex min-h-11 gap-3 rounded-2xl border border-line bg-bg px-3 py-3">
              <input
                type="radio"
                name="persistence"
                checked={policy.persistence === item.id}
                onChange={() => setPolicy({ persistence: item.id })}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="block text-sm text-muted">{item.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          Beacon’s task already came back. Changing this now does not rewrite that. It applies the next time.
        </p>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">GetMe on this profile</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
          <li>This front end.</li>
          <li>The journal, including receipts for Krita, Blender, and Beacon.</li>
          <li>Observation of files, registry, services, and scheduled tasks. Visible here. Turned off if GetMe leaves.</li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          Sharing metadata is off. Hosted reasoning, if a later harness uses it, is a separate disclosure. Declining a share never blocks removal.
        </p>
        <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={policy.shareMetadata}
            onChange={(event) => setPolicy({ shareMetadata: event.target.checked })}
            className="size-4 accent-primary"
          />
          Remember that I am willing to be asked about sharing
        </label>
      </Panel>
      <Panel className="border-accent/40">
        <h2 className="text-lg font-semibold">Remove GetMe</h2>
        <p className="mt-2 text-sm text-muted">
          GetMe has to meet its own rule. Export the journal first if you want the receipts after it is gone. This rehearsal can put GetMe back.
        </p>
        {open ? (
          <div className="mt-4 flex flex-col gap-3">
            <ul className="flex flex-col gap-1 text-sm text-muted">
              <li>Managed installs stay described only in the export you keep.</li>
              <li>Observation stops.</li>
              <li>Nothing already sent anywhere is unsent. Nothing was sent.</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="quiet"
                onClick={() =>
                  downloadJson("getme-record.json", {
                    chainTip,
                    machine: MACHINE,
                    installs,
                    events,
                  })
                }
              >
                Export the journal
              </Button>
              <Button variant="brass" onClick={depart}>
                Remove GetMe from this rehearsal
              </Button>
            </div>
          </div>
        ) : (
          <Button className="mt-4" variant="quiet" onClick={() => setOpen(true)}>
            Show what removal would do
          </Button>
        )}
      </Panel>
    </div>
  );
}
