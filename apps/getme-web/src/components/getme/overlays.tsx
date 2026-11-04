import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AccessEditor } from "@/components/getme/ask";
import { Field, Transcript, inputClass } from "@/components/getme/bits";
import { removalScript, softwareById } from "@/lib/getme/model";
import { useGetme } from "@/lib/getme/store";
import { usePlayScript } from "@/lib/getme/use-script";

function Sheet({
  open,
  title,
  description,
  locked,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  locked?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !locked) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/80" />
        <Dialog.Content className="fixed inset-x-3 top-4 bottom-4 z-50 mx-auto max-w-xl overflow-y-auto rounded-3xl border border-line bg-bg-raised p-5 shadow-lift focus:outline-none sm:inset-x-0">
          <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">{description}</Dialog.Description>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Overlays() {
  return (
    <>
      <HelpSheet />
      <GoneSheet />
    </>
  );
}

function HelpSheet() {
  const help = useGetme((s) => s.help);
  const helpError = useGetme((s) => s.helpError);
  const installs = useGetme((s) => s.installs);
  const closeHelp = useGetme((s) => s.closeHelp);
  const setHelpAlias = useGetme((s) => s.setHelpAlias);
  const toggleHelpAccess = useGetme((s) => s.toggleHelpAccess);
  const setHelpHotkey = useGetme((s) => s.setHelpHotkey);
  const saveHelp = useGetme((s) => s.saveHelp);
  const install = installs.find((i) => i.id === help?.installId);
  const software = install ? softwareById(install.softwareId) : undefined;
  return (
    <Sheet
      open={Boolean(help)}
      title={software ? `How you use ${software.name}` : "How you use it"}
      description="A friendly name selects this install. It is not, by itself, permission to delete anything."
      onClose={closeHelp}
    >
      {help ? (
        <div className="flex flex-col gap-4">
          <Field label="Alias" hint="What you’ll type after gethelp or getgone.">
            <input value={help.alias} onChange={(event) => setHelpAlias(event.target.value)} className={inputClass} />
          </Field>
          <AccessEditor
            selected={help.access}
            onToggle={toggleHelpAccess}
            hotkey={help.hotkey}
            onHotkey={setHelpHotkey}
          />
          {helpError ? <p className="text-sm text-accent">{helpError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveHelp}>Save</Button>
            <Button variant="quiet" onClick={closeHelp}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

function GoneSheet() {
  const gone = useGetme((s) => s.gone);
  const installs = useGetme((s) => s.installs);
  const closeGone = useGetme((s) => s.closeGone);
  const setAccent = useGetme((s) => s.setAccent);
  const setKeepDocs = useGetme((s) => s.setKeepDocs);
  const beginRemoval = useGetme((s) => s.beginRemoval);
  const advanceGone = useGetme((s) => s.advanceGone);
  const skipGone = useGetme((s) => s.skipGone);
  const completeGone = useGetme((s) => s.completeGone);
  const install = installs.find((i) => i.id === gone?.installId);
  const software = install ? softwareById(install.softwareId) : undefined;
  const playing = gone?.phase === "working" && gone.scriptIndex < gone.script.length;
  usePlayScript(Boolean(playing), gone?.scriptIndex ?? 0, gone?.script.length ?? 0, advanceGone, skipGone);

  const phase = gone?.phase;
  const scriptIndex = gone?.scriptIndex ?? 0;
  const scriptLength = gone?.script.length ?? 0;
  useEffect(() => {
    if (phase === "working" && scriptLength > 0 && scriptIndex >= scriptLength) completeGone();
  }, [phase, scriptIndex, scriptLength, completeGone]);

  const preview = software && gone ? removalScript(software, gone.accent, gone.keepDocs) : [];

  return (
    <Sheet
      open={Boolean(gone && install)}
      title={software ? `Remove ${software.name}` : "Remove"}
      description="Undo what this install owns. Work that happened afterward stays, unless you explicitly say otherwise."
      locked={gone?.phase === "working"}
      onClose={closeGone}
    >
      {gone && software && install ? (
        <div className="flex flex-col gap-4">
          {gone.phase === "review" ? (
            <>
              <ul className="flex flex-col gap-2">
                {preview.map((line) => (
                  <li key={line} className="rounded-2xl bg-bg px-4 py-3 text-sm">
                    {line}
                  </li>
                ))}
              </ul>
              {software.id === "beacon" ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">Accent was slate, then phosphor, then coral.</legend>
                  <p className="text-sm text-muted">
                    MailStamp, which GetMe does not manage, made the latest change. Putting slate back would also erase that.
                  </p>
                  {(
                    [
                      ["leave", "Leave coral", "Recommended. MailStamp’s later edit stays."],
                      ["phosphor", "Back to phosphor", "Beacon’s value. Overwrites coral."],
                      ["slate", "Back to slate", "The value from before Beacon. Overwrites both later edits."],
                    ] as const
                  ).map(([id, label, detail]) => (
                    <label key={id} className="flex min-h-11 gap-3 rounded-2xl border border-line bg-bg px-3 py-3">
                      <input
                        type="radio"
                        name="accent"
                        checked={gone.accent === id}
                        onChange={() => setAccent(id)}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-sm text-muted">{detail}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={gone.keepDocs}
                  onChange={(event) => setKeepDocs(event.target.checked)}
                  className="size-4 accent-primary"
                />
                Keep files I created
              </label>
              <div className="flex flex-wrap gap-2">
                <Button variant="brass" onClick={beginRemoval}>
                  Remove {software.name}
                </Button>
                <Button variant="quiet" onClick={closeGone}>
                  Cancel
                </Button>
              </div>
            </>
          ) : null}
          {gone.phase === "working" ? (
            <div className="flex flex-col gap-3">
              <Transcript lines={gone.script.slice(0, gone.scriptIndex)} />
              {gone.scriptIndex < gone.script.length ? (
                <Button variant="ghost" onClick={skipGone}>
                  Show the rest
                </Button>
              ) : (
                <p className="text-sm text-muted">Writing the removal into the record…</p>
              )}
            </div>
          ) : null}
          {gone.phase === "done" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {software.name} is no longer managed. The record still has the install and the removal, so you can see what was restored, deleted, kept, or left unresolved.
              </p>
              <Button onClick={closeGone}>Close</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
