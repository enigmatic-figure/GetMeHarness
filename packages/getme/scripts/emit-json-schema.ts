// Emit the GetMe schema families as standalone JSON Schema (draft 2020-12) documents into ./json-schema.
//
// The pi-schema builders return plain JSON Schema objects, so emission is: take each root document schema,
// attach $id/draft metadata, write one pretty file per family. Root documents are closed objects; nested
// subschemas stay inline (no $refs to resolve), which keeps every emitted file self-contained — useful for
// executor implementations in any language (the Rust native executor will validate against these files).

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AccessPreferenceTemplate } from "../src/access.ts";
import { EnvironmentBoundary, InstallationPathCatalog, ManagerSpec } from "../src/environment.ts";
import { InstallationRecipe } from "../src/recipe.ts";
import { ManagedInstallation, Receipt, RemovalReceipt, RequestEnvelope, UserPolicy } from "../src/lifecycle.ts";
import { ExecutionRecord } from "../src/record.ts";
import { ResourceState } from "../src/resources.ts";
import { MachineProfile } from "../src/machine.ts";
import { InstallationPlan } from "../src/plan.ts";

const OUT = new URL("../json-schema", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

type Doc = { file: string; id: string; version: string; title: string; schema: unknown };

const docs: Doc[] = [
	{ file: "machine.json", id: "https://getme.dev/schema/machine.json", version: "1.0.0", title: "GetMe local machine profile + environment match", schema: MachineProfile },
	{ file: "resources.json", id: "https://getme.dev/schema/resources.json", version: "1.0.0", title: "GetMe resource state (host + guest-scoped kinds)", schema: ResourceState },
	{ file: "environment.json", id: "https://getme.dev/schema/environment.json", version: "1.0.0", title: "GetMe execution boundaries, managers, toolchains, path catalog", schema: InstallationPathCatalog },
	{ file: "boundary.json", id: "https://getme.dev/schema/boundary.json", version: "1.0.0", title: "GetMe environment boundary instance", schema: EnvironmentBoundary },
	{ file: "manager.json", id: "https://getme.dev/schema/manager.json", version: "1.0.0", title: "GetMe manager specification", schema: ManagerSpec },
	{ file: "plan.json", id: "https://getme.dev/schema/plan.json", version: "1.0.0", title: "GetMe installation plan (agent -> executor contract)", schema: InstallationPlan },
	{ file: "recipe.json", id: "https://getme.dev/schema/recipe.json", version: "1.0.0", title: "GetMe versioned installation recipe", schema: InstallationRecipe },
	{ file: "record.json", id: "https://getme.dev/schema/record.json", version: "1.0.0", title: "GetMe execution record / installation delta", schema: ExecutionRecord },
	{ file: "lifecycle.json", id: "https://getme.dev/schema/lifecycle.json", version: "1.0.0", title: "GetMe user policy", schema: UserPolicy },
	{ file: "request.json", id: "https://getme.dev/schema/request.json", version: "1.0.0", title: "GetMe request envelope (conversational surface)", schema: RequestEnvelope },
	{ file: "installation.json", id: "https://getme.dev/schema/installation.json", version: "1.0.0", title: "GetMe managed installation entry", schema: ManagedInstallation },
	{ file: "receipt.json", id: "https://getme.dev/schema/receipt.json", version: "1.0.0", title: "GetMe installation receipt", schema: Receipt },
	{ file: "removal-receipt.json", id: "https://getme.dev/schema/removal-receipt.json", version: "1.0.0", title: "GetMe removal receipt (getgone outcome)", schema: RemovalReceipt },
	{ file: "access.json", id: "https://getme.dev/schema/access.json", version: "1.0.0", title: "GetMe access preference template (configure phase)", schema: AccessPreferenceTemplate },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const doc of docs) {
	const json = {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: doc.id,
		title: doc.title,
		version: doc.version,
		...(doc.schema as object),
	};
	writeFileSync(join(OUT, doc.file), `${JSON.stringify(json, null, 2)}\n`);
	console.log(`wrote json-schema/${doc.file}`);
}
