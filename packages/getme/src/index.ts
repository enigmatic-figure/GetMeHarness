// GetMe schema package — public surface.
//
// Schema families (each with its own schema id/version, emitted to json-schema/ by scripts/emit-json-schema.ts):
//   vocabulary.ts    shared primitives (ids, aliases, hashes, path grammars)
//   machine.ts       local machine profile + environment matching (minimal collection, task-specific probes)
//   resources.ts     the nouns: every effect kind a plan can have or a record can attribute (host + guest-scoped)
//   environment.ts   execution boundaries (WSL2 distros, OCI containers, Windows Sandbox), manager/toolchain
//                    specs, installation-path classes, and the path catalog contract
//   catalog-data.ts  the seeded enumeration of installation routes: ~57 managers/toolchains across 19 path
//                    classes (winget/scoop/choco, uv-default Python, npm/pnpm/yarn/bun, cargo, Java/.NET/C++/
//                    LLVM-MLIR/Strawberry Perl build systems, Qt/PySide-QML/Electron GUI runtimes, git-source
//                    builds, WSL2 bootstrap + in-distro apt/dnf/pacman/zypper/apk/brew, Docker/Podman/OCI,
//                    script bootstraps, galleries/VSIX) plus founder preference policies as data
//   plan.ts          the agent→executor contract: closed verb vocabulary, privileges/approval/preconditions,
//                   verification/compensation, boundary-scoped steps (wsl.*/oci.*/git.*), consent digest
//   recipe.ts        versioned reusable knowledge: trust states, match criteria, removal contract, retry bounds
//   record.ts        the installation delta: journal events, before/after resource states, process ancestry,
//                    coverage report, two-level executor output (agent summary + full machine-readable record)
//   lifecycle.ts     user policy, continued observation, managed-installation registry, request envelope
//                    (getme/getgone/gethelp/getupdates), receipts, removal reconciliation
//   access.ts        configure phase: how the user opens and uses the tool (shortcuts, hotkeys, wrappers)

export * from "./vocabulary.ts";
export * from "./machine.ts";
export * from "./resources.ts";
export * from "./environment.ts";
export * from "./plan.ts";
export * from "./recipe.ts";
export * from "./record.ts";
export * from "./lifecycle.ts";
export * from "./access.ts";
export * from "./catalog-data.ts";
