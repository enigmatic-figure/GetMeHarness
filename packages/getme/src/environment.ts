// Execution environment: where a plan step physically runs, and how it is reached.
//
// Vision anchor: "no matter how that install needs to take place." A step's target is not always the
// Windows host — it may be a WSL2 distro (possibly one GetMe must provision first), a container on a
// Docker/Podman engine, or a nested manager environment (conda env, rustup toolchain, git worktree).
// This module defines:
//   - executionTargets: the closed vocabulary of environments;
//   - EnvironmentBoundary: the identity + integrity facts of one concrete environment instance, so
//     effects inside it are journaled as guest resources, never misattributed as host effects;
//   - ManagerSpec / ToolchainSpec: the enumeration of installation paths (package managers, language
//     ecosystems, runtimes, build systems) with discovery, bootstrap, pinning, and exit-code semantics;
//   - PathClass + InstallationPathCatalog: the machine-readable catalog the router consults to answer
//     "which paths could install this software on this machine, in what order should they be tried."
//
// Preference encoded here as DATA (not code): uv is the default Python path on Windows hosts unless a
// recipe pins an alternative; every default is overridable per user policy, per machine, per request.

import { arr, bool, int, lit, obj, opt, type Schema, str, union } from "@earendil-works/pi-schema";
import { Architecture, OsFamily } from "./machine.ts";
import { PrivilegeClass } from "./plan.ts";
import { ResourceId } from "./resources.ts";
import { ArtifactLocator, DateTime, Hash, IdToken, Semver } from "./vocabulary.ts";

export const ENVIRONMENT_SCHEMA_ID = "https://getme.dev/schema/environment.json";
export const ENVIRONMENT_SCHEMA_VERSION = "1.0.0";

/** Digest algorithms recognized for artifact pinning. */
export const hashAlgorithms = ["sha256", "sha384", "sha512"] as const;
export type HashAlgorithm = (typeof hashAlgorithms)[number];

// ---------------------------------------------------------------------------
// Execution targets
// ---------------------------------------------------------------------------

/** Where steps physically execute. The executor resolves each id to a concrete runner. */
export const executionTargets = [
	"windows-host", // direct on the host OS (default)
	"wsl-distro", // inside a registered WSL2 distro (host-side setup itself runs on windows-host)
	"container", // inside a container on a reachable OCI runtime engine
	"windows-sandbox", // ephemeral hypervisor-backed Windows (rehearsal-oriented; state does not persist)
] as const;
export type ExecutionTarget = (typeof executionTargets)[number];
export const ExecutionTarget = union(
	executionTargets.map((t) => lit(t)) as unknown as readonly Schema[],
	{ description: "Execution locus of a plan step or an entire environment boundary." },
) as unknown as Schema<ExecutionTarget>;

/** How GetMe reaches an environment. */
export const accessMethods = [
	"wsl-exec", // wsl.exe -d <distro> -- ...
	"docker-exec", // docker exec / compose exec against a managed container
	"podman-exec",
	"direct", // in-process/native on the locus itself
	"powershell-remoting", // reserved for remote hosts (vision keeps multi-machine open)
] as const;
export type AccessMethod = (typeof accessMethods)[number];
export const AccessMethod = union(
	accessMethods.map((m) => lit(m)) as unknown as readonly Schema[],
) as unknown as Schema<AccessMethod>;

/** Linux distributions usable as WSL instances (additive list; `other` keeps it open). */
export const wslDistributions = [
	"Ubuntu",
	"Debian",
	"openSUSE-Tumbleweed",
	"FedoraLinux",
	"AlmaLinux",
	"RockyLinux",
	"SUSE-Linux-Enterprise",
	"kali-linux",
	"custom-rootfs", // import-from tarball (ArtifactLocator-pinned)
	"other",
] as const;
export type WslDistribution = (typeof wslDistributions)[number];
export const WslDistribution = union(
	[...wslDistributions.map((d) => lit(d)), str({ maxLength: 128 })] as unknown as readonly Schema[],
	{ description: 'WSL distro name as registered with `wsl -l -v`; "other"/free string for store distros.' },
) as unknown as Schema<WslDistribution>;

/** OCI container engines GetMe can drive on Windows. */
export const containerRuntimes = ["docker-engine", "docker-desktop", "podman", "containerd", "nerdctl", "other"] as const;
export type ContainerRuntime = (typeof containerRuntimes)[number];
export const ContainerRuntime = union(
	[...containerRuntimes.map((r) => lit(r)), str({ maxLength: 64 })] as unknown as readonly Schema[],
) as unknown as Schema<ContainerRuntime>;

/**
 * One concrete execution environment instance. Steps declare their boundary by id; the record carries
 * these facts so guest effects attribute correctly and removal reconciles at the boundary rather than
 * pretending guest state was host state.
 */
export const EnvironmentBoundary = obj(
	{
		boundaryId: IdToken,
		target: ExecutionTarget,
		provisionedBy: union([lit("pre-existing"), lit("this-plan"), lit("user-handoff")], {
			description:
				'"this-plan" means GetMe bootstrapped the environment (e.g. enabled WSL2, imported a distro); ' +
				'"user-handoff" means a human must do a step GetMe will not automate silently (BIOS/firmware ' +
				"virtualization toggle, Microsoft Store tap, license acceptance).",
		}),
		wsl: opt(
			obj(
				{
					distro: WslDistribution,
					instanceName: str({ maxLength: 64, description: "Registered name, e.g. Ubuntu-24.04 or getme-comfyui." }),
					wslVersion: opt(union([lit("1"), lit("2")])),
					rootfsArtifact: opt(ArtifactLocator),
					location: opt(ResourceId),
					defaultUser: opt(str({ maxLength: 128 })),
					hostAddressingMode: opt(union([lit("mirrored"), lit("nat"), lit("none")])),
					systemdEnabled: opt(bool()),
					gpuPassthrough: opt(bool()),
					mounts9P: opt(arr(str({ maxLength: 512 }))),
				},
				{ description: "WSL-specific identity." },
			),
		),
		container: opt(
			obj(
				{
					runtime: ContainerRuntime,
					image: str({ maxLength: 1024 }),
					imageDigest: opt(Hash),
					composeProject: opt(str({ maxLength: 256 })),
					serviceName: opt(str({ maxLength: 256 })),
					volumes: opt(arr(str({ maxLength: 512 }))),
					networkMode: opt(union([lit("bridge"), lit("host"), lit("none"), str({ maxLength: 64 })])),
					capAdd: opt(arr(str({ maxLength: 64 }))),
					gpu: opt(bool()),
					lifecycle: opt(union([lit("long-lived"), lit("ephemeral-per-session")])),
				},
				{ description: "Container-specific identity; digest pins what actually ran." },
			),
		),
		sandbox: opt(
			obj(
				{ configResource: opt(ResourceId), persistence: lit("none") },
				{
					description:
						"Windows Sandbox: nothing installed there survives logoff. Legitimate for rehearsal only; a real-install plan targeting sandbox MUST declare why in coverageDeclaration.",
				},
			),
		),
		access: AccessMethod,
		ownership: union([lit("exclusive-to-installation"), lit("shared-environment")], {
			description:
				"Exclusive boundaries get torn down by getgone (unregister distro / rm image+volume). Shared ones (the user's everyday Ubuntu, a running Docker engine) are reconciled package-by-package instead.",
		}),
		createdAt: opt(DateTime),
		notes: opt(str({ maxLength: 4096 })),
	},
	{
		description:
			"A concrete environment a plan runs against, with its provisioning history and teardown ownership.",
	},
);
export type EnvironmentBoundary = {
	boundaryId: string;
	target: ExecutionTarget;
	provisionedBy: string;
	wsl?: {
		distro: string;
		instanceName: string;
		wslVersion?: string;
		rootfsArtifact?: string;
		location?: string;
		defaultUser?: string;
		hostAddressingMode?: string;
		systemdEnabled?: boolean;
		gpuPassthrough?: boolean;
		mounts9P?: string[];
	};
	container?: {
		runtime: string;
		image: string;
		imageDigest?: string;
		composeProject?: string;
		serviceName?: string;
		volumes?: string[];
		networkMode?: string;
		capAdd?: string[];
		gpu?: boolean;
		lifecycle?: string;
	};
	sandbox?: { configResource?: string; persistence: "none" };
	access: AccessMethod;
	ownership: string;
	createdAt?: string;
	notes?: string;
};

// ---------------------------------------------------------------------------
// Managers: the independent installation systems
// ---------------------------------------------------------------------------

/** The families of installation machinery GetMe enumerates paths across. */
export const managerFamilies = [
	"os-package-manager", // winget, scoop, choco, apt, dnf, pacman, zypper, apk, brew (Linux/macOS)
	"language-package-manager", // pip, uv, poetry, conda/mamba, npm, pnpm, yarn, bun, cargo, gem, go, nuget, mix
	"runtime-distribution-manager", // pyenv, rustup, sdkman, nvm-windows/volta/fnm, rubyinstaller, aqt
	"build-system", // cmake, ninja, meson, bazel/bazelisk, make, msbuild, gradle, scons
	"compiler-toolchain", // visual-cpp/build-tools, llvm+mlir, mingw-w64, gcc/clang-in-wsl, maven
	"gui-framework-runtime", // qt (maintenance tool/aqt/PySide6 incl. QtQuick/QML), wxwidgets, electron/cef/tauri/wails
	"native-app-installer", // msi, exe-silent, burn bundles, clickonce, appx/msix, 7z self-extractor, portable-zip
	"git-vcs", // clone + checkout pinned ref + optional source build
	"container-image", // docker/podman pull+run, compose stacks
	"script-bootstrap", // official curl|sh-style bootstrap scripts, VSIX, powershell gallery modules
	"store-channel", // microsoft store (winget --source msstore), marketplace channels
	"self-update-mechanism", // update engines/launchers — handled as observed delegation, not trusted automation
] as const;
export type ManagerFamily = (typeof managerFamilies)[number];
export const ManagerFamily = union(
	managerFamilies.map((f) => lit(f)) as unknown as readonly Schema[],
) as unknown as Schema<ManagerFamily>;

/** What kind of thing a manager installs. */
export const managedEntityKinds = [
	"application",
	"cli-tool",
	"library",
	"framework",
	"runtime",
	"sdk",
	"toolchain",
	"extension-plugin",
	"service-appliance", // a workload delivered as a running service/container (e.g. a DB in a container)
	"environment", // the manager provisions whole environments (wsl-bootstrap, docker-engine, uv venv)
] as const;
export type ManagedEntityKind = (typeof managedEntityKinds)[number];
export const ManagedEntityKind = union(
	managedEntityKinds.map((k) => lit(k)) as unknown as readonly Schema[],
) as unknown as Schema<ManagedEntityKind>;

/** How the manager itself gets present on the machine when missing. */
export const bootstrapModes = [
	"none-required", // ships with the OS / already assumed present
	"self", // one-liner it runs itself (uv installer, rustup-init, scoop, choco, brew)
	"os-manager", // installable through winget/scoop/choco/apt (cmake, ninja, bazelisk...)
	"offline-artifact", // pinned MSI/exe/tarball fetched by fetch.download then executed
	"manual-download", // license/terms gate (Docker Desktop EULA) — user-handoff territory
	"developer-supplied", // .getme manifest in the target repo names the path explicitly
] as const;
export type BootstrapMode = (typeof bootstrapModes)[number];
export const BootstrapMode = union(
	bootstrapModes.map((b) => lit(b)) as unknown as readonly Schema[],
) as unknown as Schema<BootstrapMode>;

/** Pinning granularity — how exactly a version is nailed down per manager. */
export const pinningLevels = [
	"digest", // content hash (fetch.download, oci image digest)
	"exact-version", // --version / @== / manifest revision
	"channel", // release/lts/stable bucket (rustup, node channel, casks)
	"latest-only", // no reliable pin exists — highest drift risk, flagged in provenance
] as const;
export type PinningLevel = (typeof pinningLevels)[number];
export const PinningLevel = union(
	pinningLevels.map((p) => lit(p)) as unknown as readonly Schema[],
) as unknown as Schema<PinningLevel>;

/** Normalized success semantics for a manager invocation beyond exit 0. */
export const ExitSemantics = obj(
	{
		successCodes: opt(arr(int(), { minItems: 1 })),
		rebootRequiredCode: opt(int()),
		alreadyInstalledCodes: opt(arr(int())),
		nonzeroStderrMeansFailure: opt(bool()),
	},
	{
		description:
			"Per-manager exit behavior: MSI 3010 = reboot required; winget -1978335181 = no applicable upgrade; dpkg lock contention retries. Plans carry this instead of the executor guessing.",
	},
);
export type ExitSemantics = {
	successCodes?: number[];
	rebootRequiredCode?: number;
	alreadyInstalledCodes?: number[];
	nonzeroStderrMeansFailure?: boolean;
};

/** A declared installation system: discovery, bootstrap, pinning, scope, and effect envelope. */
export const ManagerSpec = obj(
	{
		id: IdToken,
		family: ManagerFamily,
		name: str({ maxLength: 256 }),
		entityKinds: arr(ManagedEntityKind, { minItems: 1 }),
		targets: arr(ExecutionTarget, { minItems: 1 }),
		osFamilies: opt(arr(OsFamily, { minItems: 1 })),
		architectures: opt(arr(Architecture, { minItems: 1 })),
		discovery: obj(
			{
				command: str({ maxLength: 4096 }),
				versionRegex: opt(str({ maxLength: 512 })),
				probeTimeoutSeconds: opt(int({ minimum: 1, maximum: 120 })),
			},
			{ description: "Bounded probe proving presence + version, e.g. `uv --version`, `winget -v`, `wsl -l -v`." },
		),
		bootstrap: obj(
			{
				mode: BootstrapMode,
				recipeRef: opt(str({ maxLength: 256, description: '"<recipeId>@<revision>" of the manager-bootstrap recipe.' })),
				artifact: opt(ArtifactLocator),
				privileges: arr(PrivilegeClass, { minItems: 1 }),
			},
			{ description: "How GetMe makes the manager exist when the probe fails." },
		),
		pinning: obj(
			{
				level: PinningLevel,
				versionFlag: opt(str({ maxLength: 256, description: 'e.g. "--version", "==", "@", ":"' })),
				sourceFlag: opt(str({ maxLength: 256 })),
				hashSupport: opt(bool()),
			},
			{ description: "How versions get nailed; latest-only paths carry drift warnings into the record." },
		),
		scopeOptions: opt(
			arr(
				union([
					lit("per-user"),
					lit("machine-wide"),
					lit("venv"),
					lit("conda-env"),
					lit("project-local"),
					lit("global-prefix"),
					lit("guest-environment"),
					lit("container-layer"),
				]),
				{ minItems: 1 },
			),
			{ description: "Install scopes this manager supports; drives EffectScope patterns and removal reconciliation." },
		),
		exitSemantics: opt(ExitSemantics),
		effectEnvelope: opt(
			arr(
				obj(
					{
						kind: union([lit("pathPrefix"), lit("registryBranch"), lit("envVar"), lit("guestPath"), lit("boundaryScoped")]),
						pattern: str({ minLength: 1, maxLength: 4096 }),
					},
					{ description: "Typical footprint: %LOCALAPPDATA%\\Programs\\..., HKCU\\Software\\Classes\\..., wslfile:<distro>/opt/..." },
				),
				{ minItems: 1 },
			),
			{ description: "Expected effect shapes for plans using this manager — seeds EffectScope declarations." },
		),
		delegatesTo: opt(
			arr(IdToken, {
				description:
					"Managers this one shells out to (winget→msiexec, choco→MSI engine, scoop→7z/git, poetry→pip under the hood). Delegation chains recorded; attribution follows the chain, not the broker PID.",
			}),
		),
		trustNotes: opt(str({ maxLength: 4096 })),
	},
	{
		description:
			"One installation system described as data. catalog-data.ts instantiates these for every route GetMe recognizes.",
	},
);
export type ManagerSpec = {
	id: string;
	family: ManagerFamily;
	name: string;
	entityKinds: ManagedEntityKind[];
	targets: ExecutionTarget[];
	osFamilies?: string[];
	architectures?: string[];
	discovery: { command: string; versionRegex?: string; probeTimeoutSeconds?: number };
	bootstrap: { mode: string; recipeRef?: string; artifact?: string; privileges: PrivilegeClass[] };
	pinning: { level: string; versionFlag?: string; sourceFlag?: string; hashSupport?: boolean };
	scopeOptions?: string[];
	exitSemantics?: ExitSemantics;
	effectEnvelope?: { kind: string; pattern: string }[];
	delegatesTo?: string[];
	trustNotes?: string;
};

// ---------------------------------------------------------------------------
// Toolchains: named cross-cutting prerequisites (VC++ redist, .NET, Qt, ...)
// ---------------------------------------------------------------------------

/** A prerequisite distribution with its known acquisition paths, ranked by preference. */
export const ToolchainSpec = obj(
	{
		id: IdToken,
		name: str({ maxLength: 256 }),
		entityKind: ManagedEntityKind,
		variants: opt(
			arr(
				obj(
					{
						variant: IdToken,
						channels: arr(
							obj(
								{
									manager: IdToken,
									coordinate: str({ maxLength: 512, description: 'Package id within that manager, e.g. "Microsoft.VCRedist.2015.x64.base".' }),
									priority: int({ minimum: 0, maximum: 100 }),
									note: opt(str({ maxLength: 1024 })),
								},
								{ description: "One way to obtain this variant." },
							),
							{ minItems: 1 },
						),
					},
					{ description: "Architecture/edition variant (x64 vs arm64, base vs debug)." },
				),
			),
		),
		consumers: opt(
			arr(IdToken, {
				description: "Software classes that need this toolchain (pip wheel builds, QtQuick apps, .NET FDDs...).",
			}),
		),
		conflictsWith: opt(arr(IdToken)),
		notes: opt(str({ maxLength: 4096 })),
	},
	{
		description:
			"Named prerequisite whose absence breaks many installs (missing-runtime diagnosis is half the problem GetMe solves). Channels are ranked; retrieval picks the best-ranked available one.",
	},
);
export type ToolchainSpec = {
	id: string;
	name: string;
	entityKind: ManagedEntityKind;
	variants?: { variant: string; channels: { manager: string; coordinate: string; priority: number; note?: string }[] }[];
	consumers?: string[];
	conflictsWith?: string[];
	notes?: string;
};

// ---------------------------------------------------------------------------
// Path classes and the catalog
// ---------------------------------------------------------------------------

/** Coarse classes of installation routes, used for offer presentation, rehearsal strategy, and metrics. */
export const pathClasses = [
	"native-msi", // Windows Installer packages (incl. patches via msi.mutate)
	"native-exe-bundle", // vendor executables: NSIS, WiX burn, InnoSetup, Squirrel, ClickOnce
	"native-portable", // zip/7z/exe self-extractor dropped into a managed prefix + PATH/shim
	"os-manager-native", // winget / scoop / choco driving native installers under contract
	"store-packaged", // MSIX/AppX/MSIXBundle, Microsoft Store, winget msstore source
	"python-isolated", // uv-managed interpreter + project venv (DEFAULT python path); conda/mamba variants
	"node-global-or-project", // npm/pnpm/yarn/bun global prefix or project-local node_modules
	"rust-toolchain-crate", // rustup toolchain + cargo install / cargo-binstall binaries
	"java-runtime-jar-sdk", // JDK distributions (Temurin/Corretto/Zulu/Microsoft via winget; sdkman in WSL) + jar/gradle/maven apps
	"dotnet-runtime-selfcontained", // .NET SDK/runtime + framework-dependent or self-contained apps
	"cpp-build-toolchain", // Visual Studio Build Tools, CMake/Ninja/Meson, LLVM/MLIR, MinGW-w64, Strawberry Perl
	"gui-framework", // Qt (maintenance tool/aqt/PySide6 incl. QtQuick/QML), wxWidgets, Electron/CEF/Tauri/Wails runtimes
	"git-checkout-source-build", // clone → pinned ref → build-system path → local install prefix
	"wsl-environment", // enable WSL2 (feature.enable + optional BIOS handoff) → register distro → guest installs
	"linux-guest-manager", // apt/dnf/pacman/zypper/apk inside a WSL distro; homebrew inside a WSL distro
	"oci-container", // docker/podman pull (digest-pinned) → run/compose up → volume+port claims
	"script-bootstrap", // official bootstrap scripts (rustup-init, uv installer, nvm, sdkman, poetry) via gated script.run
	"gallery-extension", // PowerShell Gallery modules, VS Code extensions/VSIX, NuGet packages.config
	"hybrid-delegated", // installers that hand off to update services/schedulers/brokers — journaled, attributed via ancestry
] as const;
export type PathClass = (typeof pathClasses)[number];
export const PathClassSchema = union(
	pathClasses.map((c) => lit(c)) as unknown as readonly Schema[],
) as unknown as Schema<PathClass>;

/** Why a route earns preference; also surfaces trade-offs the user cares about. */
export const pathPreferenceReasons = [
	"user-explicit", // the user said so; wins over everything else
	"ecosystem-default", // uv-for-python style standing defaults
	"least-privilege", // per-user scope available where a rival needs elevation
	"best-attribution", // footprint predictable enough for high-quality delta/removal
	"revocability", // boundary teardown (dedicated distro/container) reverses cleanly
	"hardware-support", // GPU/CUDA passthrough works on this route and not that one
	"update-hygiene", // updates flow through mechanisms GetMe observes
	"offline-capable", // pinned artifact path works without network at install time
	"compatibility", // the only route satisfying a hard constraint (license, arch, GUI deps)
	"community-evidence", // verified-recipe trust state carries the day absent other signals
] as const;
export type PathPreferenceReason = (typeof pathPreferenceReasons)[number];
export const PathPreferenceReason = union(
	pathPreferenceReasons.map((r) => lit(r)) as unknown as readonly Schema[],
) as unknown as Schema<PathPreferenceReason>;

/** One concrete route: manager + entity + target + class, with its cost/risk profile. */
export const InstallationPath = obj(
	{
		pathId: IdToken,
		pathClass: PathClassSchema,
		manager: IdToken,
		entityKind: ManagedEntityKind,
		target: ExecutionTarget,
		coordinateTemplate: str({
			minLength: 1,
			maxLength: 1024,
			description: 'Parameterized address within the manager, e.g. "winget:{AppId}", "uv:pip {spec}", "oci:{image}@{digest}".',
		}),
		requiresBoundaries: opt(arr(IdToken, { description: "EnvironmentBoundary ids that must exist first (e.g. a WSL distro)." })),
		prerequisiteToolchains: opt(arr(IdToken)),
		scopes: opt(arr(IdToken)),
		typicalPrivileges: arr(PrivilegeClass, { minItems: 1 }),
		pinCapable: PinningLevel,
		attributionQuality: union([lit("high"), lit("medium"), lit("low"), lit("unknown")], {
			description:
				"Expected observability of this route's effects. low ≠ forbidden — it raises confirm gates and coverage gaps in the receipt, honoring 'unsupported cases must remain visible'.",
		}),
		removalRoute: union([
			lit("manager-uninstall"),
			lit("vendor-uninstaller-then-reconcile"),
			lit("journal-replay"),
			lit("boundary-teardown"),
			lit("prefix-delete"),
			lit("manual-note"),
		]),
		userTradeoffs: opt(
			arr(str({ maxLength: 1024 }), {
				description:
					'Plain-language consequences for the offer UI: "opens as a WSLg window", "files live under \\\\wsl.localhost", "needs a CUDA-capable GPU".',
			}),
		),
		preferenceReasons: opt(arr(PathPreferenceReason)),
		rehearsalStrategy: union(
			[lit("emulated-speakeasy"), lit("windows-sandbox"), lit("disposable-vm"), lit("throwaway-boundary"), lit("none-available")],
			{
				description: "Which rehearsal backend covers this route honestly; none-available forces explain+confirm before host execution.",
			},
		),
		knownBlockers: opt(arr(str({ maxLength: 1024 }))),
	},
	{ description: "A single enumerated route to getting software onto a machine." },
);
export type InstallationPath = {
	pathId: string;
	pathClass: PathClass;
	manager: string;
	entityKind: ManagedEntityKind;
	target: ExecutionTarget;
	coordinateTemplate: string;
	requiresBoundaries?: string[];
	prerequisiteToolchains?: string[];
	scopes?: string[];
	typicalPrivileges: PrivilegeClass[];
	pinCapable: PinningLevel;
	attributionQuality: string;
	removalRoute: string;
	userTradeoffs?: string[];
	preferenceReasons?: PathPreferenceReason[];
	rehearsalStrategy?: string;
	knownBlockers?: string[];
};

/** Default preference ordering over path classes for a given entity kind on a Windows host. */
export const PathPreferencePolicy = obj(
	{
		entityKind: ManagedEntityKind,
		targetBias: opt(arr(ExecutionTarget)),
		classOrder: arr(IdToken, {
			minItems: 1,
			description: "Ordered path-class ids; earlier wins when both are viable for the same software.",
		}),
		note: opt(str({ maxLength: 2048 })),
	},
	{ description: "The router's tie-breaker table entry. Defaults encode founder preferences (uv-first for python) as reviewable data." },
);
export type PathPreferencePolicy = { entityKind: ManagedEntityKind; targetBias?: string[]; classOrder: string[]; note?: string };

/** The full catalog document: managers × toolchains × paths × preference policies. */
export const InstallationPathCatalog = obj(
	{
		schema: lit(ENVIRONMENT_SCHEMA_ID),
		schemaVersion: Semver,
		catalogRevision: Semver,
		generatedAt: DateTime,
		managers: arr(ManagerSpec, { minItems: 1 }),
		toolchains: arr(ToolchainSpec),
		paths: arr(InstallationPath, { minItems: 1 }),
		preferencePolicies: arr(PathPreferencePolicy),
		coverageDeclaration: str({
			minLength: 1,
			maxLength: 8192,
			description:
				"What this catalog edition does NOT cover (installer families unmodeled, managers added later, unverifiable third-party manifests). Gaps stay explicit.",
		}),
	},
	{
		description:
			"Machine-readable enumeration of every installation route GetMe knows how to follow. Ships seeded (see catalog-data.ts); grows as discovery succeeds and developers ship .getme manifests.",
	},
);
export type InstallationPathCatalog = {
	schema: string;
	schemaVersion: string;
	catalogRevision: string;
	generatedAt: string;
	managers: ManagerSpec[];
	toolchains: ToolchainSpec[];
	paths: InstallationPath[];
	preferencePolicies: PathPreferencePolicy[];
	coverageDeclaration: string;
};
