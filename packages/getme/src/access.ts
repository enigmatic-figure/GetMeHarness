// Access adaptations: "make it fit the user" (journey step 6) as a first-class retrieval asset.
//
// Vision: reusable interaction adaptations can become another retrieval asset — discover a useful
// workflow once, verify its applicable versions and constraints, and provide it again. Teach the
// product how people want to use software, not only which software they install.

import { arr, bool, int, lit, obj, opt, type Schema, str, union } from "@earendil-works/pi-schema";
import { ApprovalLevel, PlanStep } from "./plan.ts";
import { ResourceId } from "./resources.ts";
import { DateTime, Hash, IdToken, Semver } from "./vocabulary.ts";

export const ACCESS_SCHEMA_ID = "https://getme.dev/schema/access.json";
export const ACCESS_SCHEMA_VERSION = "1.0.0";

/** Kinds of access points GetMe can configure and undo. */
export const accessKinds = [
	"start-menu-shortcut",
	"desktop-shortcut",
	"hotkey",
	"voice-entry",
	"context-menu",
	"cli-wrapper",
	"protocol-handler",
	"terminal-profile",
	"file-open-with",
	"wsl-bridge",
] as const;
export type AccessKind = (typeof accessKinds)[number];
export const AccessKind = union(
	accessKinds.map((k) => lit(k)) as unknown as readonly Schema[],
) as unknown as Schema<AccessKind>;

/** A pre-verified access template offered during the configure phase. */
export const AccessPreferenceTemplate = obj(
	{
		id: IdToken,
		kind: AccessKind,
		label: str({ maxLength: 256 }),
		description: str({ maxLength: 4096 }),
		requires: opt(arr(IdToken)),
		appliesTo: obj(
			{
				targetNames: opt(arr(str({ maxLength: 256 }))),
				versionRange: opt(str({ maxLength: 128 })),
				constraints: opt(str({ maxLength: 4096 })),
			},
			{ description: "The verified applicability window for this adaptation." },
		),
		steps: arr(PlanStep, { minItems: 1 }),
		reversal: arr(PlanStep, { minItems: 1 }),
	},
	{ description: "A discovered-once, re-servable interaction adaptation with its own reversal steps." },
);
export type AccessPreferenceTemplate = {
	id: string;
	kind: AccessKind;
	label: string;
	description: string;
	requires?: string[];
	appliesTo?: { targetNames?: string[]; versionRange?: string; constraints?: string };
	steps: PlanStep[];
	reversal: PlanStep[];
};

/** An access point actually configured for one installation (part of its record; undone by getgone). */
export const ConfiguredAccessPoint = obj(
	{
		id: IdToken,
		templateId: opt(IdToken),
		kind: AccessKind,
		location: opt(ResourceId),
		hotkey: opt(str({ maxLength: 64 })),
		instructions: opt(str({ maxLength: 4096, description: "How the user invokes it, plain language." })),
		configuredAt: DateTime,
		stepIds: arr(IdToken, { minItems: 1 }),
		reversible: bool(),
		note: opt(str({ maxLength: 4096 })),
	},
	{ description: "One configured alias/shortcut/wrapper/hotkey/voice entry point/context-menu action." },
);
export type ConfiguredAccessPoint = {
	id: string;
	templateId?: string;
	kind: AccessKind;
	location?: string;
	hotkey?: string;
	instructions?: string;
	configuredAt: string;
	stepIds: string[];
	reversible: boolean;
	note?: string;
};

/** Trust bookkeeping mirroring recipes: adaptations are retrieved, versioned, and validated too. */
export const AdaptationTrust = obj(
	{
		state: union([lit("candidate"), lit("testing"), lit("verified"), lit("degraded"), lit("quarantined")]),
		successfulRuns: int({ minimum: 0 }),
		failedRuns: int({ minimum: 0 }),
		lastValidatedAt: opt(DateTime),
		contentHash: Hash,
		revision: Semver,
	},
	{ description: "Trust state of an access adaptation revision." },
);
export type AdaptationTrust = {
	state: string;
	successfulRuns: number;
	failedRuns: number;
	lastValidatedAt?: string;
	contentHash: string;
	revision: string;
};

/** Human-facing help/change request handled by `gethelp <alias>`. */
export const HelpRequest = obj(
	{
		requestId: IdToken,
		installationAlias: str({ maxLength: 64 }),
		objective: str({ minLength: 1, maxLength: 4096, description: 'e.g. "open it with a hotkey instead of searching".' }),
		path: union([lit("deterministic-form"), lit("agent")]),
		candidateAdaptations: opt(arr(IdToken)),
		approvalNeeded: opt(ApprovalLevel),
	},
	{ description: "Explain or change how the application is accessed and used." },
);
export type HelpRequest = {
	requestId: string;
	installationAlias: string;
	objective: string;
	path: "deterministic-form" | "agent";
	candidateAdaptations?: string[];
	approvalNeeded?: ApprovalLevel;
};
