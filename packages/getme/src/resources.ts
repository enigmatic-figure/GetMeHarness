// Resource model: the nouns of the system. Every effect a plan can have, every change a record can
// attribute, and every surface lifecycle monitoring observes is addressed as a ResourceId over one of
// these kinds.
//
// Attribution rule from the vision: a PID or a registry-path prefix alone is insufficient attribution
// when work is delegated to a system broker or shared service — so resource ids are content-addressed
// (normalized strings), and evidence links them to operations separately.

import { arr, bool, int, lit, obj, opt, type Schema, str, union } from "@earendil-works/pi-schema";
import {
	AccountName,
	Base64,
	DateTime,
	FilePath,
	HexBytes,
	IdToken,
	ProcessId,
	ServiceName,
	Sid,
} from "./vocabulary.ts";

/** The supported resource kinds. Additive revisions may add kinds; removing one is breaking. */
export const resourceKinds = [
	"file",
	"directory",
	"registryKey",
	"registryValue",
	"service",
	"scheduledTask",
	"environmentVariable",
	"pathEntry",
	"shortcut",
	"fileAssociation",
	"certificateStoreEntry",
	"comRegistration",
	"windowsFeature",
	"protocolHandler",
	"contextMenuHandler",
	"startupEntry",
	"firewallRule",
	"groupMembership",
	"printerPort",
	"deviceInterface",
] as const;
export type ResourceKind = (typeof resourceKinds)[number];
export const ResourceKind = union(
	resourceKinds.map((k) => lit(k)) as unknown as readonly Schema[],
	{ description: `One of: ${resourceKinds.join(", ")}.` },
) as unknown as Schema<ResourceKind>;

/**
 * A canonical, normalized resource identifier. Format per kind (normalization contract):
 *   file / directory            C:\App\bin\tool.exe          (drive-qualified or UNC, no trailing slash)
 *   registryKey                 HKEY_LOCAL_MACHINE\SOFTWARE\Foo
 *   registryValue               HKEY_LOCAL_MACHINE\SOFTWARE\Foo\Bar  (final segment = value name)
 *   service                     svc:Spooler
 *   scheduledTask               task:\\Vendor\Task Name
 *   environmentVariable         env:Path(System)
 *   pathEntry                   path:C:\Program Files\Foo\bin(System)
 *   shortcut                    lnk:C:\Users\A\Desktop\App.lnk
 *   fileAssociation             assoc:.foo
 *   certificateStoreEntry       cert:LocalMachine\Root\<thumbprint>
 *   comRegistration             clsid:{GUID}
 *   windowsFeature              feature:IIS-WebServerrole
 *   protocolHandler             proto:getme
 *   contextMenuHandler          shellx:HKEY_CLASSES_ROOT\*\shell\Foo
 *   startupEntry                run:HKLM\...\Run\App
 *   firewallRule                fw:<rule name or display name>
 *   groupMembership             grp:S-1-5-32-544\S-1-5-21-...-1001
 *   printerPort                 port:9100_1
 *   deviceInterface             devint:{GUID}\\<instance id>
 */
export const ResourceId = str({
	minLength: 1,
	maxLength: 32767,
	description:
		"Canonical normalized resource id. Kind-prefixed for non-path kinds (svc:, task:, env:, path:, lnk:, assoc:, cert:, clsid:, feature:, proto:, shellx:, run:, fw:, grp:, port:, devint:); plain paths/registry ids for file/directory/registryKey/registryValue.",
});
export type ResourceId = string;

/** Registry value types (REG_*). */
export const registryValueKinds = [
	"REG_NONE",
	"REG_SZ",
	"REG_EXPAND_SZ",
	"REG_BINARY",
	"REG_DWORD",
	"REG_MULTI_SZ",
	"REG_QWORD",
] as const;
export type RegistryValueKind = (typeof registryValueKinds)[number];
export const RegistryValueKind = union(
	registryValueKinds.map((k) => lit(k)) as unknown as readonly Schema[],
	{ description: "Registry value type." },
) as unknown as Schema<RegistryValueKind>;

/** A typed registry value payload used in before/after state snapshots. */
export const RegistryValueData = obj(
	{
		string: opt(str()),
		strings: opt(arr(str())),
		bytes: opt(HexBytes),
		dword: opt(str({ pattern: "^(?:0|[1-9]\\d*|0x[0-9a-fA-F]+)$" })),
		qword: opt(str({ pattern: "^(?:0|[1-9]\\d*|0x[0-9a-fA-F]+)$" })),
	},
	{ description: "Typed registry value data; exactly one field set, matching the declared kind." },
);
export type RegistryValueData = {
	string?: string;
	strings?: string[];
	bytes?: string;
	dword?: string;
	qword?: string;
};

/** Access control entries relevant to files and registry keys. */
export const AceEntry = obj(
	{
		sid: Sid,
		account: opt(AccountName),
		type: union([lit("allow"), lit("deny"), lit("audit")]),
		flags: opt(arr(IdToken)),
		rights: arr(IdToken, {
			minItems: 1,
			description: 'Normalized right names, e.g. ["generic_read","generic_write"].',
		}),
		objectType: opt(str({ description: "GUID for object ACEs." })),
	},
	{ description: "One access control entry, normalized to sid + rights." },
);
export type AceEntry = {
	sid: string;
	account?: string;
	type: "allow" | "deny" | "audit";
	flags?: string[];
	rights: string[];
	objectType?: string;
};

/** Security metadata attached to observed resources where available. */
export const SecurityDescriptor = obj(
	{
		owner: opt(Sid),
		group: opt(Sid),
		dacl: opt(arr(AceEntry)),
		sddl: opt(str({ description: "Raw SDDL form retained as secondary evidence." })),
	},
	{ description: "Security metadata snapshot for a resource." },
);
export type SecurityDescriptor = { owner?: string; group?: string; dacl?: AceEntry[]; sddl?: string };

/** Digest map: algorithm -> hex digest. */
export const DigestMap = {
	type: "object",
	additionalProperties: str({ pattern: "^[0-9a-fA-F]+$", minLength: 8 }),
} as unknown as Schema<Record<string, string>>;
export type DigestMap = Record<string, string>;

/** Service configuration snapshot (used inside ResourceState and service actions). */
export const ServiceConfig = obj(
	{
		name: ServiceName,
		displayName: opt(str({ maxLength: 256 })),
		status: opt(
			union([lit("stopped"), lit("running"), lit("paused"), lit("start_pending"), lit("stop_pending")]),
		),
		startType: opt(union([lit("auto"), lit("manual"), lit("disabled"), lit("boot"), lit("system")])),
		binaryPath: opt(FilePath),
		startName: opt(str({ maxLength: 256, description: "Logon account, e.g. LocalSystem." })),
		imagePathHashRef: opt(IdToken),
		dependencies: opt(arr(str({ maxLength: 256 }))),
	},
	{ description: "Service configuration snapshot." },
);
export type ServiceConfig = {
	name: string;
	displayName?: string;
	status?: "stopped" | "running" | "paused" | "start_pending" | "stop_pending";
	startType?: "auto" | "manual" | "disabled" | "boot" | "system";
	binaryPath?: string;
	startName?: string;
	imagePathHashRef?: string;
	dependencies?: string[];
};

/**
 * State snapshot of one resource at one instant. Used for before/after deltas and recipe expectations.
 * Absent fields mean "not captured" — coverage gaps are explicit, never silently complete.
 */
export const ResourceState = obj(
	{
		kind: ResourceKind,
		id: ResourceId,
		exists: opt(bool()),
		sizeBytes: opt(int({ minimum: 0 })),
		modifiedAt: opt(DateTime),
		hashes: opt(DigestMap),
		attributes: opt(arr(IdToken)),
		security: opt(SecurityDescriptor),
		registryKind: opt(RegistryValueKind),
		value: opt(RegistryValueData),
		serviceConfig: opt(ServiceConfig),
		taskDefinition: opt(str({ maxLength: 1_048_576, description: "Task Scheduler XML definition." })),
		envValue: opt(str({ maxLength: 32_767 })),
		pathDirs: opt(arr(str({ maxLength: 4096 }))),
		content: opt(Base64),
		raw: opt(str({ description: "Kind-specific raw capture, JSON-encoded, for kinds without structured fields yet." })),
	},
	{
		description:
			"Snapshot of one resource. Only fields applicable to the kind are expected; missing capture is a coverage gap the record must declare.",
	},
);
export type ResourceState = {
	kind: ResourceKind;
	id: string;
	exists?: boolean;
	sizeBytes?: number;
	modifiedAt?: string;
	hashes?: Record<string, string>;
	attributes?: string[];
	security?: SecurityDescriptor;
	registryKind?: RegistryValueKind;
	value?: RegistryValueData;
	serviceConfig?: ServiceConfig;
	taskDefinition?: string;
	envValue?: string;
	pathDirs?: string[];
	content?: string;
	raw?: string;
};

/** Process ancestry evidence linking an effect to an operation. Delegation-aware: the chain, not one PID. */
export const ProcessAncestry = obj(
	{
		pid: ProcessId,
		imagePath: opt(FilePath),
		commandLine: opt(str({ maxLength: 32768 })),
		parentPid: opt(ProcessId),
		initiatingAccount: opt(AccountName),
		initiatingSid: opt(Sid),
		executingAccount: opt(AccountName),
		executingSid: opt(Sid),
		delegatedVia: opt(arr(IdToken)),
		recordedAt: DateTime,
	},
	{
		description:
			"One node of process ancestry. Distinguishes the executing actor (e.g. a system broker) from the initiating party; delegation chains are recorded, not flattened.",
	},
);
export type ProcessAncestry = {
	pid: string;
	imagePath?: string;
	commandLine?: string;
	parentPid?: string;
	initiatingAccount?: string;
	initiatingSid?: string;
	executingAccount?: string;
	executingSid?: string;
	delegatedVia?: string[];
	recordedAt: string;
};
