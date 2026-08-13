/**
 * d1-check — verify the D1 code path end-to-end (seeding, querying, CRUD)
 * using a D1-COMPATIBLE binding backed by `bun:sqlite`.
 *
 * WHY a mock: the real Workers D1 runtime (`workerd`) cannot run on this
 * machine (macOS 12.6 < 13.5 minimum), and the OAuth token only has
 * `account(read)` scope (no D1 write). D1 runs the SQLite dialect, so driving
 * the real `D1Executor` adapter against a SQLite-backed `D1Database` mock
 * exercises the EXACT production code path (`prepare`/`bind`/`all`) with
 * identical SQL semantics.
 *
 * What it verifies:
 *   1. Migrations (drizzle/*.sql) apply on D1 (SQLite dialect).
 *   2. SEEDING through the D1 adapter (`INSERT OR REPLACE`, FK wiring).
 *   3. QUERYING through the D1 adapter (the app's good queries / stats).
 *   4. CRUD through the D1 adapter (INSERT / SELECT / UPDATE / DELETE).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { SQL } from "bun";

// The production D1 adapter under test.
import { D1Executor } from "../src/worker/d1";
import { buildQueryApp } from "../src/http/app";

// ---- D1-compatible binding over bun:sqlite (D1 runs SQLite). ---------------
class MockD1Statement {
	constructor(
		private readonly client: SQL,
		private readonly sql: string,
		private readonly bound: unknown[] = [],
	) {}

	bind(...values: unknown[]): MockD1Statement {
		return new MockD1Statement(this.client, this.sql, values);
	}

	async all(): Promise<{ results: Record<string, unknown>[] }> {
		const rows = (await this.client.unsafe(this.sql, this.bound)) as Record<
			string,
			unknown
		>[];
		return { results: rows };
	}
}

class MockD1 implements D1Database {
	constructor(private readonly client: SQL) {}
	prepare(sql: string): MockD1Statement {
		return new MockD1Statement(this.client, sql);
	}
	// Not used by D1Executor, but satisfy the interface.
	async batch(): Promise<unknown> {
		throw new Error("unused");
	}
	async dump(): Promise<ArrayBuffer> {
		throw new Error("unused");
	}
	async exec(): Promise<void> {
		throw new Error("unused");
	}
	async raw(): Promise<unknown> {
		throw new Error("unused");
	}
}

// ---- Helpers ----------------------------------------------------------------
function splitStatements(sql: string): string[] {
	return sql
		.replace(/--.*$/gm, "")
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function readMigrations(): string {
	const dir = resolve("drizzle");
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	return files
		.map((f) => `-- ${f}\n${readFileSync(resolve(dir, f), "utf8")}`)
		.join("\n");
}

const results: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
	results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
	if (!cond) process.exitCode = 1;
}

// ---- Main -------------------------------------------------------------------
const client = new SQL(":memory:");
const d1 = new MockD1(client);
const exec = new D1Executor(d1);
const app = buildQueryApp(exec);

// 1. MIGRATIONS
for (const stmt of splitStatements(readMigrations())) {
	await exec.unsafe(stmt);
}
const tables = (await exec.unsafe(
	`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
)) as { name: string }[];
const names = tables.map((t) => t.name).sort();
for (const t of ["users", "boards", "threads", "replies", "posts"]) {
	ok(`migration creates "${t}" table`, names.includes(t));
}

// 2. SEEDING — via the D1 adapter (INSERT OR REPLACE, FK wiring)
const uid = randomUUID();
const bid = randomUUID();
const tid = randomUUID();
await exec.unsafe(
	`INSERT OR REPLACE INTO "users" ("id","created_at","name","email","role","age") VALUES (?,?,?,?,?,?)`,
	[uid, "2000-01-01T00:00:00.000Z", "Ada", "ada@d1.test", "admin", 30],
);
await exec.unsafe(
	`INSERT OR REPLACE INTO "boards" ("id","created_at","name","slug","description","moderatorId") VALUES (?,?,?,?,?,?)`,
	[bid, "2001-01-01T00:00:00.000Z", "Tech", "tech", "fast", uid],
);
await exec.unsafe(
	`INSERT OR REPLACE INTO "threads" ("id","created_at","updated_at","boardId","authorId","title","pinned","locked") VALUES (?,?,?,?,?,?,?,?)`,
	[tid, "2002-01-01T00:00:00.000Z", "2002-01-02T00:00:00.000Z", bid, uid, "Hello D1", 1, 0],
);
const seedCount = (
	(await exec.unsafe(`SELECT COUNT(*) AS n FROM "users"`)) as { n: number }[]
)[0]!.n;
ok("seed inserted 1 user via D1 adapter", seedCount === 1, `users=${seedCount}`);

// 3. QUERYING — through the D1 adapter (the app's SQL + a /stats hit)
const statsRes = await app.fetch(new Request("http://local/stats"));
const stats = await statsRes.json();
ok("query /stats via D1 adapter", statsRes.status === 200 && stats.ok === true);
ok(
	"query /stats counts",
	stats.data.users === 1 && stats.data.boards === 1 && stats.data.threads === 1,
	`users=${stats.data.users} boards=${stats.data.boards} threads=${stats.data.threads}`,
);

const boardsRes = await app.fetch(new Request("http://local/boards?limit=5"));
const boards = await boardsRes.json();
ok("query /boards via D1 adapter", boardsRes.status === 200 && boards.data.rows.length === 1);

// 4. CRUD — INSERT / SELECT / UPDATE / DELETE through the D1 adapter
const tid2 = randomUUID();
await exec.unsafe(
	`INSERT OR REPLACE INTO "threads" ("id","created_at","updated_at","boardId","authorId","title","pinned","locked") VALUES (?,?,?,?,?,?,?,?)`,
	[tid2, "2003-01-01T00:00:00.000Z", "2003-01-01T00:00:00.000Z", bid, uid, "CRUD", 0, 0],
);
const afterInsert = (
	(await exec.unsafe(`SELECT COUNT(*) AS n FROM "threads"`)) as { n: number }[]
)[0]!.n;
ok("CRUD INSERT", afterInsert === 2, `threads=${afterInsert}`);

await exec.unsafe(`UPDATE "boards" SET "name" = ? WHERE "id" = ?`, ["Tech v2", bid]);
const updatedBoard = (
	(await exec.unsafe(`SELECT "name" FROM "boards" WHERE "id" = ?`, [bid])) as {
		name: string;
	}[]
)[0]!;
ok("CRUD UPDATE", updatedBoard.name === "Tech v2", `name=${updatedBoard.name}`);

await exec.unsafe(`DELETE FROM "threads" WHERE "id" = ?`, [tid2]);
const afterDelete = (
	(await exec.unsafe(`SELECT COUNT(*) AS n FROM "threads"`)) as { n: number }[]
)[0]!.n;
ok("CRUD DELETE", afterDelete === 1, `threads=${afterDelete}`);

console.log("\n=== D1 VERIFICATION (mock binding over SQLite) ===\n" + results.join("\n"));
client.close();
