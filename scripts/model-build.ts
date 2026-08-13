/**
 * model-build — BUILD the SQL projection of every model.
 *
 * This is the `models:build` step. It:
 *
 *  1. Imports every model module (`User`, `Post`, …), which RUNS the typia
 *     transform (wired via the `@ttsc/unplugin/bun` plugin in `bunfig.toml`)
 *     and triggers each model's `defineModel` composition — including the
 *     `SqlSerialisable` capacity that derives the real drizzle tables from the
 *     reflected typia JSON schema.
 *  2. Enumerates the registered models through the model `registry`
 *     (`listModels()`).
 *  3. For each SQL-capable model, derives a SERIALISABLE, drizzle-free
 *     `SqlModelPlan` from its reflected `schema` via `deriveSqlPlan` (the same
 *     planner that backs `SqlSerialisable`), for BOTH dialects (sqlite primary
 *     + pg, since `SqlSerialisable` derives `.sql`/`.sqlPg` by default).
 *  4. Writes the plans to `src/generated/models.json` — the build-time artifact
 *     that `db-generate`/`db-migrate` consume. The runtime never needs typia,
 *     because the plan already carries every column/relation/check detail.
 *
 * Run directly (`bun run scripts/model-build.ts`) or via the CLI
 * (`bun run src/main.ts models:build`).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// The ttsc transform is already active here: this script is loaded through the
// same `bunfig.toml` preload (`@ttsc/unplugin/bun-register`) that applies to
// every `bun run`, so importing the model modules runs typia correctly. We
// import the model files for their side effect — each one calls `defineModel`,
// which registers the class in the model registry.
import "@/models/user";
import "@/models/post";
import "@/models/board";
import "@/models/thread";
import "@/models/reply";

import type { SqlDialect, SqlModelPlan } from "../src/capacities/sql-serialisable";
import { deriveSqlPlan } from "../src/capacities/sql-serialisable";
import { listModels } from "../src/registry";

/** Read a model's derived drizzle table name via drizzle's table symbols. */
function tableNameOf(Ctor: any): string | undefined {
	return Ctor.table?.[Symbol.for("drizzle:Name")];
}

/**
 * Gather both dialect projections for a model. `SqlSerialisable` derives the
 * primary dialect table (`.sql`) plus the opposite dialect (`.sqlPg`) by
 * default, so we derive both plans from the same reflected schema — one per
 * dialect — so `db:generate` can emit either.
 */
function planFor(
	Ctor: any,
	name: string,
): SqlModelPlan[] {
	const schema = Ctor.schema;
	if (!schema) return [];

	const dialects: SqlDialect[] = ["sqlite", "pg"];
	return dialects.map((dialect) =>
		deriveSqlPlan(schema as any, { name, dialect }),
	);
}

export function buildModels(): SqlModelPlan[] {
	const plans: SqlModelPlan[] = [];
	for (const [schemaName, Ctor] of listModels()) {
		const tableName = tableNameOf(Ctor);
		if (!tableName) {
			// Not SQL-capable (no SqlSerialisable) — skip, but note it.
			console.log(`  ${schemaName}: no SQL table (skip)`);
			continue;
		}
		for (const plan of planFor(Ctor, tableName)) {
			plans.push(plan);
			console.log(
				`  ${schemaName} -> ${plan.dialect} table "${plan.name}" ` +
					`(${plan.columns.length} col(s), ${plan.relations.length} fk, ${plan.checks.length} check)`,
			);
		}
	}
	return plans;
}

async function main(): Promise<void> {
	const outDir = resolve(import.meta.dir, "../src/generated");
	const outFile = resolve(outDir, "models.json");

	console.log("Building SQL projections from registered models …");
	const plans = buildModels();
	if (plans.length === 0) {
		console.error("No SQL-capable models found. Exiting.");
		process.exit(1);
	}

	mkdirSync(outDir, { recursive: true });
	writeFileSync(outFile, `${JSON.stringify(plans, null, 2)}\n`);
	console.log(`\nWrote ${plans.length} plan(s) to ${outFile}`);
}

// Run when invoked directly (or via the CLI, which calls `buildModels()` itself).
if (import.meta.main) {
	main();
}
