// The wire contract between the web front end and the GetMe CLI harness.
//
// packages/getme (@earendil-works/pi-getme) is the source of truth for every cross-boundary shape:
// the plan the executor validates, the request envelope a command becomes, the receipt the user keeps,
// the managed-installation registry entry, and the user policy. The front end must not invent its own
// dialect — these adapters translate the prototype's draft model into those schema types, so a plan or
// receipt shown in the browser matches what the CLI harness journals and replays.
//
// Prototype caveat: the seeded catalog uses short illustrative op names ("fetch", "install"). The
// executor rejects unknown verbs, so rewriteOp() maps them onto the closed `actionTypes` vocabulary and
// unmappedPlanOps() reports anything left untranslatable — visible debt instead of silent drift.
// Step params stay human-readable notes until the real backend supplies structured parameters.

import {
  ACCESS_SCHEMA_VERSION,
  type ActionType,
  type AccessKind,
  type Alias,
  type ApprovalLevel,
  type DateTime,
  type IdToken,
  type InstallationId,
  type InstallationPlan,
  type IntegrityAssurance,
  LIFECYCLE_SCHEMA_VERSION,
  type ManagedInstallation,
  PLAN_SCHEMA_ID,
  PLAN_SCHEMA_VERSION,
  type PlanPhase,
  type PlanStep,
  type PolicyResponse,
  type PrivilegeClass,
  LIFECYCLE_SCHEMA_ID,
  type Receipt,
  RECORD_SCHEMA_ID,
  type RequestEnvelope,
  RECIPE_SCHEMA_ID,
} from "@earendil-works/pi-getme";
import type { AccessKey, Command, Install, JournalEvent, PersistenceMode, Software } from "./model.ts";

export const CONTRACT_VERSIONS = {
  plan: PLAN_SCHEMA_VERSION,
  lifecycle: LIFECYCLE_SCHEMA_VERSION,
  access: ACCESS_SCHEMA_VERSION,
} as const;

/** Deterministic UUIDv4 installation identity derived from the front end's install id. */
export function installationId(installId: string): InstallationId {
  let h1 = 0x811c9dc5;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < installId.length; i++) {
    const c = installId.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul((h2 + c) | 0, 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  const a = hex(h1);
  const b = hex(h2);
  const c = hex(Math.imul(h1 ^ h2, 0x27d4eb2d) >>> 0);
  return `${a}-${a.slice(0, 4)}-4${b.slice(1, 4)}-${((h1 & 0x3) | 0x8).toString(16)}${b.slice(4, 7)}-${b}${c}` as InstallationId;
}

/** Front-end access choices mapped onto the harness AccessKind vocabulary (access.ts). */
const ACCESS_KIND_BY_KEY: Record<AccessKey, AccessKind> = {
  start: "start-menu-shortcut",
  desktop: "desktop-shortcut",
  taskbar: "start-menu-shortcut",
  bar: "cli-wrapper",
  hotkey: "hotkey",
};

export function accessKinds(keys: AccessKey[]): AccessKind[] {
  return keys.map((key) => ACCESS_KIND_BY_KEY[key]);
}

/** Legacy draft ops → the closed executor verb list (`actionTypes` in plan.ts). */
const OP_REWRITES: Record<string, ActionType> = {
  precondition: "probe.run",
  fetch: "fetch.download",
  extract: "archive.extract",
  install: "exe.silent",
  setting: "registry.setValue",
  registry: "registry.setValue",
  task: "task.register",
  venv: "process.run",
  discover: "probe.run",
  own: "observe.snapshot",
  stage: "fs.createDirectory",
  verify: "verify.run",
};

/** Privilege class implied per verb, at minimum. The executor re-validates against real token caps. */
const PRIVILEGE_BY_OP: Record<string, PrivilegeClass> = {
  "probe.run": "none",
  "fetch.download": "userProfileWrite",
  "archive.extract": "userProfileWrite",
  "exe.silent": "programFilesWrite",
  "registry.setValue": "perUserRegistry",
  "task.register": "taskScheduling",
  "process.run": "userProfileWrite",
  "observe.snapshot": "none",
  "fs.createDirectory": "userProfileWrite",
  "verify.run": "none",
  "script.run": "userProfileWrite",
};

export function rewriteOp(op: string): ActionType {
  const rewritten = OP_REWRITES[op];
  if (rewritten) return rewritten;
  if ((ACTION_TYPE_SET as Set<string>).has(op)) return op as ActionType;
  return "script.run";
}

/** Draft op names in a method that have no equivalent executor verb — the catalog's debt list. */
export function unmappedPlanOps(software: Software): string[] {
  const out = new Set<string>();
  for (const method of software.methods) {
    for (const action of method.actions) {
      const op = action.op;
      if (!(op in OP_REWRITES) && !(ACTION_TYPE_SET as Set<string>).has(op)) out.add(op);
    }
  }
  return [...out];
}

function classifyPhase(op: string, summary: string): PlanPhase {
  if (op === "precondition" || op === "discover" || op === "probe.run") return "resolve";
  if (op === "verify" || op === "verify.run") return "receipt";
  if (/shortcut|opens|hotkey/i.test(summary)) return "configure";
  return "install";
}

/**
 * The plan document the UI shows, shaped as the harness InstallationPlan (plan.ts).
 * A missing recipe means createdBy "agent" (discovery), matching the vision's retrieval-first rule.
 */
export function harnessPlanDocument(
  software: Software,
  methodId: string,
  alias: string,
  createdAt: DateTime,
): InstallationPlan | null {
  const method = software.methods.find((m) => m.id === methodId);
  if (!method) return null;
  const steps: PlanStep[] = method.actions.map((action, index) => {
    const type = rewriteOp(action.op);
    return {
      id: `step-${index + 1}`,
      type,
      params: { note: action.summary, ...action.args },
      purpose: action.summary,
      privileges: [PRIVILEGE_BY_OP[type] ?? "userProfileWrite"],
      approval: approvalFor(method, type),
      timeout: { seconds: 600 },
      onFailure: type === "verify.run" ? "abort-and-compensate" : "compensate",
      verification:
        index === method.actions.length - 1
          ? [{ id: `verify-${index + 1}`, kind: "capabilityProbe", expect: method.verify }]
          : undefined,
    };
  });
  const zeroHash = "sha256:" + "0".repeat(64);
  return {
    schema: PLAN_SCHEMA_ID,
    schemaVersion: PLAN_SCHEMA_VERSION,
    planId: `web-${installationId(software.id).slice(0, 23)}`,
    installationId: installationId(`${software.id}/${method.id}`),
    alias: alias as Alias,
    phase: "install",
    createdAt,
    createdBy: method.recipe === "missing" ? "agent" : "recipe",
    intent: `${software.name} via ${method.label}.`,
    target: { name: software.name, publisher: software.publisher, version: method.version },
    environment: {},
    recipe:
      method.recipe === "missing"
        ? undefined
        : {
            recipeId: method.recipeId.replace(/[^a-z0-9._-]/gi, "-").toLowerCase(),
            revision: method.version,
            contentHash: zeroHash,
            matchBasis: ["version", "method", "environment"],
          },
    steps,
    rollbackStrategy:
      method.id === "fixture" || method.recipe === "missing"
        ? "per-step-compensation"
        : "vendor-uninstaller-then-reconcile",
    coverageDeclaration:
      "Prototype front end: this plan describes intent only. No host observation was wired; the rehearsal transcript is a prediction, and the real run needs its own delta.",
    consent: { scopeSummary: `Install ${software.name} (${method.label}), then configure how it opens.` },
  };
}

function approvalFor(method: { recipe: string }, type: ActionType): ApprovalLevel {
  if (type === "task.register" || type === "exe.silent") return "confirm";
  if (method.recipe === "missing") return "explain";
  return "automatic";
}

/** A command-bar line expressed as the harness RequestEnvelope (lifecycle.ts). */
export function toRequestEnvelope(cmd: Exclude<Command, { kind: "empty" }>, raw: string): RequestEnvelope {
  const base = {
    requestId: `web-${Date.now().toString(36)}` as IdToken,
    rawInput: raw,
    path: "deterministic-form" as const,
  };
  switch (cmd.kind) {
    case "gone":
      return { ...base, verb: "getgone", resolvedTarget: "alias" };
    case "help":
      return { ...base, verb: "gethelp", resolvedTarget: "alias" };
    case "updates":
      return cmd.aliases.length
        ? { ...base, verb: "get-updates-list", resolvedTarget: "alias" }
        : { ...base, verb: "getupdates" };
    case "getme":
      return { ...base, verb: "getme" };
    default: {
      const exhausted: never = cmd;
      throw new Error(`No request envelope for command kind: ${JSON.stringify(exhausted)}`);
    }
  }
}

/** Map the UI persistence choice onto the harness PolicyResponse (the schema has no silent option). */
export function policyResponse(mode: PersistenceMode): PolicyResponse {
  return mode;
}

/** The receipt the UI shows, shaped as the harness Receipt document (lifecycle.ts). */
export function harnessReceiptDocument(
  install: Install,
  software: Software,
  events: JournalEvent[],
  issuedAt: DateTime,
): Receipt {
  const mine = events.filter((event) => event.installId === install.id);
  const gaps = mine
    .filter((event) => event.certainty !== "observed")
    .map((event) => `${event.summary}: recorded with certainty "${event.certainty}".`);
  const method = software.methods.find((m) => m.id === install.methodId);
  return {
    schema: LIFECYCLE_SCHEMA_ID,
    schemaVersion: LIFECYCLE_SCHEMA_VERSION,
    receiptId: `rcp-${install.id}`,
    installationId: installationId(install.id),
    alias: install.alias as Alias,
    phase: "receipt",
    issuedAt,
    outcome: gaps.length ? "success-with-gaps" : "success",
    summary: `${software.name} installed via ${method?.label ?? install.methodId}, pin ${install.version}.`,
    stats: { filesCreated: mine.filter((e) => e.kind === "file").length, registryWrites: mine.filter((e) => e.kind === "registry").length, persistenceAdded: mine.filter((e) => e.kind === "task").length, durationSeconds: 0, modelCalls: 0, downloadedBytes: undefined },
    howToUse: [
      `Opens from: ${install.access.length ? accessKinds(install.access).join(", ") : "no launcher — use the alias"}.`,
      install.hotkey ? `Hotkey ${install.hotkey}.` : "No hotkey configured.",
    ],
    commands: {
      remove: `getgone ${install.alias}`,
      customize: `gethelp ${install.alias}`,
      update: `get updates ${install.alias}`,
    },
    gapsAndCaveats: gaps.length ? gaps : ["Prototype rehearsal: no real host effects were observed."],
    recordPointer: {
      path: "localStorage:getme-front-v1",
      digest: `sha256:${chainDigest(mine)}`,
      assurance: "hash-chained-local" as IntegrityAssurance,
      exportCommand: 'Record screen → "Export JSON" (no share service is connected).',
    },
    sharing: {
      offered: true,
      accepted: false,
      whatWouldBeShared: ["software name", "method id", "recipe revision", "os/arch facts", "outcome"],
      redactionsApplied: ["paths", "account"],
      purpose: "Improve the shared recipe store. Optional and separate from doing the install.",
      withdrawInstruction: "Untick the share option on This PC; declining never blocks removal.",
    },
  };
}

function chainDigest(events: JournalEvent[]): string {
  const text = events.map((e) => e.hash).join("|") || "empty";
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  const x = (h >>> 0).toString(16).padStart(8, "0");
  return `${x.repeat(8)}`;
}

/** A managed installation as the harness registry would hold it (lifecycle.ts ManagedInstallation). */
export function toManagedInstallation(
  install: Install,
  software: Software,
  events: JournalEvent[],
  lastObservedAt: DateTime,
): ManagedInstallation {
  const mine = events.filter((event) => event.installId === install.id);
  const method = software.methods.find((m) => m.id === install.methodId);
  const zeroHash = "sha256:" + "0".repeat(64);
  return {
    installationId: installationId(install.id),
    alias: install.alias as Alias,
    displayName: software.name,
    state: install.status === "installed" ? (install.updateTo ? "needs-update" : "active") : "removed",
    installedAt: install.installedAt,
    lastObservedAt,
    targetSoftware: { name: software.name, publisher: software.publisher, version: install.version },
    recipeRef:
      method && method.recipe !== "missing"
        ? { recipeId: method.recipeId.replace(/[^a-z0-9._-]/gi, "-").toLowerCase(), revision: method.version, contentHash: zeroHash }
        : undefined,
    planDigests: [zeroHash],
    recordRefs: ["localStorage:getme-front-v1"],
    latestRecordDigest: `sha256:${chainDigest(mine)}`,
    integrityAssurance: "hash-chained-local",
    accessPoints: accessKinds(install.access).map((kind) => ({
      id: `ap-${install.id}-${kind}`,
      kind,
      hotkey: kind === "hotkey" && install.hotkey ? install.hotkey : undefined,
      instructions: `Opens ${software.name} via ${kind}.`,
      configuredAt: install.installedAt,
      stepIds: ["configure"],
      reversible: true,
    })),
    ownedResources: mine
      .filter((event) => event.kind === "file" || event.kind === "registry" || event.kind === "task")
      .map((event) => ({ resourceId: event.detail || event.summary, ownership: "sole" as const })),
    updateChannel: install.updateTo
      ? { method: "manual", availableVersion: install.updateTo, lastCheckedAt: lastObservedAt }
      : undefined,
  };
}

/** The export payload for the journal: schema ids from the package, plus an explicit chain check. */
export function exportManifest(chainTip: string, events: JournalEvent[], installs: Install[]) {
  return {
    schemas: {
      plan: PLAN_SCHEMA_ID,
      recipe: RECIPE_SCHEMA_ID,
      record: RECORD_SCHEMA_ID,
      request: LIFECYCLE_SCHEMA_ID,
      receipt: LIFECYCLE_SCHEMA_ID,
    },
    contractVersions: CONTRACT_VERSIONS,
    chainTip,
    chainCheck: verifyJournalChain(events),
    counts: { events: events.length, installs: installs.length },
    assuranceNote:
      "Local hash chain: detects casual tampering, not an administrator rewriting the file. No external anchor is connected.",
  };
}

/**
 * Re-verify the local journal hash chain (seal() in model.ts) over a full event list.
 * A local chain is tamper-evidence, not tamper-prevention; exports should say which broke.
 */
export function verifyJournalChain(events: JournalEvent[]): { ok: true } | { ok: false; brokenAt: string } {
  let cursor = "getme-genesis";
  for (const event of events) {
    if (event.prev !== cursor) return { ok: false, brokenAt: event.id };
    cursor = event.hash;
  }
  return { ok: true };
}

// Populate the runtime verb set from the schema package's closed enum at module load.
import { actionTypes } from "@earendil-works/pi-getme";
const ACTION_TYPE_SET: ReadonlySet<string> = new Set<string>(actionTypes);
