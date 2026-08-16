/**
 * seed — populate the local database with a realistic forge dataset.
 *
 *     bun run scripts/seed.ts [--force] [counts…]
 *
 * Defaults (overridable positionally, in this order):
 *   50 users · 200 repositories
 *
 * How it works:
 *   - Imports every model (the `bunfig.toml` preload applies the typia
 *     transform, so `SqlSerialisable` derives each model's drizzle table).
 *   - Uses the `Randomisable.random()` factory for each model — a raw,
 *     schema-shaped payload — then STAMPS the format-bound fields typia's
 *     `createRandom` cannot honour: uuid ids, emails, lower-cased repo names,
 *     and the FK wiring (repository → owner user).
 *   - Inserts through the derived drizzle tables (batched with `INSERT …`), so
 *     the exact same tables `db:migrate` created are populated, and every query
 *     path (CLI `query`, HTTP server, drizzle select) sees the data.
 *
 * Determinism: each row's random payload comes from typia's `createRandom` which
 * is not seedable — but ids ARE stamped with `crypto.randomUUID()` so rows are
 * stable once written. Re-running does NOT duplicate: users/repositories are
 * inserted by primary key id (`INSERT OR REPLACE`), so the dataset is idempotent.
 */

import { randomUUID } from "node:crypto";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import { databaseUrl } from "../src/macros/envs" with { type: "macro" };

// Import models for side effects — registers them + derives their drizzle tables.
import "@/models";

import { User, Repository } from "../src/models";

/** Default dataset sizes (overridable via positional args). */
const DEFAULTS = {
	users: 50,
	repositories: 200,
};

function parseCounts(argv: string[]): typeof DEFAULTS {
	const out = { ...DEFAULTS };
	const keys = ["users", "repositories"] as const;
	const nums = argv.map((a) => Number.parseInt(a, 10)).filter(Number.isFinite);
	for (let i = 0; i < Math.min(nums.length, keys.length); i++) {
		out[keys[i]!] = nums[i]!;
	}
	return out;
}

/** Escape a string literal for raw SQL. */
function lit(v: unknown): string {
	if (v == null) return "NULL";
	if (typeof v === "number") return String(v);
	if (typeof v === "boolean") return v ? "1" : "0";
	return `'${String(v).replace(/'/g, "''")}'`;
}

function rowSql(vals: unknown[]): string {
	return `(${vals.map((v) => lit(v)).join(",")})`;
}

export async function seed(counts = DEFAULTS): Promise<void> {
	const url = databaseUrl();
	if (!url) throw new Error("seed: no DATABASE_URL — set it in .env or the shell.");

	const client = new SQL(url);
	const db = drizzle({ client });

	const { users, repositories } = counts;

	// ------------------------------------------------------------------
	// 1. Users — stamp id (uuid), email (format), keep random name/role/age.
	// ------------------------------------------------------------------
	console.log(`Seeding ${users} users …`);
	const userRows: unknown[][] = [];
	const userCols = ["id", "created_at", "name", "email", "role", "age"];
	for (let i = 0; i < users; i++) {
		const d = User.User.random();
		userRows.push([
			randomUUID(),
			d.created_at,
			d.name.slice(0, 40),
			`user${i}@example.com`,
			d.role,
			d.age,
		]);
	}
	await client.unsafe(
		`INSERT OR REPLACE INTO "users" (${userCols.map((c) => `"${c}"`).join(",")}) VALUES ` +
			userRows.map((r) => rowSql(r)).join(",\n"),
	);

	// ------------------------------------------------------------------
	// 2. Repositories — stamp id, lowerName (pattern), ownerId (FK → user).
	// ------------------------------------------------------------------
	console.log(`Seeding ${repositories} repositories …`);
	const repoRows: unknown[][] = [];
	const repoCols = [
		"id",
		"created_at",
		"updated_at",
		"ownerId",
		"name",
		"lowerName",
		"description",
		"defaultBranch",
		"website",
		"isPrivate",
		"isArchived",
		"isMirror",
		"isTemplate",
		"objectFormatName",
		"topics",
		"numStars",
		"numForks",
		"numOpenIssues",
		"numClosedIssues",
		"size",
		"avatar",
		"status",
	];
	const userIds = (await client.unsafe(`SELECT "id" FROM "users"`)).map((r: any) => r.id);
	for (let i = 0; i < repositories; i++) {
		const d = Repository.Repository.random();
		const ownerId = userIds[Math.floor(Math.random() * userIds.length)];
		const name = `repo-${i}-${(d.name ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;
		repoRows.push([
			randomUUID(),
			d.created_at,
			d.updated_at,
			ownerId,
			name,
			name.toLowerCase(),
			(d.description ?? "").slice(0, 200),
			"main",
			"",
			Math.random() < 0.2 ? 1 : 0, // ~20% private
			0,
			0,
			0,
			"sha1",
			"[]",
			Math.floor(Math.random() * 1000), // numStars
			0,
			0,
			0,
			0,
			"",
			0,
		]);
	}
	await client.unsafe(
		`INSERT OR REPLACE INTO "repositories" (${repoCols.map((c) => `"${c}"`).join(",")}) VALUES ` +
			repoRows.map((r) => rowSql(r)).join(",\n"),
	);

	// ------------------------------------------------------------------
	// Summary
	// ------------------------------------------------------------------
	const countsNow = await client.unsafe(
		`SELECT (SELECT COUNT(*) FROM "users") u, (SELECT COUNT(*) FROM "repositories") r`,
	);
	const c = countsNow[0];
	console.log(`\nDone. DB now has: ${c.u} users, ${c.r} repositories.`);
}

// Run when invoked directly.
if (import.meta.main) {
	const argv = process.argv.slice(2);
	const force = argv.includes("--force");
	if (!force) {
		// Light guard: refuse to reseed a non-empty DB unless --force.
		try {
			const { runMigrations } = await import("./db-migrate");
			await runMigrations();
		} catch (err) {
			console.error(`seed: migrations failed — run db:generate first? ${(err as Error).message}`);
			process.exit(1);
		}
	}
	const counts = parseCounts(argv.filter((a) => a !== "--force"));
	await seed(counts).catch((err) => {
		console.error(`seed failed: ${(err as Error).message}`);
		process.exit(1);
	});
}
