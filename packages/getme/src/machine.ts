// Machine profile: the minimal local facts used to match recipes and plans to a machine.
//
// Privacy rule from the vision: collect a minimal local machine profile at onboarding (OS version,
// architecture, CPU, RAM) plus task-specific probes only when needed (GPU/VRAM for a GPU app, free
// disk, WSL availability). Never a comprehensive personal inventory "because it is accessible".

import { arr, bool, int, lit, obj, opt, type Schema, str, union } from "@earendil-works/pi-schema";
import { AccountName, DateTime, FilePath, IdToken, Semver, Sid } from "./vocabulary.ts";

/** Operating-system families GetMe targets; Windows first, others reserved by the larger vision. */
export const osFamilies = ["windows", "linux", "macos", "wsl"] as const;
export type OsFamily = (typeof osFamilies)[number];
export const OsFamily = union(
	osFamilies.map((f) => lit(f)) as unknown as readonly Schema[],
	{ description: "Operating-system family." },
) as unknown as Schema<OsFamily>;

/** CPU architecture values used in environment matching. */
export const architectures = ["x64", "arm64", "x86", "neutral"] as const;
export type Architecture = (typeof architectures)[number];
export const Architecture = union(
	architectures.map((a) => lit(a)) as unknown as readonly Schema[],
	{ description: 'Instruction-set architecture; "neutral" matches any.' },
) as unknown as Schema<Architecture>;

/** A GPU device fact (requested only for GPU-dependent installs). */
export const GpuInfo = obj(
	{
		vendor: union([lit("nvidia"), lit("amd"), lit("intel"), lit("other"), str({ maxLength: 128 })]),
		model: opt(str({ maxLength: 256 })),
		vramMiB: opt(int({ minimum: 0 })),
		driverVersion: opt(Semver),
	},
	{ description: "GPU facts; collected only when a task needs them." },
);
export type GpuInfo = { vendor: string; model?: string; vramMiB?: number; driverVersion?: string };

/** Volume/storage fact. */
export const VolumeInfo = obj(
	{
		root: str({ pattern: "^[A-Za-z]:\\\\$", description: 'Volume root, e.g. "C:\\\\".' }),
		fileSystem: opt(
			union([lit("ntfs"), lit("refs"), lit("exfat"), lit("fat32"), str({ maxLength: 32 })]),
		),
		totalBytes: opt(int({ minimum: 0 })),
		freeBytes: opt(int({ minimum: 0 })),
		removable: opt(bool()),
		compressed: opt(bool()),
		encrypted: opt(bool()),
	},
	{ description: "One volume's basic facts." },
);
export type VolumeInfo = {
	root: string;
	fileSystem?: string;
	totalBytes?: number;
	freeBytes?: number;
	removable?: boolean;
	compressed?: boolean;
	encrypted?: boolean;
};

/** Installed-runtime / package-manager facts discovered by bounded probes. */
export const RuntimeFact = obj(
	{
		id: IdToken,
		name: str({ maxLength: 256 }),
		version: opt(str({ maxLength: 64 })),
		location: opt(FilePath),
		source: opt(union([lit("probe"), lit("user"), lit("recipe")])),
	},
	{
		description:
			"A discovered runtime or manager (VC++ redist, .NET, Python, winget, scoop, choco...).",
	},
);
export type RuntimeFact = { id: string; name: string; version?: string; location?: string; source?: string };

/** The minimal onboarding profile. Everything beyond these fields arrives via task-scoped probes. */
export const MachineProfile = obj(
	{
		profileId: str({ minLength: 8, maxLength: 64, description: "Local random id for this profile revision." }),
		capturedAt: DateTime,
		os: obj(
			{
				family: OsFamily,
				caption: opt(str({ maxLength: 256 })),
				version: opt(str({ maxLength: 64, description: 'e.g. "10.0.26100".' })),
				build: opt(int({ minimum: 0 })),
				edition: opt(str({ maxLength: 64 })),
				architecture: Architecture,
				languageTag: opt(str({ pattern: "^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$" })),
				uacEnabled: opt(bool()),
			},
			{ description: "OS basics collected at onboarding." },
		),
		cpu: obj(
			{
				vendor: opt(str({ maxLength: 128 })),
				model: opt(str({ maxLength: 256 })),
				physicalCores: opt(int({ minimum: 0 })),
				logicalProcessors: opt(int({ minimum: 0 })),
			},
			{ description: "CPU basics collected at onboarding." },
		),
		memory: obj(
			{ totalMiB: opt(int({ minimum: 0 })), freeMiB: opt(int({ minimum: 0 })) },
			{ description: "RAM basics collected at onboarding." },
		),
		volumes: opt(arr(VolumeInfo)),
		gpus: opt(arr(GpuInfo)),
		runtimes: opt(arr(RuntimeFact)),
		virtualization: opt(
			obj(
				{
					wslInstalled: opt(bool()),
					wslDefaultDistro: opt(str({ maxLength: 64 })),
					hyperVisorPresent: opt(bool()),
					windowsSandboxAvailable: opt(bool()),
					containersAvailable: opt(bool()),
				},
				{ description: "Isolation/rehearsal backend facts (probed when rehearsal is planned)." },
			),
		),
		network: opt(
			obj(
				{ behindProxy: opt(bool()), offline: opt(bool()) },
				{ description: "Coarse network posture; no endpoints or identities." },
			),
		),
		user: obj(
			{ account: AccountName, sid: Sid, homeDirectory: FilePath },
			{ description: "The single user context GetMe acts within." },
		),
		redactionApplied: opt(bool()),
	},
	{
		description:
			"Minimal local machine profile. The field set is deliberately narrow; adding a field requires justifying it against the onboarding privacy rule.",
	},
);
export type MachineProfile = {
	profileId: string;
	capturedAt: string;
	os: {
		family: OsFamily;
		caption?: string;
		version?: string;
		build?: number;
		edition?: string;
		architecture: Architecture;
		languageTag?: string;
		uacEnabled?: boolean;
	};
	cpu: { vendor?: string; model?: string; physicalCores?: number; logicalProcessors?: number };
	memory: { totalMiB?: number; freeMiB?: number };
	volumes?: VolumeInfo[];
	gpus?: GpuInfo[];
	runtimes?: RuntimeFact[];
	virtualization?: {
		wslInstalled?: boolean;
		wslDefaultDistro?: string;
		hyperVisorPresent?: boolean;
		windowsSandboxAvailable?: boolean;
		containersAvailable?: boolean;
	};
	network?: { behindProxy?: boolean; offline?: boolean };
	user: { account: string; sid: string; homeDirectory: string };
	redactionApplied?: boolean;
};

/**
 * Environment declaration used by recipes and plans to state what they match. All constraints are
 * ANDed; absent fields are unconstrained. A successful run is evidence within this declared context.
 */
export const EnvironmentMatch = obj(
	{
		osFamilies: opt(arr(OsFamily, { minItems: 1 })),
		architectures: opt(arr(Architecture, { minItems: 1 })),
		minWindowsBuild: opt(int({ minimum: 0 })),
		maxWindowsBuild: opt(int({ minimum: 0 })),
		memory: opt(obj({ minTotalMiB: opt(int({ minimum: 0 })) }, { description: "Memory floor." })),
		disk: opt(
			obj(
				{
					minFreeMiB: opt(int({ minimum: 0 })),
					targetVolume: opt(str({ pattern: "^[A-Za-z]:\\\\$" })),
				},
				{ description: "Disk floor and placement preference." },
			),
		),
		gpu: opt(
			obj(
				{
					required: opt(bool()),
					minVramMiB: opt(int({ minimum: 0 })),
					vendors: opt(arr(IdToken)),
				},
				{ description: "GPU requirement for GPU-dependent software." },
			),
		),
		requires: opt(
			arr(
				obj(
					{
						runtime: IdToken,
						minVersion: opt(str({ maxLength: 64 })),
						maxVersion: opt(str({ maxLength: 64 })),
						optional: opt(bool()),
					},
					{ description: "Runtime/package-manager dependency with optional bounds." },
				),
				{ minItems: 1 },
			),
		),
		wsl: opt(
			obj(
				{ required: opt(bool()), distros: opt(arr(str({ maxLength: 64 }))) },
				{ description: "WSL constraint." },
			),
		),
		tags: opt(arr(IdToken)),
	},
	{
		description:
			"Declared environment a recipe/plan matches. Matching is conservative: an unmet declared constraint sends the run back to discovery rather than proceeding.",
	},
);
export type EnvironmentMatch = {
	osFamilies?: OsFamily[];
	architectures?: Architecture[];
	minWindowsBuild?: number;
	maxWindowsBuild?: number;
	memory?: { minTotalMiB?: number };
	disk?: { minFreeMiB?: number; targetVolume?: string };
	gpu?: { required?: boolean; minVramMiB?: number; vendors?: string[] };
	requires?: { runtime: string; minVersion?: string; maxVersion?: string; optional?: boolean }[];
	wsl?: { required?: boolean; distros?: string[] };
	tags?: string[];
};
