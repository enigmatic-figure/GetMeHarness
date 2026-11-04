import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  accessDraft,
  buildSeed,
  findInstall,
  installDrafts,
  installScript,
  methodOf,
  parseCommand,
  rehearseScript,
  removalDrafts,
  removalScript,
  resolveQuery,
  seal,
  softwareById,
  uniqueAlias,
  updateScript,
  type AccentChoice,
  type AccessKey,
  type Install,
  type JournalEvent,
  type PersistenceMode,
} from "@/lib/getme/model";

export type Phase = "none" | "pick" | "method" | "plan" | "rehearse" | "install" | "fit" | "done" | "present";

export type View = "ask" | "library" | "updates" | "record" | "machine";

export type Journey = {
  query: string;
  via: string;
  phase: Phase;
  candidateIds: string[];
  softwareId?: string;
  methodId?: string;
  script: string[];
  scriptIndex: number;
  aliasDraft: string;
  accessDraft: AccessKey[];
  hotkeyDraft: string;
  share: boolean;
  installId?: string;
};

export type Gone = {
  installId: string;
  phase: "review" | "working" | "done";
  accent: AccentChoice;
  keepDocs: boolean;
  script: string[];
  scriptIndex: number;
};

export type Help = {
  installId: string;
  alias: string;
  access: AccessKey[];
  hotkey: string;
};

export type UpdateRun = {
  installId: string;
  script: string[];
  scriptIndex: number;
};

type Persisted = {
  installs: Install[];
  events: JournalEvent[];
  chainTip: string;
  policy: { persistence: PersistenceMode; shareMetadata: boolean };
  selfRemoved: boolean;
};

type Store = Persisted & {
  view: View;
  journey: Journey | null;
  gone: Gone | null;
  help: Help | null;
  helpError: string | null;
  notice: string | null;
  recordFilter: string;
  updateFocus: string[];
  updateRun: UpdateRun | null;
  setView: (view: View) => void;
  setNotice: (notice: string | null) => void;
  setRecordFilter: (id: string) => void;
  setPolicy: (patch: Partial<Store["policy"]>) => void;
  submit: (raw: string) => void;
  pickSoftware: (id: string) => void;
  pickMethod: (id: string) => void;
  startRehearse: () => void;
  startInstall: () => void;
  advanceJourney: () => void;
  skipJourney: () => void;
  commitInstall: () => void;
  setAliasDraft: (alias: string) => void;
  toggleAccess: (key: AccessKey) => void;
  setHotkeyDraft: (hotkey: string) => void;
  setShare: (share: boolean) => void;
  saveFit: () => void;
  anotherCopy: () => void;
  openGone: (installId: string) => void;
  closeGone: () => void;
  setAccent: (accent: AccentChoice) => void;
  setKeepDocs: (keep: boolean) => void;
  beginRemoval: () => void;
  advanceGone: () => void;
  skipGone: () => void;
  completeGone: () => void;
  openHelp: (installId: string) => void;
  closeHelp: () => void;
  setHelpAlias: (alias: string) => void;
  toggleHelpAccess: (key: AccessKey) => void;
  setHelpHotkey: (hotkey: string) => void;
  saveHelp: () => void;
  startUpdate: (installId: string) => void;
  advanceUpdate: () => void;
  skipUpdate: () => void;
  finishUpdate: () => void;
  acknowledgeShare: () => void;
  showMethods: () => void;
  showCandidates: () => void;
  depart: () => void;
  reset: () => void;
};

function blankJourney(partial: Partial<Journey> & Pick<Journey, "query" | "phase">): Journey {
  return {
    via: "",
    candidateIds: [],
    script: [],
    scriptIndex: 0,
    aliasDraft: "",
    accessDraft: ["start"],
    hotkeyDraft: "",
    share: false,
    ...partial,
  };
}

function nowStamp(): string {
  return new Date().toISOString();
}

function append(state: Persisted, drafts: Parameters<typeof seal>[0]): Pick<Persisted, "events" | "chainTip"> {
  const sealed = seal(drafts, state.chainTip);
  return { events: [...state.events, ...sealed.events], chainTip: sealed.chainTip };
}

const seeded = buildSeed();

const initial = {
  installs: seeded.installs,
  events: seeded.events,
  chainTip: seeded.chainTip,
  policy: { persistence: "ask" as const, shareMetadata: false },
  selfRemoved: false,
  view: "ask" as const,
  journey: null,
  gone: null,
  help: null,
  helpError: null as string | null,
  notice: null as string | null,
  recordFilter: "all",
  updateFocus: [] as string[],
  updateRun: null,
};

export const useGetme = create<Store>()(
  persist(
    (set, get) => ({
      ...initial,
      setView: (view) => set({ view, notice: null }),
      setNotice: (notice) => set({ notice }),
      setRecordFilter: (recordFilter) => set({ recordFilter, view: "record" }),
      setPolicy: (patch) => set({ policy: { ...get().policy, ...patch } }),
      submit: (raw) => {
        const cmd = parseCommand(raw);
        const state = get();
        if (cmd.kind === "empty") return;
        if (cmd.kind === "gone") {
          const install = findInstall(cmd.alias, state.installs);
          if (!install) {
            set({ notice: `Nothing managed here is called “${cmd.alias.trim()}”.`, view: "library", help: null, gone: null });
            return;
          }
          set({
            view: "library",
            notice: null,
            help: null,
            gone: { installId: install.id, phase: "review", accent: "leave", keepDocs: true, script: [], scriptIndex: 0 },
          });
          return;
        }
        if (cmd.kind === "help") {
          const install = findInstall(cmd.alias, state.installs);
          if (!install) {
            set({ notice: `Nothing managed here is called “${cmd.alias.trim()}”.`, view: "library" });
            return;
          }
          set({
            view: "library",
            notice: null,
            gone: null,
            helpError: null,
            help: { installId: install.id, alias: install.alias, access: [...install.access], hotkey: install.hotkey },
          });
          return;
        }
        if (cmd.kind === "updates") {
          set({ view: "updates", notice: null, updateFocus: cmd.aliases, gone: null, help: null });
          return;
        }
        const resolved = resolveQuery(cmd.query);
        if (resolved.kind === "none") {
          set({
            view: "ask",
            notice: null,
            gone: null,
            help: null,
            journey: blankJourney({ query: cmd.query, phase: "none" }),
          });
          return;
        }
        if (resolved.kind === "many") {
          set({
            view: "ask",
            notice: null,
            gone: null,
            help: null,
            journey: blankJourney({
              query: cmd.query,
              phase: "pick",
              via: resolved.via,
              candidateIds: resolved.software.map((s) => s.id),
            }),
          });
          return;
        }
        const existing = state.installs.find((i) => i.status === "installed" && i.softwareId === resolved.software.id);
        if (existing) {
          set({
            view: "ask",
            notice: null,
            gone: null,
            help: null,
            journey: blankJourney({
              query: cmd.query,
              phase: "present",
              via: resolved.via,
              softwareId: resolved.software.id,
              candidateIds: [resolved.software.id],
              installId: existing.id,
            }),
          });
          return;
        }
        set({
          view: "ask",
          notice: null,
          gone: null,
          help: null,
          journey: blankJourney({
            query: cmd.query,
            phase: "method",
            via: resolved.via,
            softwareId: resolved.software.id,
            candidateIds: [resolved.software.id],
          }),
        });
      },
      pickSoftware: (id) => {
        const journey = get().journey;
        const software = softwareById(id);
        if (!journey || !software) return;
        const existing = get().installs.find((i) => i.status === "installed" && i.softwareId === id);
        if (existing) {
          set({
            journey: {
              ...journey,
              phase: "present",
              softwareId: id,
              installId: existing.id,
              via: journey.via,
            },
          });
          return;
        }
        set({ journey: { ...journey, phase: "method", softwareId: id } });
      },
      pickMethod: (methodId) => {
        const journey = get().journey;
        if (!journey) return;
        set({ journey: { ...journey, phase: "plan", methodId } });
      },
      showMethods: () => {
        const journey = get().journey;
        if (!journey) return;
        set({ journey: { ...journey, phase: "method", methodId: undefined, script: [], scriptIndex: 0 } });
      },
      showCandidates: () => {
        const journey = get().journey;
        if (!journey) return;
        set({ journey: { ...journey, phase: "pick", softwareId: undefined, methodId: undefined } });
      },
      startRehearse: () => {
        const journey = get().journey;
        if (!journey?.softwareId || !journey.methodId) return;
        const software = softwareById(journey.softwareId);
        const method = software && methodOf(software, journey.methodId);
        if (!software || !method) return;
        set({ journey: { ...journey, phase: "rehearse", script: rehearseScript(software, method), scriptIndex: 0 } });
      },
      startInstall: () => {
        const journey = get().journey;
        if (!journey?.softwareId || !journey.methodId) return;
        const software = softwareById(journey.softwareId);
        const method = software && methodOf(software, journey.methodId);
        if (!software || !method) return;
        set({ journey: { ...journey, phase: "install", script: installScript(software, method), scriptIndex: 0 } });
      },
      advanceJourney: () => {
        const journey = get().journey;
        if (!journey) return;
        set({ journey: { ...journey, scriptIndex: Math.min(journey.script.length, journey.scriptIndex + 1) } });
      },
      skipJourney: () => {
        const journey = get().journey;
        if (!journey) return;
        set({ journey: { ...journey, scriptIndex: journey.script.length } });
      },
      commitInstall: () => {
        const state = get();
        const journey = state.journey;
        if (!journey?.softwareId || !journey.methodId) return;
        const software = softwareById(journey.softwareId);
        const method = software && methodOf(software, journey.methodId);
        if (!software || !method) return;
        const alias = uniqueAlias(software.alias, state.installs);
        const at = nowStamp();
        const install: Install = {
          id: `ins-${software.id}-${at.slice(11, 19).replace(/:/g, "")}`,
          softwareId: software.id,
          alias,
          methodId: method.id,
          version: method.version,
          installedAt: at,
          access: ["start"],
          hotkey: "",
          status: "installed",
        };
        const drafted = [...installDrafts(install, software, method, at), accessDraft(install, at)];
        const next = append(state, drafted);
        set({
          installs: [...state.installs, install],
          ...next,
          journey: {
            ...journey,
            phase: "fit",
            installId: install.id,
            aliasDraft: alias,
            accessDraft: ["start"],
            hotkeyDraft: "",
          },
        });
      },
      setAliasDraft: (aliasDraft) => {
        const journey = get().journey;
        if (!journey) return;
        set({ journey: { ...journey, aliasDraft } });
      },
      toggleAccess: (key) => {
        const journey = get().journey;
        if (!journey) return;
        const has = journey.accessDraft.includes(key);
        const accessDraft = has ? journey.accessDraft.filter((k) => k !== key) : [...journey.accessDraft, key];
        set({ journey: { ...journey, accessDraft } });
      },
      setHotkeyDraft: (hotkeyDraft) => {
        const journey = get().journey;
        if (!journey) return;
        set({ journey: { ...journey, hotkeyDraft } });
      },
      setShare: (share) => {
        const journey = get().journey;
        if (!journey) return;
        set({ journey: { ...journey, share } });
      },
      saveFit: () => {
        const state = get();
        const journey = state.journey;
        if (!journey?.installId) return;
        const install = state.installs.find((i) => i.id === journey.installId);
        if (!install) return;
        const alias = uniqueAlias(journey.aliasDraft || install.alias, state.installs.filter((i) => i.id !== install.id));
        const access = journey.accessDraft.length ? journey.accessDraft : install.access;
        const hotkey = access.includes("hotkey") ? journey.hotkeyDraft.trim() : "";
        if (access.includes("hotkey") && !hotkey) {
          set({ notice: "Type the hotkey, or turn that option off." });
          return;
        }
        const nextInstall: Install = { ...install, alias, access, hotkey };
        const at = nowStamp();
        const previous = `${install.alias}: ${install.access.join(", ")}`;
        const changed = alias !== install.alias || hotkey !== install.hotkey || access.join() !== install.access.join();
        const next = changed ? append(state, [accessDraft(nextInstall, at, previous)]) : { events: state.events, chainTip: state.chainTip };
        set({
          installs: state.installs.map((i) => (i.id === install.id ? nextInstall : i)),
          ...next,
          journey: { ...journey, phase: "done", aliasDraft: alias },
        });
      },
      anotherCopy: () => {
        const journey = get().journey;
        if (!journey?.softwareId) return;
        set({
          journey: {
            ...journey,
            phase: "method",
            installId: undefined,
            methodId: undefined,
            via: "Another copy, with its own receipt.",
          },
        });
      },
      openGone: (installId) =>
        set({
          gone: { installId, phase: "review", accent: "leave", keepDocs: true, script: [], scriptIndex: 0 },
          help: null,
        }),
      closeGone: () => set({ gone: null }),
      setAccent: (accent) => {
        const gone = get().gone;
        if (!gone || gone.phase !== "review") return;
        set({ gone: { ...gone, accent } });
      },
      setKeepDocs: (keepDocs) => {
        const gone = get().gone;
        if (!gone || gone.phase !== "review") return;
        set({ gone: { ...gone, keepDocs } });
      },
      beginRemoval: () => {
        const gone = get().gone;
        if (!gone) return;
        const install = get().installs.find((i) => i.id === gone.installId);
        const software = install && softwareById(install.softwareId);
        if (!software) return;
        set({
          gone: {
            ...gone,
            phase: "working",
            script: removalScript(software, gone.accent, gone.keepDocs),
            scriptIndex: 0,
          },
        });
      },
      advanceGone: () => {
        const gone = get().gone;
        if (!gone) return;
        set({ gone: { ...gone, scriptIndex: Math.min(gone.script.length, gone.scriptIndex + 1) } });
      },
      skipGone: () => {
        const gone = get().gone;
        if (!gone) return;
        set({ gone: { ...gone, scriptIndex: gone.script.length } });
      },
      completeGone: () => {
        const state = get();
        const gone = state.gone;
        if (!gone || gone.phase !== "working") return;
        const install = state.installs.find((i) => i.id === gone.installId);
        const software = install && softwareById(install.softwareId);
        if (!install || !software) return;
        const at = nowStamp();
        const drafts = removalDrafts(install, software, at, gone.accent, gone.keepDocs);
        const next = append(state, drafts);
        set({
          ...next,
          installs: state.installs.map((i) =>
            i.id === install.id ? { ...i, status: "removed", removedAt: at, attention: undefined, updateTo: undefined } : i,
          ),
          gone: { ...gone, phase: "done" },
        });
      },
      openHelp: (installId) => {
        const install = get().installs.find((i) => i.id === installId && i.status === "installed");
        if (!install) return;
        set({
          help: { installId, alias: install.alias, access: [...install.access], hotkey: install.hotkey },
          helpError: null,
          gone: null,
        });
      },
      closeHelp: () => set({ help: null, helpError: null }),
      setHelpAlias: (alias) => {
        const help = get().help;
        if (!help) return;
        set({ help: { ...help, alias }, helpError: null });
      },
      toggleHelpAccess: (key) => {
        const help = get().help;
        if (!help) return;
        const has = help.access.includes(key);
        set({ help: { ...help, access: has ? help.access.filter((k) => k !== key) : [...help.access, key] } });
      },
      setHelpHotkey: (hotkey) => {
        const help = get().help;
        if (!help) return;
        set({ help: { ...help, hotkey } });
      },
      saveHelp: () => {
        const state = get();
        const help = state.help;
        if (!help) return;
        const install = state.installs.find((i) => i.id === help.installId);
        if (!install) return;
        const alias = help.alias.trim().toLowerCase();
        if (!/^[a-z][a-z0-9-]{0,24}$/.test(alias)) {
          set({ helpError: "Use a short name: a letter, then letters, numbers, or hyphens." });
          return;
        }
        const taken = state.installs.some((i) => i.status === "installed" && i.id !== install.id && i.alias === alias);
        if (taken) {
          set({ helpError: "That name already belongs to another install." });
          return;
        }
        const access = help.access;
        const hotkey = access.includes("hotkey") ? help.hotkey.trim() : "";
        if (access.includes("hotkey") && !hotkey) {
          set({ helpError: "Type the hotkey, or turn that option off." });
          return;
        }
        const nextInstall: Install = { ...install, alias, access, hotkey };
        const changed = alias !== install.alias || hotkey !== install.hotkey || access.join() !== install.access.join();
        const previous = `${install.alias}: ${install.access.join(", ")}`;
        const next = changed
          ? append(state, [accessDraft(nextInstall, nowStamp(), previous)])
          : { events: state.events, chainTip: state.chainTip };
        set({
          installs: state.installs.map((i) => (i.id === install.id ? nextInstall : i)),
          ...next,
          help: null,
          helpError: null,
          notice: changed ? `${softwareById(install.softwareId)?.name ?? "It"} now answers to ${alias}.` : null,
        });
      },
      startUpdate: (installId) => {
        const install = get().installs.find((i) => i.id === installId);
        const software = install && softwareById(install.softwareId);
        if (!install?.updateTo || !software) return;
        set({
          updateRun: {
            installId,
            script: updateScript(software, install.version, install.updateTo),
            scriptIndex: 0,
          },
        });
      },
      advanceUpdate: () => {
        const updateRun = get().updateRun;
        if (!updateRun) return;
        set({ updateRun: { ...updateRun, scriptIndex: Math.min(updateRun.script.length, updateRun.scriptIndex + 1) } });
      },
      skipUpdate: () => {
        const updateRun = get().updateRun;
        if (!updateRun) return;
        set({ updateRun: { ...updateRun, scriptIndex: updateRun.script.length } });
      },
      finishUpdate: () => {
        const state = get();
        const run = state.updateRun;
        if (!run) return;
        const install = state.installs.find((i) => i.id === run.installId);
        const software = install && softwareById(install.softwareId);
        if (!install?.updateTo || !software) return;
        const from = install.version;
        const to = install.updateTo;
        const at = nowStamp();
        const next = append(state, [
          {
            id: `${install.id}-upd-${at}`,
            at,
            installId: install.id,
            alias: install.alias,
            kind: "update",
            certainty: "observed",
            summary: `Updated ${software.name} from ${from} to ${to}`,
            detail: "Owned program files replaced. Settings and documents were not reset. The older pin stays in the record.",
            before: from,
            after: to,
          },
        ]);
        set({
          ...next,
          installs: state.installs.map((i) => (i.id === install.id ? { ...i, version: to, updateTo: undefined } : i)),
          updateRun: null,
          notice: `${software.name} is on pin ${to}.`,
        });
      },
      acknowledgeShare: () => {
        const state = get();
        const journey = state.journey;
        if (!journey?.installId || journey.share) return;
        const install = state.installs.find((i) => i.id === journey.installId);
        if (!install) return;
        const at = nowStamp();
        const next = append(state, [
          {
            id: `${install.id}-share-${at}`,
            at,
            installId: install.id,
            alias: install.alias,
            kind: "note",
            certainty: "observed",
            summary: "A redacted receipt was marked for sharing",
            detail: "Paths and account details stripped. Nothing was uploaded — this rehearsal has no share service connected.",
          },
        ]);
        set({ ...next, journey: { ...journey, share: true } });
      },
      depart: () => set({ selfRemoved: true, journey: null, gone: null, help: null, updateRun: null }),
      reset: () => {
        const fresh = buildSeed();
        set({
          ...initial,
          installs: fresh.installs,
          events: fresh.events,
          chainTip: fresh.chainTip,
          selfRemoved: false,
          policy: { persistence: "ask", shareMetadata: false },
        });
      },
    }),
    {
      name: "getme-front-v1",
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        installs: state.installs,
        events: state.events,
        chainTip: state.chainTip,
        policy: state.policy,
        selfRemoved: state.selfRemoved,
      }),
    },
  ),
);
