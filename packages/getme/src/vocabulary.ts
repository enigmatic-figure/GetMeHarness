// GetMe vocabulary: shared scalar types and identifiers used across every schema.
//
// Design rules (from the founder's vision):
// - The agent produces plans that conform to these schemas; the plan is data, never authority.
//   Every object is closed (additionalProperties: false) so an unexpected field is a validation error,
//   not silent acceptance of model-injected content.
// - Enums are open-ended by convention: new verbs/resources/phases are additive revisions.

import { str } from "@earendil-works/pi-schema";

/** RFC 3339 / ISO 8601 date-time, e.g. "2026-11-04T09:30:00Z". */
export const DateTime = str({ format: "date-time", description: "RFC 3339 date-time in UTC." });
export type DateTime = string;

/** A semantic version, e.g. "0.1.0". Used for schema and recipe revisions. */
export const Semver = str({
	pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$",
	description: "Semantic version of a schema, recipe, or component.",
});
export type Semver = string;

/**
 * A UUIDv4 identifying one installation. Aliases map to this durable identity; a friendly name is a way
 * to select an installation, never a sufficient basis for deciding what files or registry entries to delete.
 */
export const InstallationId = str({
	pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
	description: "UUIDv4 installation identity; aliases resolve to this, deletion decisions key off it.",
});
export type InstallationId = string;

/** One algorithm-prefixed digest. */
export const Hash = str({
	pattern: "^(?:sha-(?:256|384|512)|sha1|md5):[0-9a-fA-F]+$",
	description: 'One algorithm-prefixed digest, e.g. "sha256:ab3f...".',
});
export type Hash = string;

/** Digest algorithms recognized for artifact pinning. */
export const hashAlgorithms = ["sha256", "sha384", "sha512"] as const;
export type HashAlgorithm = (typeof hashAlgorithms)[number];

/**
 * A hash-pinned artifact locator. Recipes match on artifact version OR hash; a successful run on one
 * machine is evidence within that context, so the pinned locator is what makes a recipe reusable.
 */
export const ArtifactLocator = str({
	pattern: "^(https?|file|ftp):\\S+#(?:sha256|sha384|sha512):[0-9a-fA-F]{64,128}$",
	description:
		'URI with a mandatory fragment-integrity hash: "https://host/app.exe#sha256:<hex>". Plain URLs are rejected here; unpinned fetches require an explicit allowUnpinned action.',
});
export type ArtifactLocator = string;

/** A Windows security identifier (SID), e.g. "S-1-5-21-...-1001". */
export const Sid = str({ pattern: "^S-\\d+(?:-\\d+)+$", description: "Windows security identifier." });
export type Sid = string;

/** NT account name in down-level form, e.g. "CORP\\alice" or ".\\alice". */
export const AccountName = str({
	minLength: 1,
	maxLength: 320,
	description: 'NT account name, e.g. "CORP\\\\alice".',
});
export type AccountName = string;

/** A process id observed during execution. Attribution aid only — a PID alone is never attribution. */
export const ProcessId = str({
	pattern: "^\\d{1,10}$",
	description: "Decimal OS process id. Evidence, not attribution.",
});
export type ProcessId = string;

/** Base64-encoded binary payload (small values such as REG_BINARY before-state). */
export const Base64 = str({
	pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
	description: "Standard base64, no line breaks.",
});
export type Base64 = string;

/** Hex byte string (registry raw values, small binaries). */
export const HexBytes = str({ pattern: "^(?:[0-9a-fA-F]{2})*$", description: "Hex byte string." });
export type HexBytes = string;

/**
 * Canonical path grammars per resource kind. These encode the normalization contract: resource ids must
 * be written in normalized form so two observers converge on the same id.
 */
export const PathGrammars = {
	file: /^(?:[A-Za-z]:\\|\\\\[^\\]+\\)[^\0<>|?*]*$/,
	registry:
		/^HKEY_(?:CURRENT_USER|LOCAL_MACHINE|CLASSES_ROOT|USERS|PERFORMANCE_DATA|CURRENT_CONFIG)(?:\\[^\0]*)?$/,
	volume: /^[A-Za-z]:\\$/,
	envVar: /^[A-Za-z_][A-Za-z0-9_]*(?:\([Uu]ser|[Ss]ystem\))?$/,
};

/** Normalized absolute file path (drive-qualified or UNC); forward slashes are rejected. */
export const FilePath = str({
	pattern: PathGrammars.file.source,
	description: "Normalized absolute Windows path: drive-qualified or UNC, backslashes, no trailing slash.",
});
export type FilePath = string;

/** Normalized registry resource id: canonical hive prefix, backslash-separated. */
export const RegistryPath = str({
	pattern: PathGrammars.registry.source,
	description:
		"Normalized registry id: canonical HKEY_* hive, backslash separators, optional final \\value-name segment.",
});
export type RegistryPath = string;

/** Volume root, e.g. "C:\\". */
export const VolumeRoot = str({ pattern: PathGrammars.volume.source, description: "Volume root path." });
export type VolumeRoot = string;

/** Environment variable with scope selector, e.g. "Path(System)". */
export const EnvVarName = str({
	pattern: PathGrammars.envVar.source,
	description: 'Environment variable with scope suffix, e.g. "Path(System)".',
});
export type EnvVarName = string;

/** Service name (SCM internal name). */
export const ServiceName = str({
	minLength: 1,
	maxLength: 256,
	pattern: '^[^\\\\/:*?"<>|]+$',
	description: "Service Control Manager service name.",
});
export type ServiceName = string;

/** Scheduled task path, e.g. "\\Vendor\\Task Name". */
export const TaskPath = str({
	pattern: '^\\\\(?:[^\\\\/:*?"<>|]+\\\\)*[^\\\\/:*?"<>|]+$',
	description: "Task Scheduler task path rooted at \\.",
});
export type TaskPath = string;

/** Generic identifier token used for tags, option ids, integration ids. */
export const IdToken = str({
	pattern: "^[a-z0-9][a-z0-9._-]{0,63}$",
	description: "Lowercase identifier token.",
});
export type IdToken = string;

/** Alias chosen by the user for a managed installation (getgone/gethelp/getupdates selectors). */
export const Alias = str({
	pattern: "^[a-z0-9][a-z0-9._-]{0,63}$",
	description: "User-facing alias resolving to an installation id.",
});
export type Alias = string;
