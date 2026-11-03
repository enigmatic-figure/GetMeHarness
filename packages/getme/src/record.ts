// Execution record: what actually happened, in two levels. Vision: "The executor returns two levels of
// information: a small status summary for the agent, and a detailed machine-readable execution record
// for local storage and analysis. The complete event stream is parsed and indexed without being fed
// back through the model."
//
// Integrity posture (vision): the intended immutable record is an append-only, tamper-evident history
// with verifiable ordering. Local hashes alone cannot resist an administrator on a compromised host —
// so every chain here is labeled honestly (`integrityAssurance`), and signing/anchoring are separate,
// optional claims layered on top.

import { arr, bool, int, lit, obj, opt, type Schema, str, union } from "@earendil-works/pi-schema";
import { EnvironmentMatch } from "./machine.ts";
import { ApprovalLevel, OnFailure, PlanPhase, PrivilegeClass } from "./plan.ts";
import { DigestMap, ProcessAncestry, ResourceId, ResourceState } from "./resources.ts";
import {
	AccountName,
	Alias,
	ArtifactLocator,
	DateTime,
	Hash,
	IdToken,
	InstallationId,
	Semver,
	Sid,
} from "./vocabulary.ts";

export const RECORD_SCHEMA_ID = "https://getme.dev/schema/record.json";
export const RECORD_SCHEMA_VERSION = "1.0.0";

/** Step outcome vocabulary. */
export const stepOutcomes = [
	"succeeded",
	"failed",
	"skipped-precondition",
	"aborted-by-policy",
	"denied-privilege",
	"timed-out",
	"killed",
	"rolled-back",
	"partial-gap",
] as const;
export type StepOutcome = (typeof stepOutcomes)[number];
export const StepOutcome = union(
	stepOutcomes.map((s) => lit(s)) as unknown as readonly Schema[],
) as unknown as Schema<StepOutcome>;

/** How much confidence the chain has, given its protection mechanism. Honest labels only. */
export const integrityAssurances = [
	"hash-chained-local", // detects casual tampering; NOT strong vs. an admin on the host
	"hmac-local-key", // detects external tampering while the key stays secret
	"signed-local-key", // signable by a GetMe key; key custody is the weak point
	"externally-anchored", // digest published to an anchor the host does not control
	"unsigned", // no integrity claim at all
] as const;
export type IntegrityAssurance = (typeof integrityAssurances)[number];
export const IntegrityAssurance = union(
	integrityAssurances.map((a) => lit(a)) as unknown as readonly Schema[],
) as unknown as Schema<IntegrityAssurance>;

/** One observed effect on one resource, attributed to an operation with explicit confidence. */
export const ObservedEffect = obj(
	{
		effectId: IdToken,
		resource: ResourceState,
		changeType: union([
			lit("created"),
			lit("modified"),
			lit("deleted"),
			lit("re-enabled"),
			lit("permission-changed"),
			lit("content-replaced"),
			lit("metadata-changed"),
		]),
		before: opt(ResourceState),
		after: opt(ResourceState),
		attribution: union([lit("declared"), lit("inferred"), lit("uncertain")], {
			description:
				"How this effect was linked to the installation. inferred/uncertain effects still appear in removal plans but flagged for user decision.",
		}),
		evidenceRefs: opt(arr(IdToken)),
		processAncestry: opt(ProcessAncestry),
		persistenceSurface: opt(bool()),
		note: opt(str({ maxLength: 4096 })),
	},
	{ description: "One attributable resource change." },
);
export type ObservedEffect = {
	effectId: string;
	resource: ResourceState;
	changeType: string;
	before?: ResourceState;
	after?: ResourceState;
	attribution: "declared" | "inferred" | "uncertain";
	evidenceRefs?: string[];
	processAncestry?: ProcessAncestry;
	persistenceSurface?: boolean;
	note?: string;
};

/** A raw journal event from the observer layer (file IO, registry ops, process starts...). */
export const JournalEvent = obj(
	{
		sequence: int({ minimum: 0 }),
		timestamp: DateTime,
		source: union([
			lit("observer.file"),
			lit("observer.registry"),
			lit("observer.process"),
			lit("observer.service"),
			lit("observer.task"),
			lit("executor"),
			lit("probe"),
		]),
		operation: str({ maxLength: 256 }),
		actorPid: opt(str({ pattern: "^\\d{1,10}$" })),
		initiatingSid: opt(Sid),
		target: opt(ResourceId),
		outcome: opt(str({ maxLength: 64 })),
		details: opt(str({ maxLength: 65_536 })),
		eventHash: Hash,
		prevEventHash: opt(Hash),
	},
	{
		description:
			"Append-only journal entry. `sequence` + hash chaining give ordering/integrity within the chain's declared assurance level.",
	},
);
export type JournalEvent = {
	sequence: number;
	timestamp: string;
	source: string;
	operation: string;
	actorPid?: string;
	initiatingSid?: string;
	target?: string;
	outcome?: string;
	details?: string;
	eventHash: string;
	prevEventHash?: string;
};

/** Result of executing one planned step. */
export const StepResult = obj(
	{
		stepId: IdToken,
		attempt: int({ minimum: 1, maximum: 10 }),
		outcome: StepOutcome,
		startedAt: DateTime,
		finishedAt: opt(DateTime),
		exitCode: opt(int()),
		privilegesUsed: opt(arr(PrivilegeClass)),
		elevationGrantedAt: opt(DateTime),
		approvalDecision: opt(
			obj(
				{
					level: ApprovalLevel,
					decidedBy: opt(AccountName),
					decidedAt: opt(DateTime),
					decision: union([lit("accepted"), lit("rejected"), lit("modified"), lit("covered-by-plan")]),
				},
				{ description: "Human gate outcome when the step required one." },
			),
		),
		effects: opt(arr(ObservedEffect)),
		journalRange: opt(
			obj(
				{ from: int({ minimum: 0 }), to: int({ minimum: 0 }) },
				{ description: "Journal sequence span." },
			),
		),
		verificationResults: opt(
			arr(
				obj(
					{
						id: IdToken,
						passed: bool(),
						detail: opt(str({ maxLength: 4096 })),
					},
					{ description: "Outcome of one declared check." },
				),
			),
		),
		stdoutDigest: opt(Hash),
		stderrDigest: opt(Hash),
		error: opt(
			obj(
				{
					classification: IdToken,
					message: str({ maxLength: 8192 }),
					suggestsDiscovery: opt(bool()),
				},
				{ description: "Structured failure; suggestsDiscovery routes back to the agent instead of retrying." },
			),
		),
		compensationApplied: opt(bool()),
		compensationResult: opt(str({ maxLength: 4096 })),
		onFailureTaken: opt(OnFailure),
	},
	{ description: "Execution result for one plan step." },
);
export type StepResult = {
	stepId: string;
	attempt: number;
	outcome: StepOutcome;
	startedAt: string;
	finishedAt?: string;
	exitCode?: number;
	privilegesUsed?: PrivilegeClass[];
	elevationGrantedAt?: string;
	approvalDecision?: { level: ApprovalLevel; decidedBy?: string; decidedAt?: string; decision: string };
	effects?: ObservedEffect[];
	journalRange?: { from: number; to: number };
	verificationResults?: { id: string; passed: boolean; detail?: string }[];
	stdoutDigest?: string;
	stderrDigest?: string;
	error?: { classification: string; message: string; suggestsDiscovery?: boolean };
	compensationApplied?: boolean;
	compensationResult?: string;
	onFailureTaken?: OnFailure;
};

/** Coverage declaration: what the observation could and could not see. Gaps reduce certainty explicitly. */
export const CoverageReport = obj(
	{
		observersActive: arr(IdToken, { minItems: 1 }),
		observersFailed: opt(arr(obj({ id: IdToken, reason: str({ maxLength: 4096 }) }))),
		unattributedEvents: int({ minimum: 0 }),
		surfacesNotCovered: opt(arr(str({ maxLength: 128 }))),
		delegatedActionsObservedIndirectly: opt(int({ minimum: 0 })),
		certainty: union([lit("full"), lit("partial"), lit("degraded")], {
			description:
				"A missing event, unsupported operation, or interrupted observer downgrades this — it never silently stays 'full'.",
		}),
		explanation: str({ minLength: 1, maxLength: 8192 }),
	},
	{ description: "Explicit statement of observation coverage and its gaps." },
);
export type CoverageReport = {
	observersActive: string[];
	observersFailed?: { id: string; reason: string }[];
	unattributedEvents: number;
	surfacesNotCovered?: string[];
	delegatedActionsObservedIndirectly?: number;
	certainty: "full" | "partial" | "degraded";
	explanation: string;
};

/** The small status summary handed back to the agent (bounded, never the full stream). */
export const AgentStatusSummary = obj(
	{
		runId: IdToken,
		state: union([
			lit("running"),
			lit("succeeded"),
			lit("failed"),
			lit("blocked-on-human"),
			lit("needs-discovery"),
		]),
		completedSteps: int({ minimum: 0 }),
		totalSteps: int({ minimum: 1 }),
		lastError: opt(
			obj(
				{
					stepId: IdToken,
					classification: IdToken,
					message: str({ maxLength: 2048 }),
					changedAssumptions: opt(arr(str({ maxLength: 1024 }))),
				},
				{ description: "Bounded failure evidence for agent intervention." },
			),
		),
		humanQuestion: opt(
			obj(
				{
					kind: union([
						lit("select-software"),
						lit("choose-install-experience"),
						lit("accept-privilege"),
						lit("resolve-removal-conflict"),
						lit("consent-data-sharing"),
					]),
					prompt: str({ maxLength: 4096 }),
					options: opt(arr(str({ maxLength: 1024 }))),
				},
				{ description: "Only decisions that matter reach the human." },
			),
		),
		recordRef: str({ maxLength: 1024, description: "Pointer to the full record on disk." }),
	},
	{
		description:
			"Agent-facing summary. The full event stream stays out of context; the agent gets failures, changed assumptions, or bounded evidence when it needs to intervene.",
	},
);
export type AgentStatusSummary = {
	runId: string;
	state: string;
	completedSteps: number;
	totalSteps: number;
	lastError?: { stepId: string; classification: string; message: string; changedAssumptions?: string[] };
	humanQuestion?: { kind: string; prompt: string; options?: string[] };
	recordRef: string;
};

/** The full execution record for one plan run. */
export const ExecutionRecord = obj(
	{
		schema: lit(RECORD_SCHEMA_ID),
		schemaVersion: Semver,
		recordId: IdToken,
		runId: IdToken,
		installationId: InstallationId,
		alias: Alias,
		phase: PlanPhase,
		planDigest: Hash,
		recipeRevision: opt(Semver),
		startedAt: DateTime,
		finishedAt: opt(DateTime),
		executionContext: obj(
			{
				machineProfileId: str({ maxLength: 64 }),
				environmentFacts: EnvironmentMatch,
				account: AccountName,
				sid: Sid,
				elevated: bool(),
				hostIntegrityBaseline: opt(Hash),
			},
			{ description: "Relevant environment facts at execution time." },
		),
		artifactsConsumed: opt(
			arr(
				obj(
					{
						locator: ArtifactLocator,
						actualHash: Hash,
						hashMatchedPlan: bool(),
						signatureStatus: opt(str({ maxLength: 64 })),
					},
					{ description: "Artifact identity as actually consumed, compared against the plan." },
				),
			),
		),
		steps: arr(StepResult, { minItems: 1 }),
		effectsIndex: opt(
			arr(
				obj(
					{
						resourceId: ResourceId,
						changeTypes: arr(str({ maxLength: 64 })),
						firstSeenSequence: opt(int({ minimum: 0 })),
						ownership: union([lit("sole"), lit("shared"), lit("pre-existing"), lit("disputed")]),
						otherInstallationsSharing: opt(arr(InstallationId)),
					},
					{ description: "Per-resource rollup used by removal reconciliation." },
				),
			),
		),
		coverage: CoverageReport,
		integrity: obj(
			{
				assurance: IntegrityAssurance,
				headHash: Hash,
				chunkSize: opt(int({ minimum: 1 })),
				signedBy: opt(str({ maxLength: 1024 })),
				anchorReceipt: opt(str({ maxLength: 4096 })),
				note: opt(str({ maxLength: 4096 })),
			},
			{
				description:
					"Tamper-evidence posture. No field here may claim more than its mechanism supports; 'immutable' requires external anchoring + key custody design.",
			},
		),
		rebootPending: opt(bool()),
		userVisibleStats: opt(
			obj(
				{
					downloadedBytes: opt(int({ minimum: 0 })),
					filesCreated: opt(int({ minimum: 0 })),
					registryWrites: opt(int({ minimum: 0 })),
					persistenceAdded: opt(int({ minimum: 0 })),
					durationSeconds: opt(int({ minimum: 0 })),
					modelCalls: opt(int({ minimum: 0 })),
				},
				{ description: "Numbers surfaced in the receipt." },
			),
		),
	},
	{
		description:
			"Detailed machine-readable record of one run: operations attempted and results, before/after states where captured, attribution evidence, coverage gaps, and integrity posture.",
	},
);
export type ExecutionRecord = {
	schema: string;
	schemaVersion: string;
	recordId: string;
	runId: string;
	installationId: string;
	alias: string;
	phase: PlanPhase;
	planDigest: string;
	recipeRevision?: string;
	startedAt: string;
	finishedAt?: string;
	executionContext: {
		machineProfileId: string;
		environmentFacts: EnvironmentMatch;
		account: string;
		sid: string;
		elevated: boolean;
		hostIntegrityBaseline?: string;
	};
	artifactsConsumed?: { locator: string; actualHash: string; hashMatchedPlan: boolean; signatureStatus?: string }[];
	steps: StepResult[];
	effectsIndex?: { resourceId: string; changeTypes: string[]; firstSeenSequence?: number; ownership: string; otherInstallationsSharing?: string[] }[];
	coverage: CoverageReport;
	integrity: {
		assurance: IntegrityAssurance;
		headHash: string;
		chunkSize?: number;
		signedBy?: string;
		anchorReceipt?: string;
		note?: string;
	};
	rebootPending?: boolean;
	userVisibleStats?: {
		downloadedBytes?: number;
		filesCreated?: number;
		registryWrites?: number;
		persistenceAdded?: number;
		durationSeconds?: number;
		modelCalls?: number;
	};
};

/** Convenience re-export so consumers can type the digest map without importing resources directly. */
export type { DigestMap };
