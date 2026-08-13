/**
 * db-generate — generate migration SQL from the model plans.
 *
 * Reads `src/generated/models.json` (written by `scripts/model-build.ts`) and
 * emits `CREATE TABLE` migration SQL for the selected dialect — sqlite (default)
 * or pg — into the `drizzle/` directory as a timestamped migration file.
 *
 * The plans are produced by `deriveSqlPlan` (the same planner behind the
 * `SqlSerialisable` capacity), so the generated DDL is exactly the SQL
 * projection of the models: column kinds (`string`/`integer`/`number`/`boolean`
 * /`json`/`enum`), NOT NULL / PRIMARY KEY, foreign-key `.references()`
 * constraints (from `Reference` tags), and CHECK constraints (from reflected
 * bounds like minLength/maxLength/pattern/enum).
 *
 * This keeps generation drizzle-free and serialisable — the runtime never needs
 * typia. Applied later by `scripts/db-migrate.ts` (or any standard SQLite/PG
 * client).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SqlDialect, SqlModelPlan } from "../src/capacities/sql-serialisable";

const GENERATED = resolve(import.meta.dir, "../src/generated/models.json");
const OUT_DIR = resolve(import.meta.dir, "../drizzle");

/** Quote an identifier with the given quote char (`"` for both dialects here). */
const q = (id: string): string => `"${id}"`;

/** Map a plan column kind + dialect to a DDL column type. */
function columnType(kind: string, dialect: SqlDialect): string {
	switch (kind) {
		case "string":
		case "json":
		case "enum":
			// JSON objects/arrays degrade to TEXT (JSON-encoded) in both dialects.
			return dialect === "pg" ? "text" : "text";
		case "integer":
			return dialect === "pg" ? "integer" : "integer";
		case "number":
			return dialect === "pg" ? "double precision" : "real";
		case "boolean":
			// SQLite has no boolean: store 0/1. Postgres keeps a real boolean.
			return dialect === "pg" ? "boolean" : "integer";
		default:
			return "text";
	}
}

/** Quote a string literal for SQL (escaping single quotes). */
function str(v: string): string {
	return `'${v.replace(/'/g, "''")}'`;
}

/**
 * Build the list of column definitions for a plan. Each entry is either a
 * column (`"name" type NOT NULL`) or a named CHECK constraint — the ordering
 * keeps CHECKs inside the same `CREATE TABLE` statement.
 */
function columnDefs(plan: SqlModelPlan): string[] {
	const defs: string[] = [];
	for (const col of plan.columns) {
		let d = `${q(col.name)} ${columnType(col.kind, plan.dialect)}`;
		if (col.isId) {
			// SQLite autoincrement only applies to INTEGER PRIMARY KEY; uuid/text
			// ids are just PRIMARY KEY. We never auto-generate ids here.
			d += " PRIMARY KEY";
		} else if (!col.nullable) {
			d += " NOT NULL";
		}
		defs.push(d);
	}
	// CHECK constraints derived from reflected bounds.
	for (const c of plan.checks) {
		// `expression` is a raw, dialect-agnostic fragment quoting columns with
		// `"` (see planChecks). `length()` is portable; but regexp PATTERN checks
		// are not: PG uses `~`, SQLite has no `REGEXP` unless a custom function is
		// registered. Skip pattern-based checks on SQLite so the generated DDL
		// actually applies to a stock SQLite database (matching the documented
		// "sqlite has no portable regexp" caveat in sql-serialisable.ts).
		if (plan.dialect === "sqlite" && /REGEXP/i.test(c.expression)) continue;
		defs.push(`CONSTRAINT ${q(c.name)} CHECK (${c.expression})`);
	}
	return defs;
}

/**
 * Build a `modelName -> tableName` map from the plans, so an FK relation's
 * `target` (a model name, e.g. `"UserSchema"`) can be resolved to the actual
 * table name (`"users"`). Falls back to the target string itself.
 */
function tableNameIndex(plans: SqlModelPlan[]): Map<string, string> {
	const index = new Map<string, string>();
	for (const p of plans) {
		if (p.modelName) index.set(p.modelName, p.name);
	}
	return index;
}

/**
 * Render a single `CREATE TABLE` statement. Columns come from the plan; table
 * level FOREIGN KEY clauses are derived from the plan relations, with the
 * `target` model name resolved to the target table name.
 */
function renderTable(plan: SqlModelPlan, index: Map<string, string>): string {
	const defs = columnDefs(plan);
	for (const rel of plan.relations) {
		const targetTable = index.get(rel.target) ?? rel.target;
		defs.push(
			`CONSTRAINT ${q(`${plan.name}_${rel.column}_fk`)} ` +
				`FOREIGN KEY (${q(rel.column)}) REFERENCES ${q(targetTable)}(${q(
					rel.targetColumn,
				)})`,
		);
	}
	// Join column/check/fk defs with commas (no trailing comma before `)`).
	return [
		`CREATE TABLE IF NOT EXISTS ${q(plan.name)} (`,
		...defs.map((d, i) => `\t${d}${i < defs.length - 1 ? "," : ""}`),
		`);`,
	].join("\n");
}

/** Load the plans, optionally filtered to one dialect. */
export function loadPlans(dialect: SqlDialect | "all"): SqlModelPlan[] {
	const raw = JSON.parse(readFileSync(GENERATED, "utf8")) as SqlModelPlan[];
	return dialect === "all" ? raw : raw.filter((p) => p.dialect === dialect);
}

export function generateMigrations(
	dialect: SqlDialect = "sqlite",
): { file: string; sql: string } {
	const plans = loadPlans(dialect);
	if (plans.length === 0) {
		throw new Error(`db-generate: no plans for dialect "${dialect}"`);
	}

	// Deterministic order: tables before their referencing tables isn't strictly
	// required (CREATE TABLE IF NOT EXISTS + FK references resolve lazily in
	// SQLite, and in PG too), but sort by name for stable, reviewable output.
	const sorted = [...plans].sort((a, b) => a.name.localeCompare(b.name));

	const header = `-- Generated by db-generate (${dialect})\n-- from models.json (${new Date().toISOString()})\n-- Models: ${sorted
		.map((p) => p.name)
		.join(", ")}\n\n`;

	const index = tableNameIndex(sorted);
	const body = sorted.map((p) => renderTable(p, index)).join("\n\n");
	const sql = header + body + "\n";

	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const file = `${ts}_${dialect}_create.sql`;
	return { file, sql };
}

async function main(): Promise<void> {
	const dialectArg = process.argv[2];
	const dialect: SqlDialect =
		dialectArg === "pg" || dialectArg === "sqlite" ? dialectArg : "sqlite";

	const { file, sql } = generateMigrations(dialect);
	mkdirSync(OUT_DIR, { recursive: true });
	const outFile = resolve(OUT_DIR, file);
	writeFileSync(outFile, sql);

	console.log(`Generated migration for "${dialect}":`);
	console.log(`  ${outFile}`);
	console.log(
		sql
			.split("\n")
			.filter((l) => l.startsWith("CREATE"))
			.map((l) => `  ${l}`)
			.join("\n"),
	);
}

if (import.meta.main) {
	main();
}
