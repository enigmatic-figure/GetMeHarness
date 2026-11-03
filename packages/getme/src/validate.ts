// Cross-module consistency validation for the seeded installation-path catalog.
//
// The catalog (catalog-data.ts) is data, and data drifts. These checks run in CI to keep it honest:
//   - every InstallationPath references a manager that exists in the same catalog;
//   - every prerequisite toolchain id exists;
//   - every boundary dependency resolves to a known boundary id or an explicit "this-plan" sentinel;
//   - path ids are unique;
//   - preference policies only name real path classes;
//   - the recipe method vocabulary covers every path class (retrieval matches recipes by method label);
//   - guest-targeted paths declare their boundary dependency (a step inside a distro cannot float free).
//
// Failures are returned as strings so both the test suite and the CLI can report them uniformly.

import { type PathClass, pathClasses, type InstallationPathCatalog } from "./environment.ts";

/** Boundary ids referenced by seed paths that live outside the catalog document itself. */
const KNOWN_EXTERNAL_BOUNDARIES = new Set(["bnd.wsl.default", "bnd.container.default", "bnd.sandbox.rehearsal"]);

/** Sentinel meaning "the boundary is created earlier in this same plan" (see InstallationPlan.environments). */
const THIS_PLAN_SENTINELS = new Set(["this-plan"]);

/**
 * Recipe `match.method` labels (mirrors the pattern in recipe.ts). Each path class must map to at least
 * one method label, otherwise a discovered route could never be encoded into a retrievable recipe.
 */
export const PATH_CLASS_TO_RECIPE_METHODS: Record<PathClass, string[]> = {
	"native-msi": ["msi"],
	"native-exe-bundle": ["exe-silent", "burn-bundle", "clickonce"],
	"native-portable": ["portable"],
	"os-manager-native": ["winget", "scoop", "choco"],
	"store-packaged": ["appx-msix", "store"],
	"python-isolated": ["python-uv", "python-pip", "python-poetry", "python-conda"],
	"node-global-or-project": ["node-npm", "node-pnpm", "node-yarn", "node-bun"],
	"rust-toolchain-crate": ["rust-cargo", "rust-binstall"],
	"java-runtime-jar-sdk": ["java-jdk"],
	"dotnet-runtime-selfcontained": ["dotnet-sdk"],
	"cpp-build-toolchain": ["cpp-vs-buildtools", "cmake", "ninja", "meson", "bazel", "llvm-mlir", "mingw", "strawberry-perl"],
	"gui-framework": ["qt-aqt", "pyside", "electron-runtime"],
	"git-checkout-source-build": ["git-source-build"],
	"wsl-environment": ["wsl-bootstrap", "wsl-distro"],
	"linux-guest-manager": ["apt", "dnf", "pacman", "zypper", "apk", "brew-linux"],
	"oci-container": ["oci-container", "oci-compose"],
	"script-bootstrap": ["script-bootstrap"],
	"gallery-extension": ["powershell-gallery", "vsix"],
	"hybrid-delegated": ["exe-silent", "winget", "scoop", "choco"], // delegated routes reuse their carrier's label
};

/** One managed-entity kind per path class family — sanity surface, not a hard constraint table. */
export function validateCatalog(catalog: InstallationPathCatalog): string[] {
	const errors: string[] = [];

	const managerIds = new Set(catalog.managers.map((m) => m.id));
	const toolchainIds = new Set(catalog.toolchains.map((t) => t.id));
	const pathClassSet = new Set<string>(pathClasses);

	// Unique ids across documents.
	const seenPathIds = new Set<string>();
	for (const p of catalog.paths) {
		if (seenPathIds.has(p.pathId)) errors.push(`duplicate pathId: ${p.pathId}`);
		seenPathIds.add(p.pathId);

		if (!managerIds.has(p.manager)) {
			errors.push(`path ${p.pathId}: unknown manager "${p.manager}" (not in catalog.managers)`);
		}
		for (const tc of p.prerequisiteToolchains ?? []) {
			if (!toolchainIds.has(tc)) {
				errors.push(`path ${p.pathId}: unknown prerequisiteToolchain "${tc}" (not in catalog.toolchains)`);
			}
		}
		for (const b of p.requiresBoundaries ?? []) {
			if (!THIS_PLAN_SENTINELS.has(b) && !KNOWN_EXTERNAL_BOUNDARIES.has(b)) {
				errors.push(`path ${p.pathId}: unresolvable requiresBoundary "${b}" (known: ${[...KNOWN_EXTERNAL_BOUNDARIES].join(", ")}, or "this-plan")`);
			}
		}
		// Guest-targeted installs must state which environment they run inside.
		if ((p.target === "wsl-distro" || p.target === "container") && (p.requiresBoundaries?.length ?? 0) === 0) {
			errors.push(`path ${p.pathId}: target "${p.target}" requires a non-empty requiresBoundaries declaration`);
		}
	}

	// Preference policies reference real classes and cover entity kinds without duplicates.
	const seenPolicyKinds = new Set<string>();
	for (const policy of catalog.preferencePolicies) {
		if (seenPolicyKinds.has(policy.entityKind)) errors.push(`duplicate preferencePolicy for entityKind: ${policy.entityKind}`);
		seenPolicyKinds.add(policy.entityKind);
		for (const cls of policy.classOrder) {
			if (!pathClassSet.has(cls as PathClass)) {
				errors.push(`preferencePolicy(${policy.entityKind}): unknown path class "${cls}"`);
			}
		}
	}

	// Every path class is reachable through at least one recipe method label, and vice versa the
	// mapping names only real classes.
	for (const cls of pathClasses) {
		const methods = PATH_CLASS_TO_RECIPE_METHODS[cls];
		if (!methods || methods.length === 0) {
			errors.push(`path class "${cls}" has no recipe method label mapping`);
		}
	}

	// Every enumerated path class should actually be represented by a seed path (visibility check).
	const coveredClasses = new Set(catalog.paths.map((p) => p.pathClass));
	for (const cls of pathClasses) {
		if (!coveredClasses.has(cls)) {
			errors.push(`no seed path exercises path class "${cls}" — add a representative route or justify in coverageDeclaration`);
		}
	}

	return errors;
}
