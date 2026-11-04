import { Button } from "@/components/ui/button";
import { Panel, Pill, RecipePill, Transcript } from "@/components/getme/bits";
import { ACCESS, planDocument, softwareById, methodOf, SUGGESTIONS, type AccessKey } from "@/lib/getme/model";
import { useGetme, type Journey } from "@/lib/getme/store";
import { usePlayScript } from "@/lib/getme/use-script";

const STEPS = ["Choose", "Plan", "Rehearse", "Install", "Yours"] as const;

function stepIndex(phase: Journey["phase"]): number {
  if (phase === "pick" || phase === "method") return 0;
  if (phase === "plan") return 1;
  if (phase === "rehearse") return 2;
  if (phase === "install") return 3;
  return 4;
}

export function Ask() {
  const journey = useGetme((s) => s.journey);
  const events = useGetme((s) => s.events);
  const installs = useGetme((s) => s.installs);
  const submit = useGetme((s) => s.submit);
  const advance = useGetme((s) => s.advanceJourney);
  const skip = useGetme((s) => s.skipJourney);
  const scriptDone = Boolean(journey && journey.script.length > 0 && journey.scriptIndex >= journey.script.length);
  const playing = (journey?.phase === "rehearse" || journey?.phase === "install") && !scriptDone;
  usePlayScript(Boolean(playing), journey?.scriptIndex ?? 0, journey?.script.length ?? 0, advance, skip);
  const harnessLabel = playing
    ? "Working"
    : journey?.phase === "rehearse" || journey?.phase === "install"
      ? "Ready"
      : journey?.phase === "fit" || journey?.phase === "done"
        ? "Recorded"
        : "Idle";

  const attention = installs.filter((i) => i.status === "installed" && (i.attention || i.updateTo));
  const recent = [...events].reverse().slice(0, 3);

  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <Panel className="flex flex-col gap-4">
        {journey && journey.phase !== "none" && journey.phase !== "present" ? (
          <ol className="flex flex-wrap gap-2">
            {STEPS.map((label, index) => {
              const current = stepIndex(journey.phase);
              const on = index === current;
              const done = index < current;
              return (
                <li
                  key={label}
                  className={
                    on
                      ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-ink"
                      : done
                        ? "rounded-full border border-primary/40 px-3 py-1 text-sm text-primary"
                        : "rounded-full border border-line px-3 py-1 text-sm text-faint"
                  }
                >
                  {label}
                </li>
              );
            })}
          </ol>
        ) : null}
        <Decision />
      </Panel>
      <Panel className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Harness</h2>
          <Pill tone={playing ? "live" : "quiet"}>{harnessLabel}</Pill>
        </div>
        <p className="text-sm text-muted">
          The agent, when one is needed, gets a short status. This side is the local transcript. It is not fed back into a model.
        </p>
        {journey && (journey.phase === "rehearse" || journey.phase === "install" || journey.phase === "fit" || journey.phase === "done") ? (
          <Transcript lines={journey.script.slice(0, journey.scriptIndex)} />
        ) : (
          <div className="flex flex-col gap-3">
            {attention.map((install) => {
              const software = softwareById(install.softwareId);
              return (
                <button
                  key={install.id}
                  type="button"
                  onClick={() => (install.attention ? submit(`getgone ${install.alias}`) : submit("getupdates"))}
                  className="rounded-2xl border border-accent/50 bg-bg px-4 py-3 text-left"
                >
                  <span className="block font-medium text-fg">{software?.name}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {install.attention ?? `Pin ${install.updateTo} is available. ${install.version} is what you have.`}
                  </span>
                </button>
              );
            })}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted">Latest in the record</h3>
              <ul className="flex flex-col gap-2">
                {recent.map((event) => (
                  <li key={event.id} className="text-sm text-fg">
                    <span className="font-mono text-faint">{event.hash}</span> {event.summary}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {playing && journey && journey.scriptIndex < journey.script.length ? (
          <Button variant="ghost" onClick={skip}>
            Show the rest
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}

function Decision() {
  const journey = useGetme((s) => s.journey);
  const submit = useGetme((s) => s.submit);
  if (!journey) return <Idle onPick={submit} />;
  if (journey.phase === "none") return <None query={journey.query} onPick={submit} />;
  if (journey.phase === "pick") return <Pick journey={journey} />;
  if (journey.phase === "present") return <Present journey={journey} />;
  if (journey.phase === "method") return <Methods journey={journey} />;
  if (journey.phase === "plan") return <Plan journey={journey} />;
  if (journey.phase === "rehearse") return <Rehearse journey={journey} />;
  if (journey.phase === "install") return <Installing journey={journey} />;
  if (journey.phase === "fit") return <Fit journey={journey} />;
  if (journey.phase === "done") return <Receipt journey={journey} />;
  return <Idle onPick={submit} />;
}

function Idle({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">Tell it what you need.</h2>
        <p className="text-muted">A name, or the job. You get a choice in plain language, then a receipt you can reverse.</p>
      </div>
      <div className="flex flex-col gap-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPick(item)}
            className="min-h-11 rounded-2xl border border-line px-4 text-left text-sm text-fg hover:border-primary/50 hover:bg-bg"
          >
            {item}
          </button>
        ))}
      </div>
      <ul className="grid gap-2 text-sm text-muted sm:grid-cols-3">
        <li>Spelling is recovered. Two fits means two choices.</li>
        <li>You see where it lives, and the trade-off that matters.</li>
        <li>The receipt says what changed, and how to take it back.</li>
      </ul>
    </div>
  );
}

function None({ query, onPick }: { query: string; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">That doesn’t name a job yet.</h2>
      <p className="text-muted">
        “{query}” isn’t a known program, and it isn’t a request GetMe can match without guessing. Guessing is how the wrong installer runs.
      </p>
      <div className="flex flex-col gap-2">
        {SUGGESTIONS.slice(0, 4).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPick(item)}
            className="min-h-11 rounded-2xl border border-line px-4 text-left text-sm hover:border-primary/50"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function Pick({ journey }: { journey: Journey }) {
  const pickSoftware = useGetme((s) => s.pickSoftware);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-primary">{journey.via}</p>
        <h2 className="mt-1 text-2xl font-semibold">Which one?</h2>
      </div>
      <div className="flex flex-col gap-2">
        {journey.candidateIds.map((id) => {
          const software = softwareById(id);
          if (!software) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => pickSoftware(id)}
              className="rounded-2xl border border-line bg-bg px-4 py-3 text-left hover:border-primary/50"
            >
              <span className="block font-medium">{software.name}</span>
              <span className="mt-1 block text-sm text-muted">{software.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Present({ journey }: { journey: Journey }) {
  const installs = useGetme((s) => s.installs);
  const openHelp = useGetme((s) => s.openHelp);
  const openGone = useGetme((s) => s.openGone);
  const setView = useGetme((s) => s.setView);
  const anotherCopy = useGetme((s) => s.anotherCopy);
  const software = journey.softwareId ? softwareById(journey.softwareId) : undefined;
  const install = installs.find((i) => i.id === journey.installId);
  if (!software || !install) return null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-primary">{journey.via}</p>
        <h2 className="mt-1 text-2xl font-semibold">{software.name} is already here.</h2>
        <p className="mt-2 text-muted">
          Alias <span className="font-mono text-fg">{install.alias}</span>. Pin {install.version}. Installing it again would be a second copy, not a repair.
        </p>
      </div>
      {install.attention ? <p className="rounded-2xl border border-accent/50 px-4 py-3 text-sm">{install.attention}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openHelp(install.id)}>Change how it opens</Button>
        {install.updateTo ? (
          <Button variant="quiet" onClick={() => setView("updates")}>
            Review update
          </Button>
        ) : null}
        <Button variant="brass" onClick={() => openGone(install.id)}>
          Remove it
        </Button>
      </div>
      <button type="button" onClick={anotherCopy} className="self-start text-sm text-muted underline-offset-2 hover:underline">
        Add another copy anyway
      </button>
    </div>
  );
}

function Methods({ journey }: { journey: Journey }) {
  const pickMethod = useGetme((s) => s.pickMethod);
  const showCandidates = useGetme((s) => s.showCandidates);
  const software = journey.softwareId ? softwareById(journey.softwareId) : undefined;
  if (!software) return null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-primary">{journey.via}</p>
        <h2 className="mt-1 text-2xl font-semibold">{software.name}</h2>
        <p className="mt-2 text-muted">{software.blurb}</p>
      </div>
      <div className="flex flex-col gap-2">
        {software.methods.map((method) => (
          <button
            key={method.id}
            type="button"
            onClick={() => pickMethod(method.id)}
            className="rounded-2xl border border-line bg-bg px-4 py-3 text-left hover:border-primary/50"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{method.label}</span>
              <RecipePill state={method.recipe} />
            </span>
            <span className="mt-2 block text-sm text-muted">{method.tradeoff}</span>
            <span className="mt-2 block text-sm text-faint">
              {method.where} Opens: {method.opens} {method.size}.
            </span>
          </button>
        ))}
      </div>
      {journey.candidateIds.length > 1 ? (
        <button type="button" onClick={showCandidates} className="self-start text-sm text-muted underline-offset-2 hover:underline">
          Those weren’t the right tools
        </button>
      ) : null}
    </div>
  );
}

function Plan({ journey }: { journey: Journey }) {
  const startRehearse = useGetme((s) => s.startRehearse);
  const showMethods = useGetme((s) => s.showMethods);
  const software = journey.softwareId ? softwareById(journey.softwareId) : undefined;
  const method = software && journey.methodId ? methodOf(software, journey.methodId) : undefined;
  if (!software || !method) return null;
  const plan = planDocument(software, method);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold">
          {method.recipe === "missing" ? "A plan, not permission." : "This is the recipe."}
        </h2>
        <p className="mt-2 text-muted">
          {method.recipe === "missing"
            ? "Nothing verified matches this method on Windows 11 24H2. What follows was schema-checked. It still does not run until you rehearse it, then approve the real install."
            : method.recipe === "lagging"
              ? "Verified for an older pin. You can still pick the newer portable recipe instead."
              : "Rehearsal happens in a model of Windows. Your profile changes only after you approve the real run."}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {method.actions.map((action) => (
          <li key={action.summary} className="rounded-2xl bg-bg px-4 py-3 text-sm">
            <span className="font-mono text-faint">{action.op}</span>
            <span className="mt-1 block">{action.summary}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Check when it finishes: {method.verify}</p>
      <details className="rounded-2xl bg-bg px-4 py-3">
        <summary className="text-sm text-muted">Show the plan the executor checks</summary>
        <pre className="mt-3 max-w-full overflow-x-auto font-mono text-xs text-faint">{JSON.stringify(plan, null, 2)}</pre>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button onClick={startRehearse}>Rehearse it</Button>
        {software.methods.length > 1 ? (
          <Button variant="quiet" onClick={showMethods}>
            Back to choices
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Rehearse({ journey }: { journey: Journey }) {
  const startInstall = useGetme((s) => s.startInstall);
  const ready = journey.scriptIndex >= journey.script.length && journey.script.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">Rehearsal</h2>
      <p className="text-muted">
        Modeled Windows. Nothing on the sample profile moves until you say so. A finished rehearsal is a prediction — the real install is observed again.
      </p>
      <Button onClick={startInstall} disabled={!ready}>
        {ready ? "Install on this profile" : "Rehearsing…"}
      </Button>
    </div>
  );
}

function Installing({ journey }: { journey: Journey }) {
  const commitInstall = useGetme((s) => s.commitInstall);
  const ready = journey.scriptIndex >= journey.script.length && journey.script.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">On the profile</h2>
      <p className="text-muted">One approval covers the plan. You won’t be asked again for each file.</p>
      <Button onClick={commitInstall} disabled={!ready}>
        {ready ? "Choose how you’ll open it" : "Installing…"}
      </Button>
    </div>
  );
}

function AccessToggles({
  selected,
  onToggle,
  hotkey,
  onHotkey,
}: {
  selected: AccessKey[];
  onToggle: (key: AccessKey) => void;
  hotkey: string;
  onHotkey: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {ACCESS.map((item) => {
        const on = selected.includes(item.id);
        return (
          <div key={item.id} className="rounded-2xl border border-line bg-bg px-3 py-2">
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(item.id)}
                className="size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-sm text-muted">{item.detail}</span>
              </span>
            </label>
            {item.id === "hotkey" && on ? (
              <div className="pr-2 pb-2 pl-7">
                <input
                  value={hotkey}
                  onChange={(event) => onHotkey(event.target.value)}
                  placeholder="Ctrl+Alt+Space"
                  className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-surface px-3 text-base"
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Fit({ journey }: { journey: Journey }) {
  const setAliasDraft = useGetme((s) => s.setAliasDraft);
  const toggleAccess = useGetme((s) => s.toggleAccess);
  const setHotkeyDraft = useGetme((s) => s.setHotkeyDraft);
  const saveFit = useGetme((s) => s.saveFit);
  const software = journey.softwareId ? softwareById(journey.softwareId) : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold">Make {software?.name} yours.</h2>
        <p className="mt-2 text-muted">This is part of the receipt, not a separate favor. You can change it later.</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">What you’ll call it</span>
        <input
          value={journey.aliasDraft}
          onChange={(event) => setAliasDraft(event.target.value)}
          className="min-h-11 rounded-2xl border border-line bg-bg px-3 text-base font-mono"
        />
      </label>
      <AccessToggles
        selected={journey.accessDraft}
        onToggle={toggleAccess}
        hotkey={journey.hotkeyDraft}
        onHotkey={setHotkeyDraft}
      />
      <Button onClick={saveFit}>Save and show the receipt</Button>
    </div>
  );
}

export function AccessEditor(props: {
  selected: AccessKey[];
  onToggle: (key: AccessKey) => void;
  hotkey: string;
  onHotkey: (value: string) => void;
}) {
  return <AccessToggles {...props} />;
}

function Receipt({ journey }: { journey: Journey }) {
  const installs = useGetme((s) => s.installs);
  const events = useGetme((s) => s.events);
  const openHelp = useGetme((s) => s.openHelp);
  const openGone = useGetme((s) => s.openGone);
  const setView = useGetme((s) => s.setView);
  const share = useGetme((s) => s.acknowledgeShare);
  const software = journey.softwareId ? softwareById(journey.softwareId) : undefined;
  const method = software && journey.methodId ? methodOf(software, journey.methodId) : undefined;
  const install = installs.find((i) => i.id === journey.installId);
  if (!software || !install || !method) return null;
  const mine = events.filter((event) => event.installId === install.id);
  const packet = {
    software: software.name,
    method: method.id,
    recipe: method.recipeId,
    os: "Windows 11 24H2",
    arch: "x64",
    result: "verified",
    paths: "[redacted]",
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-primary">Installed</p>
        <h2 className="mt-1 text-2xl font-semibold">{software.name}</h2>
        <p className="mt-2 text-muted">
          Call it <span className="font-mono text-fg">{install.alias}</span>. Pin {install.version}. {mine.length} recorded effects.
        </p>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-muted">
        <li>Opens: {install.access.map((id) => ACCESS.find((a) => a.id === id)?.label ?? id).join(", ") || "no launcher"}.</li>
        {install.hotkey ? <li>Hotkey {install.hotkey}.</li> : null}
        <li>Remove with getgone {install.alias}. Change access with gethelp {install.alias}.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={() => openHelp(install.id)}>
          Change how it opens
        </Button>
        <Button variant="quiet" onClick={() => setView("record")}>
          Open the record
        </Button>
        <Button variant="brass" onClick={() => openGone(install.id)}>
          Remove it
        </Button>
      </div>
      <div className="rounded-2xl border border-line bg-bg p-4">
        <h3 className="text-sm font-medium">Share installation metadata?</h3>
        <p className="mt-1 text-sm text-muted">
          Optional, and separate from doing the install. Declining does not weaken removal. The packet below is redacted.
        </p>
        <pre className="mt-3 overflow-x-auto font-mono text-xs text-faint">{JSON.stringify(packet, null, 2)}</pre>
        <Button className="mt-3" variant="quiet" onClick={share} disabled={journey.share}>
          {journey.share ? "Marked. Nothing was uploaded." : "Mark this packet for sharing"}
        </Button>
      </div>
    </div>
  );
}
