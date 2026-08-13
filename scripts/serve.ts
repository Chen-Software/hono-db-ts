/**
 * serve — a local HTTP server exposing the good BBS queries.
 *
 *     bun run scripts/serve.ts [port]     (default :8787)
 *
 * Every endpoint queries the SAME database the CLI `query` command and the
 * `db:migrate`/`db:seed` pipeline use, through the derived drizzle tables
 * (`drizzle-orm/bun-sql` + `databaseUrl()` macro + `new SQL` client, exactly
 * like the app). Response shape is `{ ok: true, data }` or `{ ok: false, error }`.
 *
 * Endpoints (the "good queries" for a BBS):
 *
 *   GET /boards?limit=&cursor=          — boards, created_at desc, cursor paged
 *   GET /boards/:id                     — board + its moderator (joined)
 *   GET /boards/:id/threads?limit=&cursor=&pinned= — threads in a board, updated_at desc
 *   GET /threads/:id/replies?limit=&cursor=        — replies oldest-first (+ parentId tree)
 *   GET /threads/:id                    — thread + author + reply count
 *   GET /users/:id                      — user
 *   GET /users/:id/threads              — threads authored by the user
 *   GET /users/:id/posts                — LATEST posts authored by the user
 *   GET /users/:id/replies              — replies authored by the user
 *   GET /boards/:id/hot?limit=          — hottest threads (most replies, recent)
 *   GET /search?q=&limit=               — threads/posts matching title/body substring
 *   GET /stats                          — row counts per table
 *
 * Cursor pagination: `cursor` is the opaque `updated_at`-style value from the
 * previous page's `nextCursor` (keyset semantics — same idea as the `Siftable`
 * capacity, expressed in SQL).
 */

import { SQL } from "bun";

import { databaseUrl } from "../src/macros/envs" with { type: "macro" };

import "@/models/user";
import "@/models/board";
import "@/models/thread";
import "@/models/reply";
import "@/models/post";

const url = databaseUrl();
if (!url) {
	console.error("serve: no DATABASE_URL — set it in .env or the shell.");
	process.exit(1);
}

const client = new SQL(url);

// ---------------------------------------------------------------------------
// Tiny JSON responder helpers
// ---------------------------------------------------------------------------
function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ ok: status < 400, data }, null, 2), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

function fail(message: string, status = 400): Response {
	return json({ error: message }, status);
}

function num(v: string | null, def: number): number {
	const n = v == null ? NaN : Number.parseInt(v, 10);
	return Number.isFinite(n) && n > 0 ? n : def;
}

/** Keyset cursor helper: `WHERE sortKey < cursor ORDER BY sortKey DESC LIMIT n`. */
function cursorWhere(
	col: string,
	cursor: string | null,
	dir: "asc" | "desc" = "desc",
): string {
	if (!cursor) return "";
	const op = dir === "desc" ? "<" : ">";
	return `${col} ${op} '${cursor.replace(/'/g, "''")}'`;
}

function cursorOrder(col: string, dir: "asc" | "desc" = "desc"): string {
	return `${col} ${dir === "desc" ? "DESC" : "ASC"}`;
}

/** Parameterized query against the raw Bun SQL client (safe `?` binding). */
async function fetchAll(q: string, params: unknown[] = []): Promise<any[]> {
	return client.unsafe(q, params) as Promise<any[]>;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const routes: Array<[RegExp, (m: RegExpMatchArray, u: URL) => Promise<Response>]> = [
	// GET /stats
	[
		/^\/stats$/,
		async () => {
			const rows = await client.unsafe(
				`SELECT (SELECT COUNT(*) FROM "users") AS users,
				        (SELECT COUNT(*) FROM "boards") AS boards,
				        (SELECT COUNT(*) FROM "threads") AS threads,
				        (SELECT COUNT(*) FROM "replies") AS replies,
				        (SELECT COUNT(*) FROM "posts") AS posts`,
			);
			return json(rows[0]);
		},
	],

	// GET /boards?limit=&cursor=
	[
		/^\/boards$/,
		async (_m, u) => {
			const limit = num(u.searchParams.get("limit"), 25);
			const cursor = u.searchParams.get("cursor");
			const where = cursorWhere('"created_at"', cursor);
			const q = `SELECT * FROM "boards" ${where ? `WHERE ${where}` : ""} ORDER BY ${cursorOrder('"created_at"')} LIMIT ${limit}`;
			const rows = await fetchAll(q);
			const nextCursor =
				rows.length === limit ? rows[rows.length - 1].created_at : null;
			return json({ rows, nextCursor });
		},
	],

	// GET /boards/:id
	[
		/^\/boards\/([0-9a-f-]{36})$/,
		async (m) => {
			const id = m[1];
			const board = (await fetchAll(`SELECT * FROM "boards" WHERE "id" = ?`, [id]))[0];
			if (!board) return fail("board not found", 404);
			const moderator = (await fetchAll(`SELECT id, name, email FROM "users" WHERE "id" = ?`, [board.moderatorId]))[0] ?? null;
			return json({ ...board, moderator });
		},
	],

	// GET /boards/:id/threads?limit=&cursor=&pinned=
	[
		/^\/boards\/([0-9a-f-]{36})\/threads$/,
		async (m, u) => {
			const id = m[1];
			const limit = num(u.searchParams.get("limit"), 25);
			const cursor = u.searchParams.get("cursor");
			const pinned = u.searchParams.get("pinned");
			const conds = [`"boardId" = '${id}'`];
			if (pinned === "true") conds.push(`"pinned" = 1`);
			if (pinned === "false") conds.push(`"pinned" = 0`);
			const cw = cursorWhere('"updated_at"', cursor);
			if (cw) conds.push(cw);
			const q = `SELECT * FROM "threads" WHERE ${conds.join(" AND ")} ORDER BY ${cursorOrder('"updated_at"')} LIMIT ${limit}`;
			const rows = await fetchAll(q);
			const nextCursor =
				rows.length === limit ? rows[rows.length - 1].updated_at : null;
			return json({ rows, nextCursor });
		},
	],

	// GET /boards/:id/hot?limit= — hottest threads: most replies, weighted by recency
	[
		/^\/boards\/([0-9a-f-]{36})\/hot$/,
		async (m, u) => {
			const id = m[1];
			const limit = num(u.searchParams.get("limit"), 10);
			const q =
				`SELECT t.id, t.title, t.boardId, t.authorId, t.pinned, t.updated_at, ` +
				`COUNT(r.id) AS reply_count ` +
				`FROM "threads" t LEFT JOIN "replies" r ON r."threadId" = t.id ` +
				`WHERE t."boardId" = '${id}' ` +
				`GROUP BY t.id ORDER BY reply_count DESC, t."updated_at" DESC LIMIT ${limit}`;
			return json(await fetchAll(q));
		},
	],

	// GET /threads/:id
	[
		/^\/threads\/([0-9a-f-]{36})$/,
		async (m) => {
			const id = m[1];
			const thread = (await fetchAll(`SELECT * FROM "threads" WHERE "id" = ?`, [id]))[0];
			if (!thread) return fail("thread not found", 404);
			const author = (await fetchAll(`SELECT id, name, email FROM "users" WHERE "id" = ?`, [thread.authorId]))[0] ?? null;
			const board = (await fetchAll(`SELECT id, name, slug FROM "boards" WHERE "id" = ?`, [thread.boardId]))[0] ?? null;
			const replyCount = (await fetchAll(`SELECT COUNT(*) AS n FROM "replies" WHERE "threadId" = ?`, [id]))[0].n;
			return json({ ...thread, author, board, replyCount });
		},
	],

	// GET /threads/:id/replies?limit=&cursor= — oldest-first, tree preserved via parentId
	[
		/^\/threads\/([0-9a-f-]{36})\/replies$/,
		async (m, u) => {
			const id = m[1];
			const limit = num(u.searchParams.get("limit"), 50);
			const cursor = u.searchParams.get("cursor");
			const cw = cursorWhere('"created_at"', cursor, "asc");
			const q =
				`SELECT r.id, r."threadId", r."authorId", r."parentId", r.body, r."created_at", ` +
				`u.name AS author_name ` +
				`FROM "replies" r LEFT JOIN "users" u ON u.id = r."authorId" ` +
				`WHERE r."threadId" = '${id}' ${cw ? `AND ${cw}` : ""} ` +
				`ORDER BY ${cursorOrder('"created_at"', "asc")} LIMIT ${limit}`;
			const rows = await fetchAll(q);
			const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
			return json({ rows, nextCursor });
		},
	],

	// GET /users/:id
	[
		/^\/users\/([0-9a-f-]{36})$/,
		async (m) => {
			const id = m[1];
			const user = (await fetchAll(`SELECT id, name, email, role, age, "created_at" FROM "users" WHERE "id" = ?`, [id]))[0];
			if (!user) return fail("user not found", 404);
			return json(user);
		},
	],

	// GET /users/:id/threads
	[
		/^\/users\/([0-9a-f-]{36})\/threads$/,
		async (m) => {
			const id = m[1];
			const rows = await fetchAll(
				`SELECT * FROM "threads" WHERE "authorId" = ? ORDER BY "updated_at" DESC LIMIT 50`,
				[id],
			);
			return json(rows);
		},
	],

	// GET /users/:id/posts — the "latest posts" question at the SQL layer
	[
		/^\/users\/([0-9a-f-]{36})\/posts$/,
		async (m) => {
			const id = m[1];
			const rows = await fetchAll(
				`SELECT id, title, body, "authorId", "contentHash", published, "created_at", "updated_at" ` +
				`FROM "posts" WHERE "authorId" = ? AND published = 1 ` +
				`ORDER BY "updated_at" DESC LIMIT 50`,
				[id],
			);
			return json(rows);
		},
	],

	// GET /users/:id/replies
	[
		/^\/users\/([0-9a-f-]{36})\/replies$/,
		async (m) => {
			const id = m[1];
			const rows = await fetchAll(
				`SELECT r.id, r."threadId", r.body, r."created_at", t.title AS thread_title ` +
				`FROM "replies" r LEFT JOIN "threads" t ON t.id = r."threadId" ` +
				`WHERE r."authorId" = ? ORDER BY r."created_at" DESC LIMIT 50`,
				[id],
			);
			return json(rows);
		},
	],

	// GET /search?q=&limit= — substring search over thread titles + post titles
	[
		/^\/search$/,
		async (_m, u) => {
			const q = u.searchParams.get("q") ?? "";
			if (!q) return fail("search requires ?q=");
			const limit = num(u.searchParams.get("limit"), 20);
			const like = `%${q.replace(/%/g, "\\%")}%`;
			const threads = await fetchAll(
				`SELECT id, title, "boardId", "authorId", "updated_at" FROM "threads" WHERE title LIKE ? ESCAPE '\\' ORDER BY "updated_at" DESC LIMIT ?`,
				[like, limit],
			);
			const posts = await fetchAll(
				`SELECT id, title, "authorId", "updated_at" FROM "posts" WHERE title LIKE ? ESCAPE '\\' ORDER BY "updated_at" DESC LIMIT ?`,
				[like, limit],
			);
			return json({ threads, posts });
		},
	],

	// GET /latest-posts — globally latest published posts (the "latest posts" feed)
	[
		/^\/latest-posts$/,
		async (_m, u) => {
			const limit = num(u.searchParams.get("limit"), 20);
			const rows = await fetchAll(
				`SELECT p.id, p.title, p.body, p."authorId", p."contentHash", p."created_at", p."updated_at", ` +
				`u.name AS author_name ` +
				`FROM "posts" p LEFT JOIN "users" u ON u.id = p."authorId" ` +
				`WHERE p.published = 1 ORDER BY p."updated_at" DESC LIMIT ?`,
				[limit],
			);
			return json(rows);
		},
	],
];

const server = Bun.serve({
	port: Number(process.argv[2]) || 8787,
	fetch(req) {
		const u = new URL(req.url);
		for (const [re, handler] of routes) {
			const m = u.pathname.match(re);
			if (m) return handler(m, u);
		}
		return fail(`no route for ${req.method} ${u.pathname}`, 404);
	},
});

console.log(`BBS query server running on http://localhost:${server.port}`);
console.log("Try: /stats, /boards, /boards/:id/threads, /threads/:id/replies, /users/:id/posts, /search?q=, /latest-posts");
