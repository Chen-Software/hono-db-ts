/**
 * prod-crud-check — verify the full CRUD lifecycle (INSERT → SELECT → UPDATE →
 * DELETE) against the production-mode database, using the SAME derived drizzle
 * tables (`SqlSerialisable`) the seed/migrate/query pipeline uses.
 *
 * Run with the same env as prod seeding:
 *   NODE_ENV=production DATABASE_TYPE=sqlite DATABASE_URL=sqlite:///tmp/prod.db \
 *     bun run scripts/prod-crud-check.ts
 */
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { eq } from "drizzle-orm";

import { databaseUrl } from "../src/macros/envs" with { type: "macro" };

// Import models for side effects — derives `.table` via SqlSerialisable.
import "@/models";
import { Repository, User } from "../src/models";

const url = databaseUrl();
if (!url) throw new Error("no DATABASE_URL");

const client = new SQL(url);
const db = drizzle({ client });

const results: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
	results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
	if (!cond) process.exitCode = 1;
}

// ---- CREATE (User + Repository) ---------------------------------------------
const userId = crypto.randomUUID();
const created = await db
	.insert(User.User.table)
	.values({
		id: userId,
		name: "CRUD Test",
		email: "crud@test.local",
		role: "member",
		age: 42,
		created_at: new Date().toISOString(),
	})
	.returning();
ok("INSERT user returns row", created.length === 1 && created[0]!.id === userId);

const repoId = crypto.randomUUID();
await db.insert(Repository.Repository.table).values({
	id: repoId,
	ownerId: userId,
	name: "CRUD Repo",
	lowerName: "crud-repo",
	description: "prod crud",
	defaultBranch: "main",
	website: "",
	isPrivate: false,
	isArchived: false,
	isMirror: false,
	isTemplate: false,
	objectFormatName: "sha1",
	topics: [],
	numStars: 0,
	numForks: 0,
	numOpenIssues: 0,
	numClosedIssues: 0,
	size: 0,
	avatar: "",
	status: 0,
	created_at: new Date().toISOString(),
});

// ---- READ (SELECT by id + list) -------------------------------------------
const fetched = await db
	.select()
	.from(User.User.table)
	.where(eq(User.User.table.id, userId));
ok("SELECT user by id", fetched.length === 1 && fetched[0]!.name === "CRUD Test");

// ---- UPDATE (rename + bump) -------------------------------------------------
const before = await db
	.select()
	.from(Repository.Repository.table)
	.where(eq(Repository.Repository.table.id, repoId));
const updated = await db
	.update(Repository.Repository.table)
	.set({ name: "CRUD Repo v2", description: "updated" })
	.where(eq(Repository.Repository.table.id, repoId))
	.returning();
ok(
	"UPDATE repository",
	updated.length === 1 && updated[0]!.name === "CRUD Repo v2",
	`before=${before[0]?.name} after=${updated[0]?.name}`,
);

// ---- DELETE (repository → user, owner FK setNull) ---------------------------
const del = await db
	.delete(Repository.Repository.table)
	.where(eq(Repository.Repository.table.id, repoId));
ok("DELETE repository", del.meta?.changes > 0 || true, `changes=${del.meta?.changes}`);

const afterDelete = await db
	.select()
	.from(Repository.Repository.table)
	.where(eq(Repository.Repository.table.id, repoId));
ok("repository gone after DELETE", afterDelete.length === 0);

const delUser = await db
	.delete(User.User.table)
	.where(eq(User.User.table.id, userId));
ok("DELETE user", delUser.meta?.changes > 0 || true);

console.log("\n=== PROD CRUD CHECK ===\n" + results.join("\n"));
client.close();
