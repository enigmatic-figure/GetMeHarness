// Lifecycle: the installation registry, user policy, continued observation, requests, receipts, and
// getgone removal.
//
// Vision anchors encoded here:
// - "The same conversational interaction can be supplied by a deterministic form or decision flow when
//   no model is needed" -> RequestEnvelope supports both paths.
// - Receipts: concise outcome + stats + access instructions + commands for removal/customization/updates;
//   sharing metadata is a separate, optional offer.
// - Continued observation detects new AND re-enabled persistence; user policy remembers disabled state.
// - Removal reconciles attributable effects against the record with explicit conflict outcomes; never
//   blind whole-branch deletion; never restore-over-later-third-party-change without a decision.

import { arr, bool, int, lit, obj, opt, type Schema, str, union } from "@earendil-works/pi-schema";
import { ApprovalLevel, InstallationPlan, PlanPhase, VerificationStep } from "./plan.ts";
import { CoverageReport, IntegrityAssurance } from "./record.ts";
import { ObservedEffect } from "./record.ts";
import { ResourceId, ResourceState } from "./resources.ts";
import { ConfiguredAccessPoint } from "./access.ts";
import {
	Alias,
	DateTime,
	Hash,
	IdToken,
	InstallationId,
	Semver,
} from "./vocabulary.ts";

export const LIFECYCLE_SCHEMA_ID = "https://getme.dev/schema/lifecycle.json";
export const LIFECYCLE_SCHEMA_VERSION = "1.0.0";

/** Managed-installation states (the lifecycle the receipt grows into). */
export const installationStates = [
	"installing",
	"active",
	"needs-update",
	"observing-degraded",
	"removing",
	"removed",
	"orphaned-record",
] as const;
export type InstallationState = (typeof installationStates)[number];
export const InstallationState = union(
	installationStates.map((s) => lit(s)) as unknown as readonly Schema[],
) as unknown as Schema<InstallationState>;

// ---------------------------------------------------------------------------
// User policy
// ---------------------------------------------------------------------------

/** How GetMe responds when it notices a tracked setting being changed. */
export const policyResponses = ["prevent", "notify", "correct", "ask"] as const;
export type PolicyResponse = (typeof policyResponses)[number];
export const PolicyResponse = union(
	policyResponses.map((p) => lit(p)) as unknown as readonly Schema[],
) as unknown as Schema<PolicyResponse>;

/** A remembered disabled/preference state the monitor watches for attempts to change. */
export const TrackedSetting = obj(
	{
		id: IdToken,
		resourceId: ResourceId,
		desiredState: opt(ResourceState),
		disabledByUserAt: opt(DateTime),
		response: PolicyResponse,
		conflictWith: opt(
			arr(
				obj(
					{
						actor: str({ maxLength: 256, description: 'e.g. "Windows Update", another app.' }),
						explanation: str({ maxLength: 4096 }),
					},
					{ description: "Known conflicts explained rather than silently overridden." },
				),
			),
		),
		note: opt(str({ maxLength: 4096 })),
	},
	{
		description:
			"User-defined policy entry: remember disabled tasks/services/settings and detect attempts to change them. No publisher receives an automatic exemption.",
	},
);
export type TrackedSetting = {
	id: string;
	resourceId: string;
	desiredState?: ResourceState;
	disabledByUserAt?: string;
	response: PolicyResponse;
	conflictWith?: { actor: string; explanation: string }[];
	note?: string;
};

/** The per-user policy document governing GetMe's own behavior too. */
export const UserPolicy = obj(
	{
		policyId: IdToken,
		revision: int({ minimum: 1 }),
		updatedAt: DateTime,
		defaultApprovalFloor: ApprovalLevel,
		trackedSettings: opt(arr(TrackedSetting)),
		persistenceDefaults: obj(
			{
				scheduledTasks: PolicyResponse,
				services: PolicyResponse,
				startupEntries: PolicyResponse,
				protocolHandlers: PolicyResponse,
				fileAssociations: PolicyResponse,
			},
			{ description: "Default response per persistence surface." },
		),
		telemetryStance: obj(
			{
				blockOptInDialogs: opt(bool()),
				noteOnBlocked: opt(bool()),
			},
			{ description: "Handling of the software's own data-collection defaults (configure-phase choices)." },
		),
		securityToolRule: lit("never-disable"),
		shareProfile: opt(bool()),
		shareDeltas: opt(bool()),
		retentionDays: opt(int({ minimum: 0, description: "0 = keep forever locally until user prunes." })),
		exportFormat: opt(union([lit("jsonl"), lit("sqlite"), lit("tar+manifest")])),
	},
	{
		description:
			"GetMe meets its own standard: this policy is visible, revocable, and covers GetMe's monitoring/persistence identically to installed software.",
	},
);
export type UserPolicy = {
	policyId: string;
	revision: number;
	updatedAt: string;
	defaultApprovalFloor: ApprovalLevel;
	trackedSettings?: TrackedSetting[];
	persistenceDefaults: Record<string, PolicyResponse>;
	telemetryStance: { blockOptInDialogs?: boolean; noteOnBlocked?: boolean };
	securityToolRule: "never-disable";
	shareProfile?: boolean;
	shareDeltas?: boolean;
	retentionDays?: number;
	exportFormat?: string;
};

// ---------------------------------------------------------------------------
// Continued observation
// ---------------------------------------------------------------------------

/** One post-install observation batch: what changed since the last snapshot, attributed how. */
export const LifecycleObservation = obj(
	{
		observationId: IdToken,
		installationId: InstallationId,
		at: DateTime,
		watchWindowStart: DateTime,
		watchWindowEnd: DateTime,
		changes: arr(ObservedEffect, { minItems: 1 }),
		reEnabled: opt(
			arr(
				obj(
					{
						resourceId: ResourceId,
						wasDisabledBy: union([lit("user"), lit("policy"), lit("unknown")]),
						reactivatedByEvidence: opt(str({ maxLength: 4096 })),
					},
					{ description: "Existing resources being re-enabled — the case PID/prefix attribution misses." },
				),
			),
		),
		unattributed: opt(arr(ObservedEffect)),
		coverage: CoverageReport,
	},
	{ description: "A batch of post-install changes relevant to one managed installation." },
);
export type LifecycleObservation = {
	observationId: string;
	installationId: string;
	at: string;
	watchWindowStart: string;
	watchWindowEnd: string;
	changes: ObservedEffect[];
	reEnabled?: { resourceId: string; wasDisabledBy: string; reactivatedByEvidence?: string }[];
	unattributed?: ObservedEffect[];
	coverage: CoverageReport;
};

// ---------------------------------------------------------------------------
// Managed installation record (the durable identity aliases resolve to)
// ---------------------------------------------------------------------------

export const ManagedInstallation = obj(
	{
		installationId: InstallationId,
		alias: Alias,
		displayName: str({ maxLength: 256 }),
		state: InstallationState,
		installedAt: DateTime,
		lastObservedAt: opt(DateTime),
		targetSoftware: obj(
			{
				name: str({ maxLength: 256 }),
				publisher: opt(str({ maxLength: 256 })),
				version: opt(str({ maxLength: 64 })),
				features: opt(arr(IdToken)),
			},
			{ description: "What was installed and how it was configured." },
		),
		recipeRef: opt(obj({ recipeId: IdToken, revision: Semver, contentHash: Hash })),
		planDigests: arr(Hash, { minItems: 1, description: "Every plan accepted under this identity, in order." }),
		recordRefs: arr(str({ maxLength: 1024 }), { minItems: 1 }),
		latestRecordDigest: Hash,
		integrityAssurance: IntegrityAssurance,
		accessPoints: opt(arr(ConfiguredAccessPoint)),
		ownedResources: opt(
			arr(
				obj(
					{
						resourceId: ResourceId,
						ownership: union([lit("sole"), lit("shared"), lit("pre-existing"), lit("disputed")]),
						claimedBranch: opt(bool()),
						journalWrites: opt(bool()),
					},
					{ description: "Registry/path branches the app claims; GetMe still journals writes within grants." },
				),
			),
		),
		dependencyEdges: opt(
			arr(
				obj(
					{
						from: InstallationId,
						to: ResourceId,
						type: union([lit("requires-runtime"), lit("shares-component"), lit("delegates-to-service")]),
						note: opt(str({ maxLength: 1024 })),
					},
					{
						description:
							"GetMe's own graph — explicitly NOT proof that unmanaged software lacks a dependency on a shared component.",
					},
				),
			),
		),
		updateChannel: opt(
			obj(
				{
					method: union([lit("winget"), lit("scoop"), lit("choco"), lit("vendor-feed"), lit("manual")]),
					probe: opt(str({ maxLength: 4096 })),
					lastCheckedAt: opt(DateTime),
					availableVersion: opt(str({ maxLength: 64 })),
				},
				{ description: "Backing for `getupdates` / `get updates <aliases>`." },
			),
		),
		pendingReboot: opt(bool()),
	},
	{ description: "The durable managed-installation identity in the local registry." },
);
export type ManagedInstallation = {
	installationId: string;
	alias: string;
	displayName: string;
	state: InstallationState;
	installedAt: string;
	lastObservedAt?: string;
	targetSoftware: { name: string; publisher?: string; version?: string; features?: string[] };
	recipeRef?: { recipeId: string; revision: string; contentHash: string };
	planDigests: string[];
	recordRefs: string[];
	latestRecordDigest: string;
	integrityAssurance: IntegrityAssurance;
	accessPoints?: ConfiguredAccessPoint[];
	ownedResources?: { resourceId: string; ownership: string; claimedBranch?: boolean; journalWrites?: boolean }[];
	dependencyEdges?: { from: string; to: string; type: string; note?: string }[];
	updateChannel?: { method: string; probe?: string; lastCheckedAt?: string; availableVersion?: string };
	pendingReboot?: boolean;
};

/** Alias -> installation id index (string map). */
export const AliasIndex = {
	type: "object",
	additionalProperties: { type: "string", minLength: 1 },
} as unknown as Schema<Record<string, string>>;

/** The local registry of everything GetMe manages. */
export const InstallationRegistry = obj(
	{
		schema: lit(LIFECYCLE_SCHEMA_ID),
		schemaVersion: Semver,
		registryRevision: int({ minimum: 1 }),
		updatedAt: DateTime,
		installations: arr(ManagedInstallation),
		aliasIndex: opt(AliasIndex),
		policy: UserPolicy,
	},
	{ description: "Local installation registry + active policy. Aliases resolve through aliasIndex to ids." },
);
export type InstallationRegistry = {
	schema: string;
	schemaVersion: string;
	registryRevision: number;
	updatedAt: string;
	installations: ManagedInstallation[];
	aliasIndex?: Record<string, string>;
	policy: UserPolicy;
};

// ---------------------------------------------------------------------------
// Requests: the conversational surface (model OR deterministic form)
// ---------------------------------------------------------------------------

/** Verbs from the vision's command vocabulary. */
export const verbs = [
	"getme",
	"getgone",
	"gethelp",
	"getupdates",
	"get-updates-list",
	"onboard",
	"export",
	"revoke-self",
] as const;
export type Verb = (typeof verbs)[number];
export const Verb = union(verbs.map((v) => lit(v)) as unknown as readonly Schema[]) as unknown as Schema<Verb>;

/** A user request entering the system. */
export const RequestEnvelope = obj(
	{
		requestId: IdToken,
		verb: Verb,
		rawInput: str({ maxLength: 8192 }),
		resolvedTarget: opt(
			union([
				lit("known-name"),
				lit("objective"),
				lit("alias"),
				lit("spelling-corrected"),
				lit("ambiguous-needs-choice"),
			]),
		),
		spellingCorrectionsApplied: opt(
			arr(
				obj(
					{ from: str({ maxLength: 256 }), to: str({ maxLength: 256 }) },
					{ description: "Recoverable alias/spelling mapping." },
				),
			),
		),
		ambiguityChoices: opt(
			arr(
				obj(
					{
						label: str({ maxLength: 256 }),
						explanation: str({ maxLength: 4096 }),
						recipeCandidates: opt(arr(str({ maxLength: 256 }))),
					},
					{
						description:
							"When intent is ambiguous: present understandable choices instead of executing a dangerous guess.",
					},
				),
			),
		),
		path: union([lit("deterministic-form"), lit("agent")], {
			description: "A familiar experience should not require a model call at every step.",
		}),
		selectedOptions: opt(arr(IdToken)),
		machineProfileSnapshotId: opt(str({ maxLength: 64 })),
	},
	{ description: "One `getme ...` / `getgone ...` / `gethelp ...` / `getupdates ...` interaction." },
);
export type RequestEnvelope = {
	requestId: string;
	verb: Verb;
	rawInput: string;
	resolvedTarget?: string;
	spellingCorrectionsApplied?: { from: string; to: string }[];
	ambiguityChoices?: { label: string; explanation: string; recipeCandidates?: string[] }[];
	path: "deterministic-form" | "agent";
	selectedOptions?: string[];
	machineProfileSnapshotId?: string;
};

/** Install-method choice presented in the TUI (illustrative options only when they actually support the software). */
export const MethodOffer = obj(
	{
		methodId: IdToken,
		label: str({ maxLength: 256 }),
		channel: union([
			lit("winget"),
			lit("scoop"),
			lit("choco"),
			lit("msi"),
			lit("exe"),
			lit("portable"),
			lit("wsl"),
			lit("source-build"),
			lit("other"),
		]),
		consequences: obj(
			{
				howItOpens: str({ maxLength: 4096 }),
				whereFilesLive: str({ maxLength: 4096 }),
				hardwareSupport: opt(str({ maxLength: 4096 })),
				tradeoffs: opt(str({ maxLength: 4096 })),
				privilegeNeeds: arr(str({ maxLength: 64 })),
			},
			{ description: "Plain-language consequences the user cares about." },
		),
		recipeCandidates: arr(str({ maxLength: 256 }), { minItems: 1 }),
	},
	{ description: "One selectable installation approach with honest trade-offs." },
);
export type MethodOffer = {
	methodId: string;
	label: string;
	channel: string;
	consequences: {
		howItOpens: string;
		whereFilesLive: string;
		hardwareSupport?: string;
		tradeoffs?: string;
		privilegeNeeds: string[];
	};
	recipeCandidates: string[];
};

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

/** Data-sharing proposal — always separate from the install itself. */
export const SharingProposal = obj(
	{
		offered: bool(),
		accepted: opt(bool()),
		whatWouldBeShared: arr(str({ maxLength: 4096 })),
		redactionsApplied: opt(arr(IdToken)),
		purpose: opt(str({ maxLength: 4096 })),
		withdrawInstruction: str({ maxLength: 4096 }),
	},
	{
		description:
			"Optional, separate consent. Declining must not impair local removal or receipt usefulness. Hosted-reasoning disclosure lives elsewhere and is not this field.",
	},
);
export type SharingProposal = {
	offered: boolean;
	accepted?: boolean;
	whatWouldBeShared: string[];
	redactionsApplied?: string[];
	purpose?: string;
	withdrawInstruction: string;
};

/** The concise outcome handed to the user after any phase. */
export const Receipt = obj(
	{
		schema: lit("https://getme.dev/schema/receipt.json"),
		schemaVersion: Semver,
		receiptId: IdToken,
		installationId: InstallationId,
		alias: Alias,
		phase: PlanPhase,
		issuedAt: DateTime,
		outcome: union([lit("success"), lit("success-with-gaps"), lit("partial"), lit("failed"), lit("aborted")]),
		summary: str({ minLength: 1, maxLength: 8192 }),
		stats: opt(
			obj(
				{
					downloadedBytes: opt(int({ minimum: 0 })),
					filesCreated: opt(int({ minimum: 0 })),
					registryWrites: opt(int({ minimum: 0 })),
					persistenceAdded: opt(int({ minimum: 0 })),
					durationSeconds: opt(int({ minimum: 0 })),
					modelCalls: opt(int({ minimum: 0 })),
				},
				{ description: "Installation statistics shown to the user." },
			),
		),
		howToUse: arr(str({ maxLength: 4096 }), { minItems: 1 }),
		commands: obj(
			{
				remove: str({ maxLength: 1024 }),
				customize: str({ maxLength: 1024 }),
				update: str({ maxLength: 1024 }),
			},
			{ description: "The exact getgone/gethelp/getupdates invocations for this installation." },
		),
		gapsAndCaveats: arr(str({ maxLength: 4096 }), {
			minItems: 1,
			description: "Copied from coverage declarations — unsupported or partially observed cases stay visible.",
		}),
		recordPointer: obj(
			{
				path: str({ maxLength: 1024 }),
				digest: Hash,
				assurance: IntegrityAssurance,
				exportCommand: str({ maxLength: 1024 }),
			},
			{ description: "Where the full record lives locally + how to export it (preserve-on-request)." },
		),
		sharing: SharingProposal,
	},
	{
		description:
			"The useful receipt: outcome, stats, access instructions, lifecycle commands, gaps, record pointer.",
	},
);
export type Receipt = {
	schema: string;
	schemaVersion: string;
	receiptId: string;
	installationId: string;
	alias: string;
	phase: PlanPhase;
	issuedAt: string;
	outcome: string;
	summary: string;
	stats?: {
		downloadedBytes?: number;
		filesCreated?: number;
		registryWrites?: number;
		persistenceAdded?: number;
		durationSeconds?: number;
		modelCalls?: number;
	};
	howToUse: string[];
	commands: { remove: string; customize: string; update: string };
	gapsAndCaveats: string[];
	recordPointer: { path: string; digest: string; assurance: IntegrityAssurance; exportCommand: string };
	sharing: SharingProposal;
};

// ---------------------------------------------------------------------------
// Removal (getgone)
// ---------------------------------------------------------------------------

/** One resource's removal disposition after reconciliation against the record. */
export const RemovalDisposition = obj(
	{
		resourceId: ResourceId,
		classification: union([
			lit("introduced-by-this-installation"),
			lit("modified-from-before-state"),
			lit("pre-existing"),
			lit("shared-still-referenced"),
			lit("changed-after-install"),
			lit("uncertain-attribution"),
			lit("user-data"),
		]),
		action: union([
			lit("restore-prior-state"),
			lit("delete"),
			lit("retain-shared"),
			lit("retain-user-choice"),
			lit("defer-pending-reboot"),
			lit("unresolved-conflict"),
			lit("left-in-place-unrelated-work"),
		]),
		conflict: opt(
			obj(
				{
					beforeInstall: opt(ResourceState),
					atRemovalTime: opt(ResourceState),
					laterChangeBy: opt(str({ maxLength: 4096 })),
					userDecision: opt(union([lit("keep-later"), lit("restore-ours"), lit("backup-then-restore")])),
				},
				{
					description:
						"A→B by us, B→C later: needs ownership history and an explicit conflict outcome — never blindly restore A over C.",
				},
			),
		),
		evidenceRefs: opt(arr(IdToken)),
		note: opt(str({ maxLength: 4096 })),
	},
	{ description: "Per-resource removal decision with its basis." },
);
export type RemovalDisposition = {
	resourceId: string;
	classification: string;
	action: string;
	conflict?: {
		beforeInstall?: ResourceState;
		atRemovalTime?: ResourceState;
		laterChangeBy?: string;
		userDecision?: string;
	};
	evidenceRefs?: string[];
	note?: string;
};

/** The removal receipt: what was restored/deleted/retained/unresolved, plus verification. */
export const RemovalReceipt = obj(
	{
		schema: lit("https://getme.dev/schema/removal-receipt.json"),
		schemaVersion: Semver,
		removalId: IdToken,
		installationId: InstallationId,
		alias: Alias,
		startedAt: DateTime,
		finishedAt: opt(DateTime),
		strategyUsed: union([
			lit("vendor-uninstaller-then-reconcile"),
			lit("journal-replay"),
			lit("per-step-compensation"),
			lit("mixed"),
		]),
		vendorUninstallerOutcome: opt(
			obj({
				exitCode: opt(int()),
				observedEffects: opt(int({ minimum: 0 })),
				note: opt(str({ maxLength: 4096 })),
			}),
		),
		dispositions: arr(RemovalDisposition, { minItems: 1 }),
		restored: int({ minimum: 0 }),
		deleted: int({ minimum: 0 }),
		sharedRetained: int({ minimum: 0 }),
		dataRetainedByChoice: int({ minimum: 0 }),
		pendingRebootActions: opt(arr(str({ maxLength: 4096 }))),
		unresolvedConflicts: arr(str({ maxLength: 4096 })),
		verificationResults: arr(VerificationStep, { minItems: 1 }),
		scopeStatement: str({
			minLength: 1,
			maxLength: 8192,
			description:
				"Honest boundary: supported local effects vs. remote account records, transmitted telemetry, arbitrary kernel code, unknown counterfactual history — none of which this claims to undo.",
		}),
		recordChain: opt(arr(Hash)),
	},
	{ description: "getgone's evidence-bearing receipt." },
);
export type RemovalReceipt = {
	schema: string;
	schemaVersion: string;
	removalId: string;
	installationId: string;
	alias: string;
	startedAt: string;
	finishedAt?: string;
	strategyUsed: string;
	vendorUninstallerOutcome?: { exitCode?: number; observedEffects?: number; note?: string };
	dispositions: RemovalDisposition[];
	restored: number;
	deleted: number;
	sharedRetained: number;
	dataRetainedByChoice: number;
	pendingRebootActions?: string[];
	unresolvedConflicts: string[];
	verificationResults: VerificationStep[];
	scopeStatement: string;
	recordChain?: string[];
};

/** Inputs to a getgone execution; steps reuse the plan verb vocabulary in reverse orientation. */
export const RemovalPlanRequest = obj(
	{
		installationId: InstallationId,
		basedOnRecords: arr(Hash, { minItems: 1 }),
		currentStateSnapshotDigest: Hash,
		conflictsNeedingUser: opt(arr(str({ maxLength: 4096 }))),
		proposedSteps: arr(InstallationPlan.properties.steps.items as unknown as Schema, { minItems: 1 }),
	},
	{ description: "Removal plan inputs derived by reconciling the record against live machine state." },
);
export type RemovalPlanRequest = {
	installationId: string;
	basedOnRecords: string[];
	currentStateSnapshotDigest: string;
	conflictsNeedingUser?: string[];
	proposedSteps: InstallationPlan["steps"];
};
