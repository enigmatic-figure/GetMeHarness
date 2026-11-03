// Recipe: the reusable unit of knowledge. "Retrieval first, discovery when needed."
//
// A recipe is a versioned installation description that matches a declared environment, artifact version
// or hash, installation method, and selected features. A successful run on one machine is EVIDENCE WITHIN
// THAT CONTEXT — never proof for every machine. Trust states make that explicit; a recipe that fails its
// preconditions/verification/coverage checks returns to discovery rather than receiving blind retries.

import { arr, bool, int, lit, obj, opt, type Schema, str, union } from "@earendil-works/pi-schema";
import { EnvironmentMatch } from "./machine.ts";
import {
	ApprovalLevel,
	EffectScope,
	ExitExpectation,
	PlanStep,
	VerificationStep,
} from "./plan.ts";
import { Alias, DateTime, Hash, IdToken, Semver } from "./vocabulary.ts";

export const RECIPE_SCHEMA_ID = "https://getme.dev/schema/recipe.json";
export const RECIPE_SCHEMA_VERSION = "1.0.0";

/** How much the knowledge base currently trusts this recipe revision. */
export const trustStates = [
	"candidate", // produced by discovery; not yet validated beyond its originating run
	"testing", // queued/passed controlled-fixture or rehearsal validation
	"verified", // passed rehearsal + independent host runs within declared context
	"degraded", // recent failures reduced confidence; usable with extra gates
	"quarantined", // fails coverage/consistency checks; retrieval refuses it, discovery resumes
	"revoked", // proven unsafe or invalid; never executed again
] as const;
export type TrustState = (typeof trustStates)[number];
export const TrustState = union(
	trustStates.map((t) => lit(t)) as unknown as readonly Schema[],
) as unknown as Schema<TrustState>;

/** Where a recipe revision came from. */
export const recipeOrigins = ["discovery", "human", "developer-manifest", "imported-community"] as const;
export type RecipeOrigin = (typeof recipeOrigins)[number];
export const RecipeOrigin = union(
	recipeOrigins.map((o) => lit(o)) as unknown as readonly Schema[],
) as unknown as Schema<RecipeOrigin>;

/** Evidence accumulated from actual runs (bounded summaries — full records stay local per installation). */
export const RunEvidence = obj(
	{
		evidenceId: IdToken,
		recordDigest: Hash,
		outcome: union([lit("success"), lit("partial-gap"), lit("failure")]),
		environmentHash: Hash,
		artifactHash: Hash,
		featureSetHash: Hash,
		at: DateTime,
		failureClass: opt(IdToken),
		note: opt(str({ maxLength: 4096 })),
	},
	{
		description:
			"One run's contribution to trust. Aggregation rules (how many successes verify a recipe, how fast failures degrade it) live in knowledge-base policy, not in this schema.",
	},
);
export type RunEvidence = {
	evidenceId: string;
	recordDigest: string;
	outcome: string;
	environmentHash: string;
	artifactHash: string;
	featureSetHash: string;
	at: string;
	failureClass?: string;
	note?: string;
};

/** Feature options the user can pick; each maps to step-id sets inside the recipe body. */
export const RecipeFeature = obj(
	{
		id: IdToken,
		label: str({ maxLength: 256 }),
		description: str({ maxLength: 4096 }),
		stepIds: arr(IdToken, { minItems: 1 }),
		defaultOn: opt(bool()),
		mutuallyExclusiveWith: opt(arr(IdToken)),
	},
	{ description: 'A selectable feature ("GPU acceleration", "CLI only") wired to recipe steps.' },
);
export type RecipeFeature = {
	id: string;
	label: string;
	description: string;
	stepIds: string[];
	defaultOn?: boolean;
	mutuallyExclusiveWith?: string[];
};

/** Removal behavior contract carried alongside install behavior. */
export const RemovalContract = obj(
	{
		strategy: union([
			lit("vendor-uninstaller-then-reconcile"),
			lit("journal-replay"),
			lit("per-step-compensation"),
			lit("manual-note"),
		]),
		vendorUninstaller: opt(
			obj(
				{
					command: str({ maxLength: 8192 }),
					silentSwitches: opt(arr(str({ maxLength: 1024 }))),
					productCode: opt(
						str({ pattern: "^\\{?[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\\?$" }),
					),
					exit: opt(ExitExpectation),
				},
				{ description: "Vendor uninstaller info; GetMe still observes and reconciles remnants." },
			),
		),
		preserveByDefault: arr(
			obj(
				{
					resourcePattern: str({ minLength: 1, maxLength: 4096 }),
					reason: str({ maxLength: 1024 }),
				},
				{ description: "User documents / exports / shared data kept unless the user chooses deletion." },
			),
			{ description: "Explicit preservation policy; deleting these needs an affirmative user choice." },
		),
		conflictPolicy: obj(
			{
				onLaterThirdPartyChange: union([lit("preserve-later"), lit("ask-user"), lit("restore-with-backup")], {
					description:
						"When a resource changed after installation (A→B by us, B→C later): default preserve-later and surface the conflict; never blindly restore A.",
				}),
				onSharedOwnership: union([lit("retain-if-referenced"), lit("ask-user")]),
			},
			{ description: "Removal conflict resolution defaults." },
		),
		removalVerification: arr(VerificationStep, {
			minItems: 1,
			description: "Tests establishing whether removal worked. Verification belongs after removal too.",
		}),
	},
	{ description: "How getgone should behave for software installed from this recipe." },
);
export type RemovalContract = {
	strategy: string;
	vendorUninstaller?: {
		command: string;
		silentSwitches?: string[];
		productCode?: string;
		exit?: ExitExpectation;
	};
	preserveByDefault: { resourcePattern: string; reason: string }[];
	conflictPolicy: { onLaterThirdPartyChange: string; onSharedOwnership: string };
	removalVerification: VerificationStep[];
};

/** Reference to a verified access adaptation template (full definition lives in access.ts). */
export const AccessTemplateRef = obj(
	{
		templateId: IdToken,
		revision: Semver,
		contentHash: Hash,
	},
	{ description: "Pointer to an access-preference adaptation offered at configure time." },
);
export type AccessTemplateRef = { templateId: string; revision: string; contentHash: string };

/** The recipe document. */
export const InstallationRecipe = obj(
	{
		schema: lit(RECIPE_SCHEMA_ID),
		schemaVersion: Semver,
		recipeId: IdToken,
		revision: Semver,
		supersedes: opt(Semver),
		title: str({ maxLength: 256 }),
		summary: str({ maxLength: 8192 }),
		aliases: opt(arr(Alias)),
		target: obj(
			{
				name: str({ maxLength: 256 }),
				publisher: opt(str({ maxLength: 256 })),
				homepage: opt(str({ pattern: "^https?://\\S+$", maxLength: 2048 })),
				license: opt(str({ maxLength: 256 })),
			},
			{ description: "The software this recipe installs." },
		),
		origin: RecipeOrigin,
		trust: obj(
			{
				state: TrustState,
				successfulRuns: int({ minimum: 0 }),
				failedRuns: int({ minimum: 0 }),
				independentEnvironmentHashes: int({ minimum: 0 }),
				lastValidatedAt: opt(DateTime),
				invalidationReasons: opt(arr(str({ maxLength: 1024 }))),
			},
			{
				description:
					"Trust bookkeeping. Retrieval prefers verified recipes; degraded/quarantined revisions route requests back to discovery instead of retrying blind.",
			},
		),
		match: obj(
			{
				environment: EnvironmentMatch,
				artifact: obj(
					{
						locator: str({ maxLength: 4096 }),
						versionRange: opt(str({ maxLength: 128 })),
						hash: opt(Hash),
						hashAlgorithms: opt(arr(IdToken)),
					},
					{ description: "Artifact version OR hash pin; both present means AND." },
				),
				method: str({
					maxLength: 128,
					pattern:
						"^(msi|exe-silent|burn-bundle|clickonce|appx-msix|store|winget|scoop|choco|portable|python-uv|python-pip|python-poetry|python-conda|node-npm|node-pnpm|node-yarn|node-bun|rust-cargo|rust-binstall|java-jdk|dotnet-sdk|cpp-vs-buildtools|cmake|ninja|meson|bazel|llvm-mlir|mingw|strawberry-perl|qt-aqt|pyside|electron-runtime|git-source-build|wsl-bootstrap|wsl-distro|apt|dnf|pacman|zypper|apk|brew-linux|oci-container|oci-compose|script-bootstrap|powershell-gallery|vsix)$",
					description:
						"Primary installation-method label; must be a known path id from the environment catalog (additive revisions extend the list).",
				}),
				features: opt(arr(IdToken)),
			},
			{ description: "What a request must match for this recipe to be retrievable." },
		),
		prerequisites: opt(
			arr(
				obj(
					{
						runtime: IdToken,
						minVersion: opt(str({ maxLength: 64 })),
						installIfMissing: opt(
							obj(
								{
									recipeRef: str({
										maxLength: 256,
										description: '"<recipeId>@<revision>" of a prerequisite recipe.',
									}),
									approval: ApprovalLevel,
								},
								{ description: "Auto-install path for the prerequisite, gated by approval level." },
							),
						),
					},
					{ description: "Prerequisite with optional chained recipe." },
				),
			),
		),
		steps: arr(PlanStep, { minItems: 1 }),
		features: opt(arr(RecipeFeature)),
		expectedEffects: opt(arr(EffectScope)),
		verification: arr(VerificationStep, { minItems: 1 }),
		removal: RemovalContract,
		accessPreferences: opt(arr(AccessTemplateRef)),
		postInstallNotes: opt(str({ maxLength: 8192 })),
		knowledgeProvenance: obj(
			{
				learnedFrom: opt(arr(RunEvidence)),
				discoverySessionRef: opt(IdToken),
				humanReview: opt(
					obj(
						{
							reviewedBy: str({ maxLength: 256 }),
							at: DateTime,
							verdict: union([lit("approved"), lit("changes-requested")]),
						},
						{ description: "Human sign-off where required by policy." },
					),
				),
			},
			{ description: "What was learned, the evidence supporting it, and the circumstances it applies in." },
		),
		limits: obj(
			{
				maxRetriesPerHost: int({ minimum: 0, maximum: 10 }),
				escalation: union([lit("return-to-discovery"), lit("ask-human"), lit("abort-record-gap")]),
				modelBudgetHint: opt(int({ minimum: 0 })),
				rehearsalRequired: bool(),
			},
			{ description: "Retry/escalation bounds so neither host changes nor inference costs grow without control." },
		),
		coverageDeclaration: str({
			minLength: 1,
			maxLength: 8192,
			description: "Known observation gaps of this recipe (e.g. 'reboot-phase effects unobserved').",
		}),
	},
	{
		description:
			"Versioned installation recipe. The body is plan-shaped (same step vocabulary), so retrieval yields an immediately validatable plan once matched and parameterized.",
	},
);
export type InstallationRecipe = {
	schema: string;
	schemaVersion: string;
	recipeId: string;
	revision: string;
	supersedes?: string;
	title: string;
	summary: string;
	aliases?: string[];
	target: { name: string; publisher?: string; homepage?: string; license?: string };
	origin: RecipeOrigin;
	trust: {
		state: TrustState;
		successfulRuns: number;
		failedRuns: number;
		independentEnvironmentHashes: number;
		lastValidatedAt?: string;
		invalidationReasons?: string[];
	};
	match: {
		environment: EnvironmentMatch;
		artifact: { locator: string; versionRange?: string; hash?: string; hashAlgorithms?: string[] };
		method: string;
		features?: string[];
	};
	prerequisites?: {
		runtime: string;
		minVersion?: string;
		installIfMissing?: { recipeRef: string; approval: ApprovalLevel };
	}[];
	steps: PlanStep[];
	features?: RecipeFeature[];
	expectedEffects?: EffectScope[];
	verification: VerificationStep[];
	removal: RemovalContract;
	accessPreferences?: AccessTemplateRef[];
	postInstallNotes?: string;
	knowledgeProvenance: {
		learnedFrom?: RunEvidence[];
		discoverySessionRef?: string;
		humanReview?: { reviewedBy: string; at: string; verdict: string };
	};
	limits: { maxRetriesPerHost: number; escalation: string; modelBudgetHint?: number; rehearsalRequired: boolean };
	coverageDeclaration: string;
};
