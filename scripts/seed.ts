/**
 * seed — populate the local database with a realistic BBS dataset.
 *
 *     bun run scripts/seed.ts [--force] [counts…]
 *
 * Defaults (overridable positionally, in this order):
 *   50 users · 100 boards · 1000 posts · 1000 threads · 2000 replies
 *
 * How it works:
 *   - Imports every model (the `bunfig.toml` preload applies the typia
 *     transform, so `SqlSerialisable` derives each model's drizzle table).
 *   - Uses the `Randomisable.random()` factory for each model — a raw,
 *     schema-shaped payload — then STAMPS the format-bound fields typia's
 *     `createRandom` cannot honour: uuid ids, emails, slug patterns, SHA-256
 *     content hashes, and the FK wiring (board→moderator, thread→board/author,
 *     reply→thread/author/parent, post→author).
 *   - Inserts through the derived drizzle tables (batched with `INSERT …`), so
 *     the exact same tables `db:migrate` created are populated, and every query
 *     path (CLI `query`, HTTP server, drizzle select) sees the data.
 *
 * Determinism: each row's random payload comes from typia's `createRandom` which
 * is not seedable — but ids ARE stamped with `crypto.randomUUID()` so rows are
 * stable once written. Re-running does NOT duplicate: users/boards/threads/
 * replies are inserted by primary key id (`INSERT OR REPLACE`), so the dataset
 * is idempotent.
 */

import { randomUUID } from "node:crypto";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import { databaseUrl } from "../src/macros/envs" with { type: "macro" };

// Import models for side effects — registers them + derives their drizzle tables.
import "@/models";

import { Board, Thread, Reply, Post, User } from "../src/models";
import { hashContent } from "../src/capacities/hashable";

/** Default dataset sizes (overridable via positional args). */
const DEFAULTS = {
	users: 50,
	boards: 100,
	posts: 1000,
	threads: 1000,
	replies: 2000,
};

function parseCounts(argv: string[]): typeof DEFAULTS {
	const out = { ...DEFAULTS };
	const keys = ["users", "boards", "posts", "threads", "replies"] as const;
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

	const { users, boards, posts, threads, replies } = counts;

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
	// 2. Boards — stamp id, slug (pattern), moderatorId (FK → random user).
	// ------------------------------------------------------------------
	console.log(`Seeding ${boards} boards …`);
	const boardRows: unknown[][] = [];
	const boardCols = ["id", "created_at", "name", "slug", "description", "moderatorId"];
	const userIds = (await client.unsafe(`SELECT "id" FROM "users"`)).map((r: any) => r.id);
	for (let i = 0; i < boards; i++) {
		const d = Board.Board.random();
		boardRows.push([
			randomUUID(),
			d.created_at,
			d.name.slice(0, 60),
			`board-${i}-${d.slug.replace(/[^a-z0-9]+/g, "-").slice(0, 20)}`,
			d.description.slice(0, 200),
			userIds[Math.floor(Math.random() * userIds.length)],
		]);
	}
	await client.unsafe(
		`INSERT OR REPLACE INTO "boards" (${boardCols.map((c) => `"${c}"`).join(",")}) VALUES ` +
			boardRows.map((r) => rowSql(r)).join(",\n"),
	);

	// ------------------------------------------------------------------
	// 3. Threads — stamp id, boardId/authorId (FK), title length.
	// ------------------------------------------------------------------
	console.log(`Seeding ${threads} threads …`);
	const threadRows: unknown[][] = [];
	const threadCols = [
		"id",
		"created_at",
		"updated_at",
		"boardId",
		"authorId",
		"title",
		"pinned",
		"locked",
	];
	const boardIds = (await client.unsafe(`SELECT "id" FROM "boards"`)).map((r: any) => r.id);
	for (let i = 0; i < threads; i++) {
		const d = Thread.Thread.random();
		threadRows.push([
			randomUUID(),
			d.created_at,
			d.updated_at,
			boardIds[Math.floor(Math.random() * boardIds.length)],
			userIds[Math.floor(Math.random() * userIds.length)],
			d.title.slice(0, 200),
			Math.random() < 0.1, // ~10% pinned
			Math.random() < 0.02, // ~2% locked
		]);
	}
	await client.unsafe(
		`INSERT OR REPLACE INTO "threads" (${threadCols.map((c) => `"${c}"`).join(",")}) VALUES ` +
			threadRows.map((r) => rowSql(r)).join(",\n"),
	);

	// ------------------------------------------------------------------
	// 4. Replies — stamp id, threadId/authorId/parentId (FK), body length.
	//    ~60% top-level, ~40% nested (parentId → an earlier reply).
	// ------------------------------------------------------------------
	console.log(`Seeding ${replies} replies …`);
	const replyRows: unknown[][] = [];
	const replyCols = ["id", "created_at", "threadId", "authorId", "parentId", "body"];
	const threadIds = (await client.unsafe(`SELECT "id" FROM "threads"`)).map((r: any) => r.id);
	const replyIds: string[] = [];
	for (let i = 0; i < replies; i++) {
		const d = Reply.Reply.random();
		const id = randomUUID();
		const parentId =
			Math.random() < 0.4 && replyIds.length > 0
				? replyIds[Math.floor(Math.random() * replyIds.length)]
				: null;
		replyRows.push([
			id,
			d.created_at,
			threadIds[Math.floor(Math.random() * threadIds.length)],
			userIds[Math.floor(Math.random() * userIds.length)],
			parentId,
			d.body.slice(0, 500),
		]);
		replyIds.push(id);
	}
	await client.unsafe(
		`INSERT OR REPLACE INTO "replies" (${replyCols.map((c) => `"${c}"`).join(",")}) VALUES ` +
			replyRows.map((r) => rowSql(r)).join(",\n"),
	);

	// ------------------------------------------------------------------
	// 5. Posts — stamp id, authorId (FK), author (nested JSON), contentHash.
	//    The `author` column holds the JSON-encoded nested user (denormalised
	//    copy, matching `toRow`'s serialisation), and `authorId` the FK.
	// ------------------------------------------------------------------
	console.log(`Seeding ${posts} posts …`);
	const postRows: unknown[][] = [];
	const postCols = [
		"id",
		"created_at",
		"updated_at",
		"title",
		"body",
		"author",
		"authorId",
		"contentHash",
		"published",
	];
	// Denormalised author snapshot — the SAME shape `fromRow`/`toRow` use:
	// the full user row (id, name, email, role, age, created_at).
	const authorRows = (await client.unsafe(
		`SELECT id, name, email, role, age, "created_at" FROM "users"`,
	)) as Record<string, unknown>[];
	for (let i = 0; i < posts; i++) {
		const d = Post.Post.random();
		const author = authorRows[Math.floor(Math.random() * authorRows.length)];
		const body = d.body.slice(0, 1000);
		postRows.push([
			randomUUID(),
			d.created_at,
			d.updated_at,
			d.title.slice(0, 200),
			body,
			JSON.stringify(author),
			author.id,
			hashContent(body),
			Math.random() < 0.9, // ~90% published
		]);
	}
	await client.unsafe(
		`INSERT OR REPLACE INTO "posts" (${postCols.map((c) => `"${c}"`).join(",")}) VALUES ` +
			postRows.map((r) => rowSql(r)).join(",\n"),
	);

	// ------------------------------------------------------------------
	// Summary
	// ------------------------------------------------------------------
	const countsNow = await client.unsafe(
		`SELECT (SELECT COUNT(*) FROM "users") u, (SELECT COUNT(*) FROM "boards") b, ` +
			`(SELECT COUNT(*) FROM "threads") t, (SELECT COUNT(*) FROM "replies") r, ` +
			`(SELECT COUNT(*) FROM "posts") p`,
	);
	const c = countsNow[0];
	console.log(
		`\nDone. DB now has: ${c.u} users, ${c.b} boards, ${c.t} threads, ` +
			`${c.r} replies, ${c.p} posts.`,
	);
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
