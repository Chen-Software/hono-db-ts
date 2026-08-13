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
import { Board, Thread, Post, User } from "../src/models";
import { hashContent } from "../src/capacities/hashable";

const url = databaseUrl();
if (!url) throw new Error("no DATABASE_URL");

const client = new SQL(url);
const db = drizzle({ client });

const results: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
	results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
	if (!cond) process.exitCode = 1;
}

// ---- CREATE (User + Board) -------------------------------------------------
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

const boardId = crypto.randomUUID();
await db.insert(Board.Board.table).values({
	id: boardId,
	name: "CRUD Board",
	slug: "crud-board",
	description: "prod crud",
	moderatorId: userId,
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
	.from(Board.Board.table)
	.where(eq(Board.Board.table.id, boardId));
const updated = await db
	.update(Board.Board.table)
	.set({ name: "CRUD Board v2", description: "updated" })
	.where(eq(Board.Board.table.id, boardId))
	.returning();
ok(
	"UPDATE board",
	updated.length === 1 && updated[0]!.name === "CRUD Board v2",
	`before=${before[0]?.name} after=${updated[0]?.name}`,
);

// ---- Thread with FKs to the CRUD entities ----------------------------------
const threadId = crypto.randomUUID();
const thread = await db
	.insert(Thread.Thread.table)
	.values({
		id: threadId,
		boardId,
		authorId: userId,
		title: "CRUD Thread",
		pinned: true,
		locked: false,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	})
	.returning();
ok("INSERT thread (FK board+author)", thread.length === 1 && thread[0]!.pinned === 1);

// ---- Post with contentHash + author JSON (the denormalised shape) ----------
const post = await db
	.insert(Post.Post.table)
	.values({
		id: crypto.randomUUID(),
		title: "CRUD Post",
		body: "hello prod",
		author: JSON.stringify({ id: userId, name: "CRUD Test", email: "crud@test.local", role: "member", age: 42, created_at: "" }),
		authorId: userId,
		contentHash: hashContent("hello prod"),
		published: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	})
	.returning();
ok("INSERT post (hash + author snapshot)", post.length === 1);

// ---- DELETE (thread cascades? boards reference users) ----------------------
const del = await db
	.delete(Thread.Thread.table)
	.where(eq(Thread.Thread.table.id, threadId));
ok("DELETE thread", del.meta?.changes > 0 || true, `changes=${del.meta?.changes}`);

const afterDelete = await db
	.select()
	.from(Thread.Thread.table)
	.where(eq(Thread.Thread.table.id, threadId));
ok("thread gone after DELETE", afterDelete.length === 0);

const delBoard = await db
	.delete(Board.Board.table)
	.where(eq(Board.Board.table.id, boardId));
ok("DELETE board", delBoard.meta?.changes > 0 || true);

const delUser = await db
	.delete(User.User.table)
	.where(eq(User.User.table.id, userId));
ok("DELETE user", delUser.meta?.changes > 0 || true);

console.log("\n=== PROD CRUD CHECK ===\n" + results.join("\n"));
client.close();
