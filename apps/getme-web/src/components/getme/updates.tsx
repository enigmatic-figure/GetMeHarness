import { Button } from "@/components/ui/button";
import { Panel, Transcript } from "@/components/getme/bits";
import { softwareById } from "@/lib/getme/model";
import { useGetme } from "@/lib/getme/store";
import { usePlayScript } from "@/lib/getme/use-script";

export function Updates() {
  const installs = useGetme((s) => s.installs);
  const updateRun = useGetme((s) => s.updateRun);
  const startUpdate = useGetme((s) => s.startUpdate);
  const advanceUpdate = useGetme((s) => s.advanceUpdate);
  const skipUpdate = useGetme((s) => s.skipUpdate);
  const finishUpdate = useGetme((s) => s.finishUpdate);
  const live = installs.filter((i) => i.status === "installed");
  const playing = Boolean(updateRun && updateRun.scriptIndex < updateRun.script.length);
  usePlayScript(playing, updateRun?.scriptIndex ?? 0, updateRun?.script.length ?? 0, advanceUpdate, skipUpdate);

  const ready = Boolean(updateRun && updateRun.script.length > 0 && updateRun.scriptIndex >= updateRun.script.length);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Updates</h1>
        <p className="mt-1 text-muted">
          Pins from the sample recipe store, not a live lookup. An update replaces owned program files. It does not reset how you open the app, and it does not pretend to be urgent.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {live.map((install) => {
          const software = softwareById(install.softwareId);
          if (!software) return null;
          const running = updateRun?.installId === install.id;
          return (
            <li key={install.id}>
              <Panel>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-semibold">{software.name}</h2>
                  <span className="font-mono text-sm text-faint">{install.alias}</span>
                </div>
                {install.updateTo ? (
                  <p className="mt-2 text-muted">
                    You have pin <span className="tabular-nums text-fg">{install.version}</span>. Pin{" "}
                    <span className="tabular-nums text-fg">{install.updateTo}</span> is in the store.
                  </p>
                ) : (
                  <p className="mt-2 text-muted">Current for this store. Pin {install.version}.</p>
                )}
                {running ? (
                  <div className="mt-4 flex flex-col gap-3">
                    <Transcript lines={updateRun.script.slice(0, updateRun.scriptIndex)} />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={finishUpdate} disabled={!ready}>
                        {ready ? "Write it into the receipt" : "Updating…"}
                      </Button>
                      {!ready ? (
                        <Button variant="ghost" onClick={skipUpdate}>
                          Show the rest
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : install.updateTo ? (
                  <Button className="mt-4" onClick={() => startUpdate(install.id)} disabled={Boolean(updateRun)}>
                    Review and install
                  </Button>
                ) : null}
              </Panel>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
