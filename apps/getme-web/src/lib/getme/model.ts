export type RecipeState = "verified" | "lagging" | "missing";

export type PlanAction = {
  op: string;
  summary: string;
  args: Record<string, string>;
};

export type Method = {
  id: string;
  label: string;
  where: string;
  opens: string;
  tradeoff: string;
  size: string;
  recipe: RecipeState;
  recipeId: string;
  version: string;
  actions: PlanAction[];
  verify: string;
  recovers: string;
};

export type Software = {
  id: string;
  name: string;
  alias: string;
  aliases: string[];
  blurb: string;
  publisher: string;
  keywords: string[];
  methods: Method[];
};

export type AccessKey = "start" | "desktop" | "taskbar" | "bar" | "hotkey";

export const ACCESS: { id: AccessKey; label: string; detail: string }[] = [
  { id: "start", label: "Start menu", detail: "A shortcut, named the way you ask." },
  { id: "desktop", label: "Desktop icon", detail: "One icon. Nothing pinned unless you say so." },
  { id: "taskbar", label: "Taskbar", detail: "Pinned after the first launch that succeeds." },
  { id: "bar", label: "This bar", detail: "Type the alias here. System PATH stays as it was." },
  { id: "hotkey", label: "A hotkey", detail: "You choose the keys. They are part of the receipt." },
];

export type Install = {
  id: string;
  softwareId: string;
  alias: string;
  methodId: string;
  version: string;
  installedAt: string;
  access: AccessKey[];
  hotkey: string;
  status: "installed" | "removed";
  updateTo?: string;
  removedAt?: string;
  attention?: string;
};

export type Certainty = "observed" | "partial" | "gap";

export type JournalKind =
  | "file"
  | "registry"
  | "task"
  | "setting"
  | "shortcut"
  | "verify"
  | "note"
  | "access"
  | "update"
  | "removal";

export type JournalEvent = {
  id: string;
  at: string;
  installId: string;
  alias: string;
  kind: JournalKind;
  summary: string;
  detail: string;
  before?: string;
  after?: string;
  certainty: Certainty;
  hash: string;
  prev: string;
};

export type AccentChoice = "leave" | "phosphor" | "slate";

export type PersistenceMode = "ask" | "notify" | "correct";

export const PERSISTENCE: { id: PersistenceMode; label: string; detail: string }[] = [
  {
    id: "ask",
    label: "Ask me",
    detail: "If a task or setting you turned off comes back, stop and show it. Do not flip it until you decide.",
  },
  {
    id: "notify",
    label: "Just tell me",
    detail: "Write it down and leave the machine as the other actor left it.",
  },
  {
    id: "correct",
    label: "Put it back",
    detail: "Restore the off state you chose, and record that correction. Say so when it fights an update.",
  },
];

export const MACHINE = {
  os: "Windows 11 24H2",
  build: "26100",
  arch: "x64",
  cpu: "8 cores",
  ram: "32 GB",
  diskFree: "180 GB free on the system drive",
  wsl: "Installed",
  scoop: "Installed",
  gpu: "Not collected",
  gpuNote: "Read only if you pick something that needs a GPU.",
  executionPolicy: "RemoteSigned, current user only",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = d.getUTCHours();
  const hr = h % 12 || 12;
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${hr}:${min} ${ampm} UTC`;
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function act(op: string, summary: string, args: Record<string, string> = {}): PlanAction {
  return { op, summary, args };
}

export const SOFTWARE: Software[] = [
  {
    id: "comfyui",
    name: "ComfyUI",
    alias: "comfy",
    aliases: ["comfyui", "comfy-ui", "comfy ui"],
    blurb: "A node canvas for running image models on your machine.",
    publisher: "Comfy Org",
    keywords: ["image", "nodes", "diffusion", "canvas"],
    methods: [
      {
        id: "portable",
        label: "A Windows folder you can move",
        where: "Under your user profile, in GetMe’s folder. PATH is not changed.",
        opens: "Its own window.",
        tradeoff: "The larger download. Uses the GPU driver already on Windows. Closest to “it just opens.”",
        size: "About 2 GB before any model",
        recipe: "verified",
        recipeId: "comfyui-portable@2026.10.2",
        version: "2026.10.2",
        verify: "A window titled ComfyUI accepts a blank graph.",
        recovers: "Delete the owned folder. Nothing else was introduced.",
        actions: [
          act("precondition", "Confirm Windows 11 x64 and 8 GB free", { os: "26100", arch: "x64" }),
          act("fetch", "Download the pinned portable archive", { sha256: "c1a7e0…4b91" }),
          act("extract", "Extract into this installation’s folder", { to: "%LOCALAPPDATA%\\GetMe\\comfyui" }),
          act("own", "Mark that folder as owned by this install"),
          act("verify", "Launch and wait for the canvas"),
        ],
      },
      {
        id: "wsl",
        label: "Inside WSL, the way upstream docs assume",
        where: "A Linux environment already on this PC.",
        opens: "A browser tab aimed at the WSL service.",
        tradeoff: "Matches the project’s own instructions. GPU access depends on WSL, and it feels less like a Windows app.",
        size: "Depends on the image already present",
        recipe: "missing",
        recipeId: "none",
        version: "unpinned",
        verify: "The service answers on its local port.",
        recovers: "Stop the service and delete the venv recorded for this install.",
        actions: [
          act("precondition", "Confirm WSL is installed", { wsl: "present" }),
          act("discover", "No verified recipe — agent proposes a bounded plan"),
          act("venv", "Create a virtualenv inside the distro", { path: "~/GetMe/comfyui" }),
          act("fetch", "Install the pinned commit inside that venv"),
          act("verify", "Request the canvas and record the response"),
        ],
      },
      {
        id: "scoop",
        label: "Scoop, from PowerShell",
        where: "Scoop’s apps directory.",
        opens: "A Start menu shortcut, if you ask, plus the Scoop command.",
        tradeoff: "Updates the way Scoop updates. This pin is one release behind the portable package.",
        size: "Similar to the portable build",
        recipe: "lagging",
        recipeId: "comfyui-scoop@2026.09.1",
        version: "2026.09.1",
        verify: "The Scoop shim launches the canvas.",
        recovers: "scoop uninstall, then reconcile any shortcut GetMe added.",
        actions: [
          act("precondition", "Confirm Scoop is on this profile"),
          act("install", "Install the pinned Scoop manifest", { manifest: "comfyui" }),
          act("own", "Record the shim and the app directory"),
          act("verify", "Launch through the shim"),
        ],
      },
    ],
  },
  {
    id: "voice-access",
    name: "Windows Voice Access",
    alias: "voice",
    aliases: ["voice access", "dictation", "windows dictation"],
    blurb: "The dictation already in Windows. GetMe turns it on and shows you the switch.",
    publisher: "Microsoft",
    keywords: ["dictation", "speech", "voice", "speak"],
    methods: [
      {
        id: "enable",
        label: "Turn on the Windows feature",
        where: "A setting for your user. No new program folder.",
        opens: "Voice Access from the Start menu.",
        tradeoff: "Nothing extra to download. It is Microsoft’s tool, with Microsoft’s language and account limits.",
        size: "Already on the machine",
        recipe: "verified",
        recipeId: "voice-access-hkcu@2026.10.1",
        version: "inbox",
        verify: "Voice Access reports ready for this user.",
        recovers: "Turn the same setting back off. No files to delete.",
        actions: [
          act("precondition", "Confirm the inbox component is present"),
          act("setting", "Enable Voice Access for this user", { scope: "HKCU" }),
          act("verify", "Read the setting back and confirm it stuck"),
        ],
      },
    ],
  },
  {
    id: "whisper",
    name: "Whisper.cpp",
    alias: "whisper",
    aliases: ["whisper.cpp", "whisper cpp", "local whisper"],
    blurb: "Speech-to-text that stays on this PC.",
    publisher: "ggerganov and contributors",
    keywords: ["whisper", "transcribe", "offline", "speech"],
    methods: [
      {
        id: "portable",
        label: "A small local program and one model",
        where: "GetMe’s folder, with the model file beside it.",
        opens: "Drop a recording on it, or a hotkey if you ask for one.",
        tradeoff: "Private and offline. It does not type into every window unless you add that hotkey.",
        size: "About 180 MB with the small model",
        recipe: "verified",
        recipeId: "whisper-small@2026.10.4",
        version: "2026.10.4",
        verify: "A known sample clip returns a known sentence.",
        recovers: "Delete the owned folder, including the model, unless you keep the model.",
        actions: [
          act("fetch", "Download the pinned binary and the small model", { sha256: "91ab22…0ce4" }),
          act("extract", "Place them in the owned folder", { to: "%LOCALAPPDATA%\\GetMe\\whisper" }),
          act("verify", "Transcribe the fixture clip"),
        ],
      },
    ],
  },
  {
    id: "geogebra",
    name: "GeoGebra",
    alias: "geo",
    aliases: ["geogebra", "geo gebra"],
    blurb: "Graphs, geometry, and calculus you can drag.",
    publisher: "GeoGebra",
    keywords: ["calculus", "graph", "geometry", "math"],
    methods: [
      {
        id: "classic",
        label: "GeoGebra Classic for Windows",
        where: "Its own folder under Program Files, recorded as owned.",
        opens: "A desktop window from the Start menu.",
        tradeoff: "Good for working problems. It will not quiz you. Pair it with cards if you want memory practice.",
        size: "About 120 MB",
        recipe: "verified",
        recipeId: "geogebra-classic@2026.08.2",
        version: "2026.08.2",
        verify: "The algebra view opens.",
        recovers: "Run the vendor uninstaller, then remove leftovers the receipt still owns.",
        actions: [
          act("fetch", "Download the pinned Classic installer", { sha256: "77c1…aa02" }),
          act("install", "Run it observed, writing only into the declared folder"),
          act("verify", "Open the algebra view"),
        ],
      },
    ],
  },
  {
    id: "anki",
    name: "Anki",
    alias: "anki",
    aliases: ["anky"],
    blurb: "Flashcards with a review schedule. Useful beside GeoGebra, not a substitute for it.",
    publisher: "Ankitects",
    keywords: ["flashcard", "memory", "study", "calculus"],
    methods: [
      {
        id: "classic",
        label: "Anki for Windows",
        where: "Program Files, plus a collection folder in your profile if you create one.",
        opens: "Its own window.",
        tradeoff: "Your decks stay yours. GetMe does not create a deck unless you ask.",
        size: "About 80 MB",
        recipe: "verified",
        recipeId: "anki-win@2026.07.3",
        version: "2026.07.3",
        verify: "The deck list window opens.",
        recovers: "Vendor uninstall, then keep or delete the collection based on your choice.",
        actions: [
          act("fetch", "Download the pinned installer", { sha256: "ab90…11d2" }),
          act("install", "Run it observed"),
          act("verify", "Open the deck list"),
        ],
      },
    ],
  },
  {
    id: "gnucash",
    name: "GnuCash",
    alias: "books",
    aliases: ["gnucash", "gnu cash"],
    blurb: "Double-entry books. A step away from QuickBooks, not a copy of it.",
    publisher: "The GnuCash project",
    keywords: ["quickbooks", "accounting", "ledger", "invoice", "bookkeeping"],
    methods: [
      {
        id: "classic",
        label: "GnuCash for Windows",
        where: "Program Files. A file association only for its own books.",
        opens: "The Start menu. Your company file stays wherever you save it.",
        tradeoff: "Does not open QuickBooks company files. The first launch can create a book, and only if you ask.",
        size: "About 150 MB",
        recipe: "verified",
        recipeId: "gnucash-win@2026.06.1",
        version: "2026.06.1",
        verify: "The empty-book window opens.",
        recovers: "Vendor uninstall. Book files you saved are kept unless you say otherwise.",
        actions: [
          act("fetch", "Download the pinned installer", { sha256: "d4e1…90ab" }),
          act("install", "Run it observed. Associate .gnucash only"),
          act("verify", "Open the tip-of-day window and close it"),
        ],
      },
    ],
  },
  {
    id: "krita",
    name: "Krita",
    alias: "krita",
    aliases: ["krita"],
    blurb: "A drawing and painting program.",
    publisher: "Krita Foundation",
    keywords: ["paint", "draw", "illustration", "sketch"],
    methods: [
      {
        id: "classic",
        label: "Krita for Windows",
        where: "Program Files, owned in the receipt.",
        opens: "Its own window.",
        tradeoff: "Built for painting, not for photo libraries.",
        size: "About 300 MB",
        recipe: "verified",
        recipeId: "krita-win@5.2.9",
        version: "5.2.9",
        verify: "A blank canvas opens.",
        recovers: "Vendor uninstall, then reconcile owned leftovers. Pictures you exported stay.",
        actions: [
          act("fetch", "Download the pinned installer", { sha256: "e31c…77a0" }),
          act("install", "Run it observed"),
          act("verify", "Open a blank canvas"),
        ],
      },
    ],
  },
  {
    id: "blender",
    name: "Blender",
    alias: "blend",
    aliases: ["blender"],
    blurb: "3D modeling, layout, and rendering.",
    publisher: "Blender Foundation",
    keywords: ["blender", "3d", "sculpt", "render"],
    methods: [
      {
        id: "portable",
        label: "A portable build in your profile",
        where: "GetMe’s folder. No system-wide association for .blend unless you ask later.",
        opens: "Its own window.",
        tradeoff: "Easy to remove cleanly. It will not take over every 3D file on the PC.",
        size: "About 320 MB",
        recipe: "verified",
        recipeId: "blender-portable@4.5.1",
        version: "4.5.1",
        verify: "The default scene appears.",
        recovers: "Delete the owned folder and the shortcuts you asked for.",
        actions: [
          act("fetch", "Download the pinned portable zip", { sha256: "b88d…12cf" }),
          act("extract", "Extract into the owned folder", { to: "%LOCALAPPDATA%\\GetMe\\blender" }),
          act("verify", "Open the default scene"),
        ],
      },
    ],
  },
  {
    id: "beacon",
    name: "Beacon",
    alias: "beacon",
    aliases: ["beacon", "proof", "fixture"],
    blurb: "A small stand-in installer. It exists so removal can be shown, not promised.",
    publisher: "GetMe fixture",
    keywords: ["beacon", "fixture", "proof"],
    methods: [
      {
        id: "fixture",
        label: "The proof fixture",
        where: "A folder, one registry value of its own, one shared value, and a scheduled task.",
        opens: "A tiny window that says it is running.",
        tradeoff: "Not useful software. It is how you watch GetMe attribute a change, notice a conflict, and undo only what it owns.",
        size: "Under 2 MB",
        recipe: "verified",
        recipeId: "beacon-fixture@0.1.0",
        version: "0.1.0",
        verify: "The fixture window reports ready, and the task is registered.",
        recovers: "Delete owned files and the task. Shared values follow the conflict rules.",
        actions: [
          act("stage", "Create the fixture files in the owned folder"),
          act("registry", "Write the installer’s own key"),
          act("registry", "Set the shared Accent value, journaling the previous one"),
          act("task", "Register BeaconKeepAlive"),
          act("verify", "Confirm file, key, and task"),
        ],
      },
    ],
  },
];

export function softwareById(id: string): Software | undefined {
  return SOFTWARE.find((s) => s.id === id);
}

export function methodOf(software: Software, methodId: string): Method | undefined {
  return software.methods.find((m) => m.id === methodId);
}

export function recipeLabel(state: RecipeState): string {
  if (state === "verified") return "Verified recipe";
  if (state === "lagging") return "Verified, one release behind";
  return "No recipe yet";
}

const GOALS: { re: RegExp; ids: string[]; via: string }[] = [
  {
    re: /dictat|transcri|speech|when i speak|voice to text|talk to type/,
    ids: ["voice-access", "whisper"],
    via: "Dictation on this PC. These two are not the same kind of tool.",
  },
  {
    re: /calculus|algebra|geometry|trigonometry|flash\s?cards?/,
    ids: ["geogebra", "anki"],
    via: "Two different jobs inside studying math.",
  },
  {
    re: /quick\s?books?|book\s?keep|invoic|double[- ]entry|\bledger\b|\baccounting\b/,
    ids: ["gnucash"],
    via: "Bookkeeping. Not a QuickBooks importer.",
  },
  {
    re: /comfy|stable diffusion|image model|node canvas/,
    ids: ["comfyui"],
    via: "A local canvas for image models.",
  },
  {
    re: /\bpaint\b|illustrat|sketchbook|\bdraw\b|\bsketch\b/,
    ids: ["krita"],
    via: "Drawing and painting.",
  },
  {
    re: /\bblender\b|\b3d\b|\bsculpt/,
    ids: ["blender"],
    via: "3D work.",
  },
  {
    re: /\bbeacon\b|proof fixture|uninstall proof/,
    ids: ["beacon"],
    via: "The fixture that makes removal visible.",
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compact(s: string): string {
  return norm(s).replace(/ /g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min((dp[j] ?? 0) + 1, (dp[j - 1] ?? 0) + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n] ?? 0;
}

function nameScore(query: string, software: Software): number {
  const q = compact(query);
  if (!q) return 0;
  const forms = [software.name, software.alias, ...software.aliases].map(compact);
  let best = 0;
  for (const form of forms) {
    if (!form) continue;
    if (q === form) return 100;
    if (form.includes(q) || q.includes(form)) best = Math.max(best, 88);
    const limit = form.length <= 5 ? 1 : 2;
    const d = levenshtein(q, form);
    if (d <= limit) best = Math.max(best, 82 - d * 4);
  }
  return best;
}

export type ResolveResult =
  | { kind: "none"; query: string }
  | { kind: "one"; query: string; software: Software; via: string }
  | { kind: "many"; query: string; software: Software[]; via: string };

export function resolveQuery(query: string): ResolveResult {
  const scored = SOFTWARE.map((software) => ({ software, score: nameScore(query, software) })).sort(
    (a, b) => b.score - a.score,
  );
  const top = scored[0];
  if (top && top.score >= 78) {
    const close = scored.filter((s) => s.score >= top.score - 8 && s.score >= 78).map((s) => s.software);
    if (close.length === 1) {
      const via = top.score === 100 ? "Known name." : `Interpreted “${query.trim()}” as ${top.software.name}.`;
      return { kind: "one", query, software: close[0]!, via };
    }
    return { kind: "many", query, software: close, via: "More than one name is close." };
  }
  for (const goal of GOALS) {
    if (goal.re.test(query.toLowerCase())) {
      const software = goal.ids.map(softwareById).filter((s): s is Software => Boolean(s));
      if (software.length === 1) return { kind: "one", query, software: software[0]!, via: goal.via };
      if (software.length > 1) return { kind: "many", query, software, via: goal.via };
    }
  }
  return { kind: "none", query };
}

export type Command =
  | { kind: "empty" }
  | { kind: "gone"; alias: string }
  | { kind: "help"; alias: string }
  | { kind: "updates"; aliases: string[] }
  | { kind: "getme"; query: string };

export function parseCommand(raw: string): Command {
  const text = raw.trim();
  if (!text) return { kind: "empty" };
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  let match = lower.match(/^getgone\s+(.+)$/);
  if (match?.[1]) return { kind: "gone", alias: match[1] };
  match = lower.match(/^gethelp\s+(.+)$/);
  if (match?.[1]) return { kind: "help", alias: match[1] };
  if (lower === "getupdates" || lower === "get updates") return { kind: "updates", aliases: [] };
  match = lower.match(/^get updates\s+(.+)$/);
  if (match?.[1]) return { kind: "updates", aliases: match[1].split(/[\s,]+/).filter(Boolean) };
  match = lower.match(/^getme\s+(.+)$/);
  if (match) return { kind: "getme", query: text.replace(/^getme\s+/i, "").trim() };
  return { kind: "getme", query: text };
}

export function findInstall(alias: string, installs: Install[]): Install | undefined {
  const q = compact(alias);
  const live = installs.filter((i) => i.status === "installed");
  const exact = live.find((i) => compact(i.alias) === q || compact(i.softwareId) === q);
  if (exact) return exact;
  let best: Install | undefined;
  let bestD = 99;
  for (const install of live) {
    const d = Math.min(levenshtein(q, compact(install.alias)), levenshtein(q, compact(install.softwareId)));
    if (d < bestD) {
      bestD = d;
      best = install;
    }
  }
  if (best && bestD <= 1) return best;
  return undefined;
}

export function uniqueAlias(wanted: string, installs: Install[]): string {
  const taken = new Set(installs.filter((i) => i.status === "installed").map((i) => i.alias.toLowerCase()));
  const base = wanted.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "app";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

type DraftEvent = Omit<JournalEvent, "hash" | "prev">;

export function seal(events: DraftEvent[], prev = "getme-genesis"): { events: JournalEvent[]; chainTip: string } {
  const sealed: JournalEvent[] = [];
  let cursor = prev;
  for (const event of events) {
    const hash = fnv1a(`${cursor}|${event.id}|${event.at}|${event.summary}`);
    sealed.push({ ...event, prev: cursor, hash });
    cursor = hash;
  }
  return { events: sealed, chainTip: cursor };
}

export function planDocument(software: Software, method: Method) {
  return {
    schema: "getme.plan/v0",
    recipe: method.recipeId,
    recipeState: method.recipe,
    target: software.id,
    method: method.id,
    version: method.version,
    actions: method.actions,
    verify: method.verify,
    recovery: method.recovers,
    authority: "The executor checks this before any change. A model does not receive a shell.",
  };
}

export function rehearseScript(software: Software, method: Method): string[] {
  if (method.recipe === "missing") {
    return [
      `No verified recipe for ${software.name} via “${method.label}” on Windows 11 24H2.`,
      "Discovery stays bounded: one plan, one rehearsal, then you.",
      "The proposal passed the plan schema. That does not make it allowed to run.",
      "Rehearsal environment: modeled Windows. This profile is not changed.",
      ...method.actions.map((a) => `Modeled: ${a.summary}.`),
      "Coverage gap: WSL GPU passthrough is not fully modeled. A real run would check it again.",
      "Rehearsal finished. This is a prediction, not an install.",
    ];
  }
  const lag = method.recipe === "lagging" ? ["This recipe is verified for an older pin, one release behind."] : [];
  return [
    `Recipe ${method.recipeId} matches this profile.`,
    ...lag,
    "Rehearsal environment: modeled Windows. Host files stay untouched.",
    ...method.actions.map((a) => `Modeled: ${a.summary}.`),
    "No service. No scheduled task, unless the plan names one.",
    `Verification in the model: ${method.verify}`,
    "Rehearsal finished. The real run is still observed on its own.",
  ];
}

export function installScript(software: Software, method: Method): string[] {
  return [
    "Preconditions still hold on the sample profile.",
    ...method.actions.map((a) => `Running: ${a.summary}.`),
    "Journaling effects as they happen. The agent receives a short status, not this stream.",
    `Check: ${method.verify}`,
    "Owned resources recorded. Shared runtimes introduced: none in this plan.",
  ];
}

export function installDrafts(install: Install, software: Software, method: Method, at: string): DraftEvent[] {
  const base = { at, installId: install.id, alias: install.alias };
  const events: DraftEvent[] = [
    {
      ...base,
      id: `${install.id}-recipe`,
      kind: "note",
      certainty: method.recipe === "missing" ? "partial" : "observed",
      summary: method.recipe === "missing" ? "Installed from a rehearsed discovery plan" : `Installed from ${method.recipeId}`,
      detail: `${software.name} via ${method.label}. Version pin ${method.version}.`,
    },
    {
      ...base,
      id: `${install.id}-place`,
      kind: software.id === "voice-access" ? "setting" : "file",
      certainty: "observed",
      summary: software.id === "voice-access" ? "Voice Access enabled for this user" : `Placed ${software.name}`,
      detail: method.where,
      after: method.version,
    },
    {
      ...base,
      id: `${install.id}-verify`,
      kind: "verify",
      certainty: "observed",
      summary: "Verification passed",
      detail: method.verify,
    },
  ];
  return events;
}

export function accessDraft(install: Install, at: string, previous?: string): DraftEvent {
  const labels = install.access.map((id) => ACCESS.find((a) => a.id === id)?.label ?? id);
  const hot = install.access.includes("hotkey") && install.hotkey ? ` Hotkey ${install.hotkey}.` : "";
  return {
    id: `${install.id}-access-${at}`,
    at,
    installId: install.id,
    alias: install.alias,
    kind: "access",
    certainty: "observed",
    summary: previous ? "Changed how it opens" : "Recorded how it opens",
    detail: `${labels.join(", ") || "No launcher added"}.${hot}`,
    before: previous,
    after: install.alias,
  };
}

export function removalScript(
  software: Software,
  accent: AccentChoice,
  keepDocs: boolean,
): string[] {
  if (software.id === "beacon") {
    const accentLine =
      accent === "leave"
        ? "Accent stays coral. MailStamp wrote that after Beacon. The later edit is kept."
        : accent === "phosphor"
          ? "Accent set back to phosphor, Beacon’s own value. Coral is overwritten because you asked."
          : "Accent set back to slate, the value from before Beacon. Both later edits are overwritten because you asked.";
    return [
      "No vendor uninstaller. Beacon is a GetMe fixture.",
      "Deleting owned files under the GetMe folder.",
      "Removing scheduled task BeaconKeepAlive, including the copy that turned itself back on.",
      "Removing the Start menu shortcut.",
      accentLine,
      keepDocs
        ? "Keeping Documents\\Beacon\\notes.txt. You wrote that after install."
        : "Deleting Documents\\Beacon\\notes.txt because you said to.",
      "One earlier registry create was only partly observed. The key is removed only if it is still Beacon’s.",
      "Verification: owned paths are gone. Unrelated files are unchanged.",
    ];
  }
  return [
    software.methods.some((m) => m.id === "portable" || m.id === "enable")
      ? "No vendor uninstaller needed for this method."
      : "Running the vendor uninstaller and watching what it actually removes.",
    "Deleting resources this install still solely owns.",
    "Leaving shared components that something else still needs.",
    keepDocs ? "Keeping files you created or exported." : "Deleting saved files you marked for removal.",
    "Verification: owned paths are absent. Later edits by other programs were not rolled back.",
  ];
}

export function removalDrafts(
  install: Install,
  software: Software,
  at: string,
  accent: AccentChoice,
  keepDocs: boolean,
): DraftEvent[] {
  const base = { at, installId: install.id, alias: install.alias, kind: "removal" as const, certainty: "observed" as const };
  if (software.id === "beacon") {
    const accentDetail =
      accent === "leave"
        ? "Left HKCU\\Software\\Shared\\Accent at coral. Current owner is MailStamp, which is not managed here."
        : accent === "phosphor"
          ? "Restored Accent to phosphor at your request."
          : "Restored Accent to slate, the pre-Beacon value, at your request.";
    return [
      { ...base, id: `${install.id}-rm-files-${at}`, summary: "Removed Beacon’s files and shortcut", detail: "Owned folder and Start menu shortcut." },
      { ...base, id: `${install.id}-rm-task-${at}`, summary: "Removed BeaconKeepAlive", detail: "The task Beacon re-enabled on Nov 2 is deleted." },
      {
        ...base,
        id: `${install.id}-rm-accent-${at}`,
        kind: "registry",
        summary: accent === "leave" ? "Kept the later Accent change" : "Rewound Accent as you asked",
        detail: accentDetail,
        before: "coral",
        after: accent === "leave" ? "coral" : accent,
      },
      {
        ...base,
        id: `${install.id}-rm-docs-${at}`,
        kind: "file",
        summary: keepDocs ? "Kept your Beacon notes" : "Deleted your Beacon notes",
        detail: "Documents\\Beacon\\notes.txt",
      },
      {
        ...base,
        id: `${install.id}-rm-verify-${at}`,
        kind: "verify",
        certainty: "partial",
        summary: "Removal checked against the receipt",
        detail: "Owned paths absent. The partial observation on Beacon’s own key is called out, not hidden.",
      },
    ];
  }
  return [
    { ...base, id: `${install.id}-rm-${at}`, summary: `Removed ${software.name}`, detail: removalScript(software, accent, keepDocs).join(" ") },
    {
      ...base,
      id: `${install.id}-rm-docs-${at}`,
      kind: "file",
      summary: keepDocs ? "Kept files you created" : "Deleted saved files you marked",
      detail: "User documents are not treated as leftovers.",
    },
    {
      ...base,
      id: `${install.id}-rm-verify-${at}`,
      kind: "verify",
      summary: "Removal checked",
      detail: "Owned resources gone. Later unrelated edits left in place.",
    },
  ];
}

export function updateScript(software: Software, from: string, to: string): string[] {
  return [
    `Update pin ${from} → ${to} for ${software.name}.`,
    "The new pin is rehearsed against this profile’s preconditions.",
    "Replacing owned program files. Settings and documents stay.",
    "Verification rerun. The receipt gains this revision; it does not forget the old one.",
  ];
}

export function sharePacket(software: Software, method: Method) {
  return {
    software: software.name,
    method: method.id,
    recipe: method.recipeId,
    os: MACHINE.os,
    arch: MACHINE.arch,
    result: "verified",
    paths: "[redacted]",
    user: "[redacted]",
  };
}

export function buildSeed(): { installs: Install[]; events: JournalEvent[]; chainTip: string } {
  const installs: Install[] = [
    {
      id: "ins-krita",
      softwareId: "krita",
      alias: "krita",
      methodId: "classic",
      version: "5.2.9",
      installedAt: "2026-09-12T18:10:00.000Z",
      access: ["start"],
      hotkey: "",
      status: "installed",
    },
    {
      id: "ins-blender",
      softwareId: "blender",
      alias: "blend",
      methodId: "portable",
      version: "4.5.1",
      installedAt: "2026-10-05T16:40:00.000Z",
      access: ["start", "bar"],
      hotkey: "",
      status: "installed",
      updateTo: "4.5.4",
    },
    {
      id: "ins-beacon",
      softwareId: "beacon",
      alias: "beacon",
      methodId: "fixture",
      version: "0.1.0",
      installedAt: "2026-10-18T15:05:00.000Z",
      access: ["start"],
      hotkey: "",
      status: "installed",
      attention: "Its scheduled task turned itself back on after you disabled it.",
    },
  ];

  const drafts: DraftEvent[] = [
    {
      id: "e-profile",
      at: "2026-09-01T15:00:00.000Z",
      installId: "getme",
      alias: "getme",
      kind: "note",
      summary: "Collected a minimal machine profile",
      detail: "Windows 11 24H2, x64, 8 cores, 32 GB RAM. GPU was not read. Disk free space was read because installs need it.",
      certainty: "observed",
    },
    {
      id: "e-watch",
      at: "2026-09-01T15:02:00.000Z",
      installId: "getme",
      alias: "getme",
      kind: "note",
      summary: "Observation is on",
      detail: "Files, registry, services, and scheduled tasks. This watcher is itself revocable from This PC.",
      certainty: "observed",
    },
    {
      id: "e-krita-file",
      at: "2026-09-12T18:12:00.000Z",
      installId: "ins-krita",
      alias: "krita",
      kind: "file",
      summary: "Installed Krita from krita-win@5.2.9",
      detail: "Program Files folder recorded as owned. No extra file associations.",
      certainty: "observed",
    },
    {
      id: "e-krita-cut",
      at: "2026-09-12T18:13:00.000Z",
      installId: "ins-krita",
      alias: "krita",
      kind: "shortcut",
      summary: "Start menu shortcut added",
      detail: "Opens Krita. No desktop icon.",
      certainty: "observed",
    },
    {
      id: "e-krita-ok",
      at: "2026-09-12T18:14:00.000Z",
      installId: "ins-krita",
      alias: "krita",
      kind: "verify",
      summary: "A blank canvas opened",
      detail: "Verification passed.",
      certainty: "observed",
    },
    {
      id: "e-blend-file",
      at: "2026-10-05T16:42:00.000Z",
      installId: "ins-blender",
      alias: "blend",
      kind: "file",
      summary: "Installed Blender from blender-portable@4.5.1",
      detail: "Portable folder under %LOCALAPPDATA%\\GetMe\\blender. .blend files were not claimed.",
      certainty: "observed",
    },
    {
      id: "e-blend-open",
      at: "2026-10-05T16:44:00.000Z",
      installId: "ins-blender",
      alias: "blend",
      kind: "access",
      summary: "Opens from the Start menu and the alias blend",
      detail: "Typing blend in this bar launches it. PATH was not edited.",
      certainty: "observed",
    },
    {
      id: "e-blend-ok",
      at: "2026-10-05T16:45:00.000Z",
      installId: "ins-blender",
      alias: "blend",
      kind: "verify",
      summary: "Default scene appeared",
      detail: "Verification passed.",
      certainty: "observed",
    },
    {
      id: "e-blend-upd",
      at: "2026-11-01T12:00:00.000Z",
      installId: "ins-blender",
      alias: "blend",
      kind: "update",
      summary: "A newer pin is available: 4.5.4",
      detail: "Not installed. Your 4.5.1 receipt still stands.",
      certainty: "observed",
    },
    {
      id: "e-bea-file",
      at: "2026-10-18T15:06:00.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "file",
      summary: "Created Beacon’s program files",
      detail: "%LOCALAPPDATA%\\GetMe\\beacon\\beacon.exe and keep-alive.xml.",
      certainty: "observed",
    },
    {
      id: "e-bea-own",
      at: "2026-10-18T15:06:20.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "registry",
      summary: "Wrote Beacon’s own install key",
      detail: "HKCU\\Software\\GetMe\\Beacon\\Installed. The before-image was missed in a short gap; attribution used process ancestry.",
      before: "(absent)",
      after: "1",
      certainty: "partial",
    },
    {
      id: "e-bea-accent",
      at: "2026-10-18T15:06:30.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "registry",
      summary: "Changed shared Accent from slate to phosphor",
      detail: "HKCU\\Software\\Shared\\Accent. The previous value was stored before the write.",
      before: "slate",
      after: "phosphor",
      certainty: "observed",
    },
    {
      id: "e-bea-task",
      at: "2026-10-18T15:06:40.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "task",
      summary: "Registered scheduled task BeaconKeepAlive",
      detail: "\\GetMe\\BeaconKeepAlive. Solely owned by this install.",
      certainty: "observed",
    },
    {
      id: "e-bea-ok",
      at: "2026-10-18T15:07:00.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "verify",
      summary: "Fixture reported ready",
      detail: "File, key, and task matched the plan.",
      certainty: "observed",
    },
    {
      id: "e-bea-notes",
      at: "2026-10-19T20:12:00.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "file",
      summary: "You created notes beside Beacon",
      detail: "Documents\\Beacon\\notes.txt. This is yours, not payload. Removal keeps it unless you say otherwise.",
      certainty: "observed",
    },
    {
      id: "e-bea-off",
      at: "2026-10-20T13:30:00.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "task",
      summary: "You disabled BeaconKeepAlive",
      detail: "Recorded as a chosen off state.",
      before: "enabled",
      after: "disabled",
      certainty: "observed",
    },
    {
      id: "e-bea-mail",
      at: "2026-10-24T09:18:00.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "registry",
      summary: "MailStamp changed Accent from phosphor to coral",
      detail: "MailStamp is not a GetMe install. Beacon no longer owns the current value. Removal must not assume slate.",
      before: "phosphor",
      after: "coral",
      certainty: "observed",
    },
    {
      id: "e-bea-on",
      at: "2026-11-02T07:44:00.000Z",
      installId: "ins-beacon",
      alias: "beacon",
      kind: "task",
      summary: "BeaconKeepAlive turned itself back on",
      detail: "beacon.exe re-enabled the task you had disabled. Policy is “ask,” so it was not silently corrected.",
      before: "disabled",
      after: "enabled",
      certainty: "observed",
    },
  ];

  const sealed = seal(drafts);
  return { installs, events: sealed.events, chainTip: sealed.chainTip };
}

export const SUGGESTIONS = [
  "comfyui",
  "something that takes dictation when I speak",
  "something that can help me study for calculus",
  "an alternative to quickbooks",
  "getgone beacon",
];
