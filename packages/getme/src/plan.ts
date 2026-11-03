// Execution plan: the contract between the agent and the local executor.
//
// Core policy from the vision: "The agent produces a plan that conforms to a defined JSON schema. The
// plan is data; the schema describes its allowed structure. The executor validates available actions,
// preconditions, privileges, dependencies, timeouts, verification, and recovery instructions before
// running it. Arbitrary text returned by a model must not acquire unrestricted administrative authority
// simply because it was serialized as JSON."
//
// Consequences encoded here:
// - Closed objects everywhere (no unknown fields).
// - A closed verb vocabulary + an explicit escape hatch (script.run) gated by approval level, bounded
//   resources, mandatory journaling, and no ambient elevation.
// - Every action declares privileges, expected effects, verification, compensation, and limits —
//   missing declarations fail executor validation rather than defaulting open.

import { arr, bool, int, lit, obj, opt, type Schema, str, union } from "@earendil-works/pi-schema";
import { EnvironmentBoundary } from "./environment.ts";
import { EnvironmentMatch } from "./machine.ts";
import { RegistryValueData, RegistryValueKind, ResourceId, SecurityDescriptor, ServiceConfig } from "./resources.ts";
import {
	Alias,
	ArtifactLocator,
	Base64,
	DateTime,
	FilePath,
	Hash,
	IdToken,
	InstallationId,
	Semver,
} from "./vocabulary.ts";

/** Schema family identity for the plan contract. Breaking changes bump major. */
export const PLAN_SCHEMA_ID = "https://getme.dev/schema/plan.json";
export const PLAN_SCHEMA_VERSION = "1.0.0";

/** Plan lifecycle phases referenced across the system. */
export const planPhases = ["resolve", "offer", "rehearse", "install", "configure", "receipt"] as const;
export type PlanPhase = (typeof planPhases)[number];
export const PlanPhase = union(
	planPhases.map((p) => lit(p)) as unknown as readonly Schema[],
	{ description: "One of the journey phases this plan covers." },
) as unknown as Schema<PlanPhase>;

/** Privilege classes an action may require. The executor maps these to OS tokens; nothing implies more. */
export const privilegeClasses = [
	"none",
	"userProfileWrite",
	"perUserRegistry",
	"machineWideRegistry",
	"programFilesWrite",
	"serviceControl",
	"taskScheduling",
	"elevation",
	"driverInstall",
	"kernelInteraction",
] as const;
export type PrivilegeClass = (typeof privilegeClasses)[number];
export const PrivilegeClass = union(
	privilegeClasses.map((p) => lit(p)) as unknown as readonly Schema[],
	{ description: "Privilege class required by an action; validated against real token capabilities." },
) as unknown as Schema<PrivilegeClass>;

/** Approval levels deciding when a human must decide. Routine steps inside an accepted plan proceed. */
export const approvalLevels = [
	"automatic", // covered by the accepted plan and user policy; no prompt
	"explain", // surfaced in the receipt/summary but not blocking
	"confirm", // blocking human decision before execution
	"forbidden", // executor refuses regardless of plan content
] as const;
export type ApprovalLevel = (typeof approvalLevels)[number];
export const ApprovalLevel = union(
	approvalLevels.map((a) => lit(a)) as unknown as readonly Schema[],
	{ description: "Human-decision gate for an action or effect." },
) as unknown as Schema<ApprovalLevel>;

/** Failure handling strategies for a step. */
export const onFailureModes = [
	"abort-plan",
	"abort-branch",
	"retry",
	"compensate",
	"continue-with-gap",
] as const;
export type OnFailure = (typeof onFailureModes)[number];
export const OnFailure = union(
	onFailureModes.map((m) => lit(m)) as unknown as readonly Schema[],
) as unknown as Schema<OnFailure>;

/** Retry policy bounding repeated attempts so host changes and inference costs stay controlled. */
export const RetryPolicy = obj(
	{
		maxAttempts: int({ minimum: 1, maximum: 10 }),
		backoffSeconds: opt(int({ minimum: 0, maximum: 3600 })),
		retryOn: opt(arr(IdToken)),
	},
	{ description: "Bounded retry policy; retries never exceed maxAttempts without escalation." },
);
export type RetryPolicy = { maxAttempts: number; backoffSeconds?: number; retryOn?: string[] };

/** Timeouts bound every action; the executor kills overruns and records the kill as evidence. */
export const TimeoutSpec = obj(
	{ seconds: int({ minimum: 1, maximum: 86_400 }) },
	{ description: "Wall-clock timeout for one action." },
);
export type TimeoutSpec = { seconds: number };

/** Resource limits for script.run and native-exec escapes. Enforced by the executor, not the script. */
export const ResourceLimits = obj(
	{
		maxOutputBytes: opt(int({ minimum: 0, maximum: 67_108_864 })),
		maxDiskBytes: opt(int({ minimum: 0 })),
		maxNetworkEgressBytes: opt(int({ minimum: 0 })),
		allowChildProcesses: opt(bool()),
		workingDirectory: opt(FilePath),
		envAllowlist: opt(arr(str({ maxLength: 256 }))),
	},
	{ description: "Budget for embedded scripts; absent fields take the tightest profile." },
);
export type ResourceLimits = {
	maxOutputBytes?: number;
	maxDiskBytes?: number;
	maxNetworkEgressBytes?: number;
	allowChildProcesses?: boolean;
	workingDirectory?: string;
	envAllowlist?: string[];
};

/** How an exit code signals success for process-style actions. */
export const ExitExpectation = obj(
	{
		successCodes: opt(arr(int(), { minItems: 1 })),
		notRequired: opt(bool()),
	},
	{
		description:
			"Success exit codes (default [0]). MSI-style installers legitimately return 3010 (success, reboot required); plans declare that explicitly instead of the executor guessing.",
	},
);
export type ExitExpectation = { successCodes?: number[]; notRequired?: boolean };

/** String map payload used for env vars and installer properties. */
export const StringMap = {
	type: "object",
	additionalProperties: { type: "string", maxLength: 4096 },
	maxProperties: 256,
} as unknown as Schema<Record<string, string>>;
export type StringMap = Record<string, string>;

// ---------------------------------------------------------------------------
// Verification and compensation
// ---------------------------------------------------------------------------

/** A check the executor runs after apply to prove the requested capability actually works. */
export const VerificationStep = obj(
	{
		id: IdToken,
		kind: union([
			lit("fileExists"),
			lit("registryValueEquals"),
			lit("serviceRunning"),
			lit("taskExists"),
			lit("commandExitZero"),
			lit("commandOutputMatches"),
			lit("launchesAndStaysUp"),
			lit("capabilityProbe"),
			lit("versionMatches"),
		]),
		target: opt(ResourceId),
		expect: opt(str({ maxLength: 4096 })),
		timeoutSeconds: opt(int({ minimum: 1, maximum: 600 })),
		required: opt(bool()),
	},
	{
		description:
			"Post-apply verification. 'A green process exit alone is not the acceptance test' — plans should carry at least one capability-level check.",
	},
);
export type VerificationStep = {
	id: string;
	kind: string;
	target?: string;
	expect?: string;
	timeoutSeconds?: number;
	required?: boolean;
};

/** Recovery behavior: how to undo (or compensate) a step's attributable effects. */
export const CompensationStep = obj(
	{
		id: IdToken,
		kind: union([
			lit("restoreBeforeState"),
			lit("deleteCreatedResource"),
			lit("runUninstallerString"),
			lit("reverseCommand"),
			lit("manualNote"),
			lit("rebootToComplete"),
		]),
		target: opt(ResourceId),
		instruction: opt(str({ maxLength: 8192 })),
		preconditions: opt(arr(str({ maxLength: 1024 }))),
		verification: opt(arr(VerificationStep)),
	},
	{
		description:
			"Recovery instruction stored with the step. restoreBeforeState relies on durable before-state captured pre-change; manualNote marks honestly unrecoverable steps.",
	},
);
export type CompensationStep = {
	id: string;
	kind: string;
	target?: string;
	instruction?: string;
	preconditions?: string[];
	verification?: VerificationStep[];
};

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

/** A precondition the executor checks against live machine state before running a step or plan. */
export const Precondition = obj(
	{
		kind: union([
			lit("environmentMatch"),
			lit("resourceAbsent"),
			lit("resourcePresent"),
			lit("freeSpaceMiB"),
			lit("privilegeAvailable"),
			lit("noPendingReboot"),
			lit("recipeStillValid"),
			lit("probeResult"),
		]),
		resource: opt(ResourceId),
		minimumMiB: opt(int({ minimum: 0 })),
		privilege: opt(PrivilegeClass),
		environment: opt(EnvironmentMatch),
		probe: opt(
			obj(
				{ id: IdToken, expect: str({ maxLength: 4096 }) },
				{ description: "Named bounded probe result check." },
			),
		),
		note: opt(str({ maxLength: 1024 })),
	},
	{
		description:
			"Checked pre-run. Unmet preconditions route back to discovery (or a recorded abort), never blind retries onto the host.",
	},
);
export type Precondition = {
	kind: string;
	resource?: string;
	minimumMiB?: number;
	privilege?: PrivilegeClass;
	environment?: EnvironmentMatch;
	probe?: { id: string; expect: string };
	note?: string;
};

// ---------------------------------------------------------------------------
// Expected effect declaration
// ---------------------------------------------------------------------------

/** What the plan says it will touch. Anything observed outside the declared envelope is a coverage event. */
export const EffectScope = obj(
	{
		kind: union([lit("resource"), lit("pathPrefix"), lit("registryBranch"), lit("envVar"), lit("processTree")]),
		pattern: str({ minLength: 1, maxLength: 4096 }),
		attribution: union([lit("declared"), lit("inferred"), lit("uncertain")], {
			description: "How strongly effects matching this scope attribute to this installation.",
		}),
		ownershipClaim: opt(bool()),
		note: opt(str({ maxLength: 1024 })),
	},
	{
		description:
			"Declared effect envelope. An application may claim its own registry branches (ownershipClaim) and GetMe still journals writes there; activity outside granted scopes gets observed and evaluated, never auto-authorized.",
	},
);
export type EffectScope = {
	kind: string;
	pattern: string;
	attribution: "declared" | "inferred" | "uncertain";
	ownershipClaim?: boolean;
	note?: string;
};

// ---------------------------------------------------------------------------
// Actions: the closed verb vocabulary
// ---------------------------------------------------------------------------

export const actionTypes = [
	"fetch.download",
	"archive.extract",
	"fs.copyFile",
	"fs.createDirectory",
	"fs.deleteFile",
	"fs.writeTextFile",
	"fs.setSecurity",
	"registry.setValue",
	"registry.deleteValue",
	"registry.createKey",
	"registry.deleteKey",
	"msi.install",
	"msi.mutate",
	"exe.silent",
	"package.winget",
	"package.scoop",
	"package.choco",
	"wsl.command",
	"wsl.distro.register",
	"wsl.distro.unregister",
	"wsl.instance.set",
	"oci.image.pull",
	"oci.container.run",
	"oci.compose.up",
	"oci.container.remove",
	"git.clone",
	"git.checkoutRef",
	"service.configure",
	"task.register",
	"env.setVariable",
	"env.addPathEntry",
	"shortcut.create",
	"assoc.register",
	"protocol.register",
	"cert.importTrustedPublisher",
	"feature.enable",
	"process.run",
	"script.run",
	"mark-of-web.clear",
	"policy.executionScoped",
	"reboot.request",
	"verify.run",
	"observe.snapshot",
	"probe.run",
	"wait.forCondition",
] as const;
export type ActionType = (typeof actionTypes)[number];
export const ActionType = union(
	actionTypes.map((t) => lit(t)) as unknown as readonly Schema[],
	{ description: "Executor-supported action verb. Unknown verbs fail validation." },
) as unknown as Schema<ActionType>;

// --- per-verb param schemas (each closed) ---

export const FetchDownloadParams = obj(
	{
		source: ArtifactLocator,
		destination: FilePath,
		allowUnpinned: opt(bool()),
		unpinnedSource: opt(str({ pattern: "^https?:\\S+$", maxLength: 4096 })),
		ifExists: opt(union([lit("fail"), lit("overwrite"), lit("reuse-if-hash-matches")])),
	},
	{ description: "Download a hash-pinned artifact (allowUnpinned=true requires confirm approval)." },
);
export type FetchDownloadParams = {
	source: string;
	destination: string;
	allowUnpinned?: boolean;
	unpinnedSource?: string;
	ifExists?: string;
};

export const ArchiveExtractParams = obj(
	{
		archive: FilePath,
		format: union([lit("zip"), lit("cab"), lit("sevenz"), lit("tar"), lit("gz"), lit("bz2"), lit("xz")]),
		destination: FilePath,
		entries: opt(arr(str({ maxLength: 1024 }))),
		stripComponents: opt(int({ minimum: 0, maximum: 16 })),
	},
	{ description: "Extract entries from an archive into destination." },
);
export type ArchiveExtractParams = {
	archive: string;
	format: string;
	destination: string;
	entries?: string[];
	stripComponents?: number;
};

export const FsCopyFileParams = obj(
	{ source: FilePath, destination: FilePath, overwrite: opt(bool()) },
	{ description: "Copy one file." },
);
export type FsCopyFileParams = { source: string; destination: string; overwrite?: boolean };

export const FsCreateDirectoryParams = obj(
	{ path: FilePath, parents: opt(bool()) },
	{ description: "Create a directory (parents=true behaves mkdir -p)." },
);
export type FsCreateDirectoryParams = { path: string; parents?: boolean };

export const FsDeleteFileParams = obj(
	{ path: FilePath, mustExist: opt(bool()) },
	{ description: "Delete one file. Never recursive; tree ownership belongs to removal reconciliation." },
);
export type FsDeleteFileParams = { path: string; mustExist?: boolean };

export const FsWriteTextFileParams = obj(
	{
		path: FilePath,
		contents: str({ maxLength: 1_048_576 }),
		encoding: opt(union([lit("utf8"), lit("utf16le"), lit("ansi")])),
		createParents: opt(bool()),
	},
	{ description: "Write a small text file (config stubs, wrapper scripts)." },
);
export type FsWriteTextFileParams = { path: string; contents: string; encoding?: string; createParents?: boolean };

export const FsSetSecurityParams = obj(
	{ target: ResourceId, security: SecurityDescriptor },
	{ description: "Apply normalized security metadata to a file/dir/registry key." },
);
export type FsSetSecurityParams = { target: string; security: SecurityDescriptor };

export const RegistrySetValueParams = obj(
	{ key: ResourceId, name: str({ maxLength: 16384 }), kind: RegistryValueKind, data: RegistryValueData },
	{ description: "Set one registry value. Key ids use canonical HKEY_* form." },
);
export type RegistrySetValueParams = { key: string; name: string; kind: RegistryValueKind; data: RegistryValueData };

export const RegistryDeleteValueParams = obj(
	{ key: ResourceId, name: str({ maxLength: 16384 }) },
	{ description: "Delete one registry value." },
);
export type RegistryDeleteValueParams = { key: string; name: string };

export const RegistryCreateKeyParams = obj(
	{ key: ResourceId },
	{ description: "Create one key (no values)." },
);
export type RegistryCreateKeyParams = { key: string };

export const RegistryDeleteKeyParams = obj(
	{
		key: ResourceId,
		recurse: opt(bool()),
		onlyIfContentsMatch: opt(arr(str({ maxLength: 4096 }))),
	},
	{
		description:
			"Delete a key. recurse=true REQUIRES onlyIfContentsMatch (the current child list must equal the declared set) — deleting an entire branch without checking contents cannot be the general algorithm.",
	},
);
export type RegistryDeleteKeyParams = { key: string; recurse?: boolean; onlyIfContentsMatch?: string[] };

export const MsiInstallParams = obj(
	{
		package: FilePath,
		properties: opt(StringMap),
		logPath: opt(FilePath),
		deferredUntilReboot: opt(bool()),
		exit: opt(ExitExpectation),
	},
	{ description: "Windows Installer install with declared public properties and logging." },
);
export type MsiInstallParams = {
	package: string;
	properties?: Record<string, string>;
	logPath?: string;
	deferredUntilReboot?: boolean;
	exit?: ExitExpectation;
};

export const MsiMutateParams = obj(
	{
		mode: union([lit("patch"), lit("modify"), lit("uninstall-product-code")]),
		target: str({ minLength: 8, maxLength: 256, description: "Patch .msp path or product code GUID." }),
		properties: opt(StringMap),
		exit: opt(ExitExpectation),
	},
	{ description: "MSI patch/modify/uninstall by product code." },
);
export type MsiMutateParams = { mode: string; target: string; properties?: Record<string, string>; exit?: ExitExpectation };

export const ExeSilentParams = obj(
	{
		program: FilePath,
		args: opt(arr(str({ maxLength: 4096 }))),
		silentSwitchesEvidence: opt(
			str({ maxLength: 4096, description: "Where the silent switches were verified (recipe field, rehearsal run id)." }),
		),
		cwd: opt(FilePath),
		env: opt(StringMap),
		exit: opt(ExitExpectation),
	},
	{ description: "Run an installer executable non-interactively with declared switches." },
);
export type ExeSilentParams = {
	program: string;
	args?: string[];
	silentSwitchesEvidence?: string;
	cwd?: string;
	env?: Record<string, string>;
	exit?: ExitExpectation;
};

export const PackageWingetParams = obj(
	{
		query: str({ maxLength: 512 }),
		id: opt(str({ maxLength: 256 })),
		version: opt(str({ maxLength: 64 })),
		scope: opt(union([lit("user"), lit("machine")])),
		source: opt(str({ maxLength: 256 })),
		extraArgs: opt(arr(str({ maxLength: 1024 }))),
		exit: opt(ExitExpectation),
	},
	{ description: "winget install; id+version pin what lands." },
);
export type PackageWingetParams = {
	query: string;
	id?: string;
	version?: string;
	scope?: string;
	source?: string;
	extraArgs?: string[];
	exit?: ExitExpectation;
};

export const PackageScoopParams = obj(
	{
		bucket: opt(str({ maxLength: 128 })),
		manifest: str({ maxLength: 256 }),
		global: opt(bool()),
		extraArgs: opt(arr(str({ maxLength: 1024 }))),
	},
	{ description: "scoop install via PowerShell." },
);
export type PackageScoopParams = { bucket?: string; manifest: string; global?: boolean; extraArgs?: string[] };

export const PackageChocoParams = obj(
	{
		packageId: str({ maxLength: 256 }),
		version: opt(str({ maxLength: 64 })),
		extraArgs: opt(arr(str({ maxLength: 1024 }))),
	},
	{ description: "choco install." },
);
export type PackageChocoParams = { packageId: string; version?: string; extraArgs?: string[] };

export const WslCommandParams = obj(
	{
		distro: opt(str({ maxLength: 64 })),
		command: str({ minLength: 1, maxLength: 8192 }),
		user: opt(str({ maxLength: 128 })),
		exit: opt(ExitExpectation),
	},
	{ description: "Run a command inside WSL; effects there are recorded as wsl-scoped resources." },
);
export type WslCommandParams = { distro?: string; command: string; user?: string; exit?: ExitExpectation };

export const WslDistroRegisterParams = obj(
	{
		distro: str({ maxLength: 128 }),
		instanceName: str({ maxLength: 64 }),
		rootfsArtifact: opt(ArtifactLocator),
		location: opt(FilePath),
		version: opt(union([lit("1"), lit("2")])),
		defaultUser: opt(str({ maxLength: 128 })),
		setDefaultDistro: opt(bool()),
		configFileContent: opt(str({ maxLength: 16_384, description: ".wslconfig contents (memory/cpu limits, mirrored networking, autoMemoryReclaim)." })),
		exit: opt(ExitExpectation),
	},
	{
		description:
			'Register a WSL distro: store install (`wsl --install -d`), tarball import (`wsl --import` with pinned rootfs), or empty. The distro is a boundary resource (wsl:<name>) — getgone tears it down when ownership is exclusive.',
	},
);
export type WslDistroRegisterParams = {
	distro: string;
	instanceName: string;
	rootfsArtifact?: string;
	location?: string;
	version?: string;
	defaultUser?: string;
	setDefaultDistro?: boolean;
	configFileContent?: string;
	exit?: ExitExpectation;
};

export const WslDistroUnregisterParams = obj(
	{
		instanceName: str({ maxLength: 64 }),
		keepData: opt(bool()),
		onMissing: opt(union([lit("ignore"), lit("fail")])),
	},
	{ description: "`wsl --unregister`. Destructive to guest state — confirm-level unless declared by an exclusive-boundary removal plan." },
);
export type WslDistroUnregisterParams = { instanceName: string; keepData?: boolean; onMissing?: string };

export const WslInstanceSetParams = obj(
	{
		instanceName: opt(str({ maxLength: 64 })),
		setDefaultVersion: opt(union([lit("1"), lit("2")])),
		setDefaultDistro: opt(str({ maxLength: 64 })),
		shutdown: opt(bool()),
	},
	{ description: "`wsl --set-default-version`, `wsl -s`, `wsl --shutdown`." },
);
export type WslInstanceSetParams = { instanceName?: string; setDefaultVersion?: string; setDefaultDistro?: string; shutdown?: boolean };

export const OciImagePullParams = obj(
	{
		runtime: union([lit("docker-engine"), lit("docker-desktop"), lit("podman"), lit("containerd"), lit("nerdctl")]),
		image: str({ minLength: 1, maxLength: 1024 }),
		digest: opt(Hash),
		platform: opt(str({ pattern: "^linux/(?:amd64|arm64)(?:/v\d+)?$", maxLength: 64 })),
		registryHost: opt(str({ maxLength: 256 })),
		exit: opt(ExitExpectation),
	},
	{ description: "Pull an OCI image; digest pin required for verified recipes (latest-only pulls carry drift warnings)." },
);
export type OciImagePullParams = { runtime: string; image: string; digest?: string; platform?: string; registryHost?: string; exit?: ExitExpectation };

export const OciContainerRunParams = obj(
	{
		runtime: union([lit("docker-engine"), lit("docker-desktop"), lit("podman"), lit("containerd"), lit("nerdctl")]),
		image: str({ minLength: 1, maxLength: 1024 }),
		digest: opt(Hash),
		containerName: str({ maxLength: 256 }),
		args: opt(arr(str({ maxLength: 4096 }))),
		volumes: opt(arr(str({ maxLength: 512 }))),
		ports: opt(arr(str({ pattern: "^(?:(?:[\d.]+:)?\d+-?\d*/(?:tcp|udp))$", maxLength: 64 }))),
		environment: opt(StringMap),
		networkMode: opt(union([lit("bridge"), lit("host"), lit("none"), str({ maxLength: 64 })])),
		gpu: opt(bool()),
		restartPolicy: opt(union([lit("no"), lit("always"), lit("on-failure"), lit("unless-stopped")])),
		capAdd: opt(arr(str({ maxLength: 64 }))),
		securityOptNoNewPrivileges: opt(bool()),
		exit: opt(ExitExpectation),
	},
	{
		description:
			"Start a long-lived container as the installation form. Claims recorded: image@digest (oci:), named volumes (vol:), port bindings, guest services. Removal = stop + rm + volume reconciliation at the boundary.",
	},
);
export type OciContainerRunParams = {
	runtime: string;
	image: string;
	digest?: string;
	containerName: string;
	args?: string[];
	volumes?: string[];
	ports?: string[];
	environment?: Record<string, string>;
	networkMode?: string;
	gpu?: boolean;
	restartPolicy?: string;
	capAdd?: string[];
	securityOptNoNewPrivileges?: boolean;
	exit?: ExitExpectation;
};

export const OciComposeUpParams = obj(
	{
		runtime: union([lit("docker-engine"), lit("docker-desktop"), lit("podman")]),
		composeFile: FilePath,
		composeFileHash: opt(Hash),
		projectName: str({ maxLength: 256 }),
		services: opt(arr(str({ maxLength: 256 }))),
		profiles: opt(arr(str({ maxLength: 64 }))),
		pullPolicy: opt(union([lit("always"), lit("missing")])),
		exit: opt(ExitExpectation),
	},
	{ description: "`compose up -d` against a hashed compose file; every service becomes a boundary-scoped managed component." },
);
export type OciComposeUpParams = {
	runtime: string;
	composeFile: string;
	composeFileHash?: string;
	projectName: string;
	services?: string[];
	profiles?: string[];
	pullPolicy?: string;
	exit?: ExitExpectation;
};

export const OciContainerRemoveParams = obj(
	{
		runtime: union([lit("docker-engine"), lit("docker-desktop"), lit("podman"), lit("containerd"), lit("nerdctl")]),
		containerName: str({ maxLength: 256 }),
		removeVolumes: opt(bool()),
		removeImage: opt(bool()),
		onMissing: opt(union([lit("ignore"), lit("fail")])),
	},
	{ description: "Stop/remove a managed container; used by removal plans, never silently during install." },
);
export type OciContainerRemoveParams = { runtime: string; containerName: string; removeVolumes?: boolean; removeImage?: boolean; onMissing?: string };

export const GitCloneParams = obj(
	{
		repository: str({ pattern: "^(?:https?://\S+|git@\S+|file:\S+)$", maxLength: 2048 }),
		destination: FilePath,
		ref: opt(str({ maxLength: 256, description: "Tag, branch, or commit sha; tags/sha preferred for reproducibility." })),
		depth: opt(int({ minimum: 1, maximum: 1000 })),
		submodules: opt(bool()),
		exit: opt(ExitExpectation),
	},
	{ description: "Clone a repository as the artifact-acquisition step of the git-checkout-source-build path." },
);
export type GitCloneParams = { repository: string; destination: string; ref?: string; depth?: number; submodules?: boolean; exit?: ExitExpectation };

export const GitCheckoutRefParams = obj(
	{
		workingDirectory: FilePath,
		ref: str({ minLength: 1, maxLength: 256 }),
		verifySignature: opt(bool()),
		recordResolvedCommit: opt(bool()),
	},
	{ description: "Pin an existing checkout to a ref; resolved commit sha goes into the record as the effective hash pin." },
);
export type GitCheckoutRefParams = { workingDirectory: string; ref: string; verifySignature?: boolean; recordResolvedCommit?: boolean };

export const ServiceConfigureParams = obj(
	{
		config: ServiceConfig,
		desiredState: opt(union([lit("running"), lit("stopped"), lit("unchanged")])),
	},
	{ description: "Create/configure a service. Secrets use passwordRef handles elsewhere, never inline." },
);
export type ServiceConfigureParams = { config: ServiceConfig; desiredState?: string };

/** Task Scheduler paths are rooted at "\\" and use the same forbidden characters as file names. */
export const TaskSchedulerPath = str({
	pattern: '^\\\\(?:[^\\\\/:*?"<>|]+\\\\)*[^\\\\/:*?"<>|]+$',
	maxLength: 512,
	description: 'Task path rooted at "\\\\Folder\\Name".',
});

export const TaskRegisterParams = obj(
	{
		path: TaskSchedulerPath,
		definitionXml: str({ minLength: 1, maxLength: 262_144 }),
		userId: opt(str({ maxLength: 256 })),
		passwordRef: opt(IdToken),
		force: opt(bool()),
	},
	{ description: "Register a scheduled task from XML (the lossless form)." },
);
export type TaskRegisterParams = {
	path: string;
	definitionXml: string;
	userId?: string;
	passwordRef?: string;
	force?: boolean;
};

export const EnvSetVariableParams = obj(
	{
		name: str({ pattern: "^[A-Za-z_][A-Za-z0-9_]*$", maxLength: 256 }),
		value: str({ maxLength: 32_767 }),
		scope: union([lit("user"), lit("system")]),
	},
	{ description: "Set an environment variable in one scope." },
);
export type EnvSetVariableParams = { name: string; value: string; scope: "user" | "system" };

export const EnvAddPathEntryParams = obj(
	{
		directory: FilePath,
		scope: union([lit("user"), lit("system")]),
		position: opt(union([lit("append"), lit("prepend")])),
	},
	{ description: "Add one directory to PATH in one scope; removal deletes exactly this entry." },
);
export type EnvAddPathEntryParams = { directory: string; scope: "user" | "system"; position?: string };

export const ShortcutCreateParams = obj(
	{
		linkPath: FilePath,
		target: FilePath,
		arguments: opt(str({ maxLength: 4096 })),
		workingDirectory: opt(FilePath),
		iconLocation: opt(str({ maxLength: 1024 })),
		hotkey: opt(
			str({
				pattern: "^(?:(?:ctrl|alt|shift)(?:\\+(?:ctrl|alt|shift))*\\+[a-zA-Z0-9]|[a-vA-V])$",
				maxLength: 64,
			}),
		),
		location: opt(union([lit("desktop"), lit("startMenu"), lit("taskbar"), lit("custom")])),
	},
	{ description: "Create a .lnk access point; hotkey/location feed the configure phase." },
);
export type ShortcutCreateParams = {
	linkPath: string;
	target: string;
	arguments?: string;
	workingDirectory?: string;
	iconLocation?: string;
	hotkey?: string;
	location?: string;
};

export const AssocRegisterParams = obj(
	{
		extension: str({ pattern: "^\\.[A-Za-z0-9]{1,10}$" }),
		progId: str({ maxLength: 256 }),
		command: opt(FilePath),
		applicationName: opt(str({ maxLength: 256 })),
		mimeType: opt(str({ pattern: "^[a-zA-Z0-9.!#$&^_-]+/[a-zA-Z0-9.![a-zA-Z0-9+_-]+$", maxLength: 256 })),
	},
	{ description: "Register a file association under HKCU (HKLM requires elevation approval)." },
);
export type AssocRegisterParams = { extension: string; progId: string; command?: string; applicationName?: string; mimeType?: string };

export const ProtocolRegisterParams = obj(
	{
		scheme: str({ pattern: "^[a-zA-Z][a-zA-Z0-9+.\\-]{1,63}$" }),
		handler: FilePath,
		arguments: opt(str({ maxLength: 4096 })),
	},
	{ description: "Register a URL protocol handler." },
);
export type ProtocolRegisterParams = { scheme: string; handler: string; arguments?: string };

export const CertImportParams = obj(
	{
		store: union([lit("Root"), lit("CA"), lit("Trust"), lit("AuthRoot"), lit("My"), lit("Other")]),
		location: union([lit("CurrentUser"), lit("LocalMachine")]),
		certificate: Base64,
		thumbprint: Hash,
		trustReason: str({ minLength: 1, maxLength: 4096 }),
	},
	{ description: "Import a certificate; trust-store imports are always confirm-level with a stated reason." },
);
export type CertImportParams = { store: string; location: string; certificate: string; thumbprint: string; trustReason: string };

export const FeatureEnableParams = obj(
	{ feature: str({ maxLength: 256 }), includeSubFeatures: opt(bool()), source: opt(str({ maxLength: 1024 })) },
	{ description: "Enable a Windows feature (DISM-backed)." },
);
export type FeatureEnableParams = { feature: string; includeSubFeatures?: boolean; source?: string };

export const ProcessRunParams = obj(
	{
		program: FilePath,
		args: opt(arr(str({ maxLength: 4096 }))),
		cwd: opt(FilePath),
		env: opt(StringMap),
		exit: opt(ExitExpectation),
		stdoutCapture: opt(bool()),
	},
	{ description: "Run a program as part of the plan (post-install init, cache warm-up...)." },
);
export type ProcessRunParams = {
	program: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	exit?: ExitExpectation;
	stdoutCapture?: boolean;
};

export const ScriptRunParams = obj(
	{
		language: union([lit("powershell"), lit("cmd"), lit("batch"), lit("bash-wsl"), lit("sh-container")]),
		body: str({ minLength: 1, maxLength: 262_144 }),
		filePath: opt(FilePath),
		limits: opt(ResourceLimits),
		exit: opt(ExitExpectation),
		journalAllEffects: lit(true),
		noAmbientElevation: lit(true),
	},
	{
		description:
			"The escape hatch. Always confirm-level unless fully covered by a rehearsed recipe; effects journaled like any action; elevated tokens never inherited implicitly; body copied verbatim into the record for review.",
	},
);
export type ScriptRunParams = {
	language: string;
	body: string;
	filePath?: string;
	limits?: ResourceLimits;
	exit?: ExitExpectation;
	journalAllEffects: true;
	noAmbientElevation: true;
};

export const MarkOfWebClearParams = obj(
	{ target: FilePath, justification: str({ minLength: 1, maxLength: 4096 }) },
	{
		description:
			"Unblock a trusted downloaded file (remove Zone.Identifier). Scoped, explained, authorized within the plan, and recorded — never blanket AV exclusions or global policy changes.",
	},
);
export type MarkOfWebClearParams = { target: string; justification: string };

export const PolicyExecutionScopedParams = obj(
	{
		area: union([
			lit("execution-policy"),
			lit("applocker-scope"),
			lit("defender-exclusion-temporary"),
			lit("firewall-rule"),
		]),
		setting: str({ maxLength: 1024 }),
		value: str({ maxLength: 4096 }),
		scopePaths: arr(FilePath, { minItems: 1 }),
		durationSeconds: int({ minimum: 1, maximum: 86_400 }),
		justification: str({ minLength: 1, maxLength: 4096 }),
		revertInstruction: str({ minLength: 1, maxLength: 8192 }),
	},
	{
		description:
			"A temporary, scoped policy change with mandatory revert. Blanket antivirus exclusions / disabling security tools / weakening global execution policy are not representable here — scopePaths and duration are required.",
	},
);
export type PolicyExecutionScopedParams = {
	area: string;
	setting: string;
	value: string;
	scopePaths: string[];
	durationSeconds: number;
	justification: string;
	revertInstruction: string;
};

export const RebootRequestParams = obj(
	{ reason: str({ minLength: 1, maxLength: 4096 }), deferrable: opt(bool()) },
	{ description: "Mark pending-reboot completion; never force-reboots without a confirm gate." },
);
export type RebootRequestParams = { reason: string; deferrable?: boolean };

export const VerifyRunParams = obj(
	{ checks: arr(VerificationStep, { minItems: 1 }) },
	{ description: "Explicit verification step inside a plan (also implied per-step)." },
);
export type VerifyRunParams = { checks: VerificationStep[] };

export const ObserveSnapshotParams = obj(
	{ resources: arr(ResourceId, { minItems: 1 }), purpose: union([lit("before"), lit("after"), lit("baseline")]) },
	{ description: "Capture resource states into the record at a named point." },
);
export type ObserveSnapshotParams = { resources: string[]; purpose: string };

export const ProbeRunParams = obj(
	{
		id: IdToken,
		question: str({ minLength: 1, maxLength: 4096, description: 'What to learn, e.g. "GPU VRAM".' }),
		budgetSeconds: opt(int({ minimum: 1, maximum: 120 })),
	},
	{ description: "Bounded machine probe; results feed preconditions and the agent as evidence." },
);
export type ProbeRunParams = { id: string; question: string; budgetSeconds?: number };

export const WaitParams = obj(
	{ condition: str({ minLength: 1, maxLength: 4096 }), maxSeconds: int({ minimum: 1, maximum: 3600 }) },
	{ description: "Wait for a declarative condition (service running, file appears...) up to a bound." },
);
export type WaitParams = { condition: string; maxSeconds: number };

/** Action params, selected by `type`. Dispatch happens in the executor's verb table. */
export const ActionParams = union(
	[
		FetchDownloadParams,
		ArchiveExtractParams,
		FsCopyFileParams,
		FsCreateDirectoryParams,
		FsDeleteFileParams,
		FsWriteTextFileParams,
		FsSetSecurityParams,
		RegistrySetValueParams,
		RegistryDeleteValueParams,
		RegistryCreateKeyParams,
		RegistryDeleteKeyParams,
		MsiInstallParams,
		MsiMutateParams,
		ExeSilentParams,
		PackageWingetParams,
		PackageScoopParams,
		PackageChocoParams,
		WslCommandParams,
		WslDistroRegisterParams,
		WslDistroUnregisterParams,
		WslInstanceSetParams,
		OciImagePullParams,
		OciContainerRunParams,
		OciComposeUpParams,
		OciContainerRemoveParams,
		GitCloneParams,
		GitCheckoutRefParams,
		ServiceConfigureParams,
		TaskRegisterParams,
		EnvSetVariableParams,
		EnvAddPathEntryParams,
		ShortcutCreateParams,
		AssocRegisterParams,
		ProtocolRegisterParams,
		CertImportParams,
		FeatureEnableParams,
		ProcessRunParams,
		ScriptRunParams,
		MarkOfWebClearParams,
		PolicyExecutionScopedParams,
		RebootRequestParams,
		VerifyRunParams,
		ObserveSnapshotParams,
		ProbeRunParams,
		WaitParams,
	] as readonly Schema[],
	{
		description:
			"Action params. The executor validates the payload against the verb-specific schema; a well-formed JSON document with an unsupported shape fails closed.",
	},
);

// ---------------------------------------------------------------------------
// Steps and the plan
// ---------------------------------------------------------------------------

/** One planned operation. */
export const PlanStep = obj(
	{
		id: IdToken,
		type: ActionType,
		params: ActionParams,
		purpose: str({
			minLength: 1,
			maxLength: 1024,
			description: "Plain-language why, surfaced in receipts and approvals.",
		}),
		privileges: arr(PrivilegeClass, { minItems: 1 }),
		approval: ApprovalLevel,
		dependsOn: opt(arr(IdToken)),
		preconditions: opt(arr(Precondition)),
		expectedEffects: opt(arr(EffectScope)),
		compensation: opt(arr(CompensationStep)),
		verification: opt(arr(VerificationStep)),
		timeout: TimeoutSpec,
		retry: opt(RetryPolicy),
		onFailure: OnFailure,
		boundaryRef: opt(
			IdToken,
			{ description: "Environment this step runs in (windows-host steps omit it). Must exist in InstallationPlan.environments." },
		),
		tags: opt(arr(IdToken)),
	},
	{
		description:
			"A single planned operation. Executor validation rejects: unknown verbs, missing privileges/approval/timeout, script bodies without limits+journaling, delete-key recursion without contents match, policy changes without scope/duration/revert.",
	},
);
export type PlanStep = {
	id: string;
	type: ActionType;
	params: unknown;
	purpose: string;
	privileges: PrivilegeClass[];
	approval: ApprovalLevel;
	dependsOn?: string[];
	preconditions?: Precondition[];
	expectedEffects?: EffectScope[];
	compensation?: CompensationStep[];
	verification?: VerificationStep[];
	timeout: TimeoutSpec;
	retry?: RetryPolicy;
	onFailure: OnFailure;
	boundaryRef?: string;
	tags?: string[];
};

/** Provenance of the artifacts a plan consumes. */
export const ArtifactProvenance = obj(
	{
		locator: ArtifactLocator,
		version: opt(str({ maxLength: 64 })),
		publisher: opt(str({ maxLength: 256 })),
		signatureStatus: opt(
			union([lit("valid"), lit("unsigned"), lit("invalid"), lit("unchecked"), lit("chain-untrusted")]),
		),
		signerSubject: opt(str({ maxLength: 1024 })),
		markOfWeb: opt(bool()),
		sourceChannel: opt(
			union([lit("publisher"), lit("winget"), lit("scoop"), lit("choco"), lit("github-release"), lit("other")]),
		),
	},
	{ description: "Artifact identity + integrity facts carried into the record." },
);
export type ArtifactProvenance = {
	locator: string;
	version?: string;
	publisher?: string;
	signatureStatus?: string;
	signerSubject?: string;
	markOfWeb?: boolean;
	sourceChannel?: string;
};

/** Recipe reference when the plan came from retrieval rather than discovery. */
export const RecipeReference = obj(
	{
		recipeId: IdToken,
		revision: Semver,
		contentHash: Hash,
		matchBasis: arr(
			union([lit("artifact-hash"), lit("version"), lit("method"), lit("features"), lit("environment")]),
			{ minItems: 1 },
		),
	},
	{ description: "Which recipe revision produced this plan, and on what basis it matched." },
);
export type RecipeReference = { recipeId: string; revision: string; contentHash: string; matchBasis: string[] };

/** The full plan document the agent emits and the executor validates. */
export const InstallationPlan = obj(
	{
		schema: lit(PLAN_SCHEMA_ID),
		schemaVersion: Semver,
		planId: str({ minLength: 8, maxLength: 64 }),
		installationId: InstallationId,
		alias: Alias,
		phase: PlanPhase,
		createdAt: DateTime,
		createdBy: union([lit("recipe"), lit("agent"), lit("human"), lit("developer-manifest")]),
		intent: str({ minLength: 1, maxLength: 4096, description: "The user's request as understood, plain language." }),
		target: obj(
			{
				name: str({ maxLength: 256 }),
				publisher: opt(str({ maxLength: 256 })),
				version: opt(str({ maxLength: 64 })),
				features: opt(arr(IdToken)),
			},
			{ description: "Resolved software target." },
		),
		environment: EnvironmentMatch,
		recipe: opt(RecipeReference),
		environments: opt(
			arr(EnvironmentBoundary, {
				minItems: 1,
				description:
					"Boundaries this plan creates or targets (WSL distros, containers, sandboxes). Steps reference them via boundaryRef; host-side provisioning steps (feature.enable, wsl.distro.register) must precede any step bound to a this-plan boundary.",
			}),
		),
		artifacts: opt(arr(ArtifactProvenance)),
		steps: arr(PlanStep, { minItems: 1 }),
		globalPreconditions: opt(arr(Precondition)),
		rollbackStrategy: union([
			lit("per-step-compensation"),
			lit("journal-replay"),
			lit("vendor-uninstaller-then-reconcile"),
			lit("none-declared"),
		]),
		coverageDeclaration: str({
			minLength: 1,
			maxLength: 8192,
			description: "What this plan does NOT observe/guarantee. Required — gaps are explicit.",
		}),
		consent: obj(
			{
				acceptedAt: opt(DateTime),
				acceptedBy: opt(str({ maxLength: 320 })),
				acceptedDigest: opt(Hash),
				scopeSummary: str({ maxLength: 8192, description: "The plain-language summary the user approved." }),
			},
			{ description: "Consent binding: digest of the exact plan bytes the user approved." },
		),
	},
	{
		description:
			"GetMe installation plan v1. Data, not authority: the executor re-validates privileges against real token capabilities, re-checks preconditions on the live machine, and enforces approval gates before any step runs.",
	},
);
export type InstallationPlan = {
	schema: string;
	schemaVersion: string;
	planId: string;
	installationId: string;
	alias: string;
	phase: PlanPhase;
	createdAt: string;
	createdBy: "recipe" | "agent" | "human" | "developer-manifest";
	intent: string;
	target: { name: string; publisher?: string; version?: string; features?: string[] };
	environment: EnvironmentMatch;
	recipe?: RecipeReference;
	environments?: EnvironmentBoundary[];
	artifacts?: ArtifactProvenance[];
	steps: PlanStep[];
	globalPreconditions?: Precondition[];
	rollbackStrategy: string;
	coverageDeclaration: string;
	consent: { acceptedAt?: string; acceptedBy?: string; acceptedDigest?: string; scopeSummary: string };
};
