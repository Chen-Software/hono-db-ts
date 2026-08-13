/**
 * serve — a local Hono HTTP server exposing the good BBS queries.
 *
 *     bun run scripts/serve.ts [port]     (default :8787)
 *
 * Every endpoint queries the SAME database the CLI `query` command and the
 * `db:migrate`/`db:seed` pipeline use, through the derived drizzle tables
 * (`drizzle-orm/bun-sql` + `databaseUrl()` macro + `new SQL` client, exactly
 * like the app). Response shape is `{ ok: true, data }` or
 * `{ ok: false, data: { error } }`.
 *
 * The routing is a `hono` app (`import { Hono } from "hono"`), so `app.fetch`
 * is the `Bun.serve` handler here and doubles as an in-process dispatch point
 * (the same shape `LocalTransport` in `src/services/transport.ts` consumes).
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
import { Hono } from "hono";

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

/** UUID path segment — the `:id` params match the id shape every table uses. */
const UUID = "[0-9a-f-]{36}";

// ---------------------------------------------------------------------------
// JSON responders — Hono handlers may return any Response, so these keep the
// exact `{ ok, data }` wire shape (pretty-printed) the server always used.
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

function num(v: string | null | undefined, def: number): number {
	const n = v == null ? NaN : Number.parseInt(v, 10);
	return Number.isFinite(n) && n > 0 ? n : def;
}

/** Keyset cursor helper: `WHERE sortKey < cursor ORDER BY sortKey DESC LIMIT n`. */
function cursorWhere(
	col: string,
	cursor: string | null | undefined,
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

const app = new Hono();

// GET /stats
app.get("/stats", async () => {
	const rows = await client.unsafe(
		`SELECT (SELECT COUNT(*) FROM "users") AS users,
		        (SELECT COUNT(*) FROM "boards") AS boards,
		        (SELECT COUNT(*) FROM "threads") AS threads,
		        (SELECT COUNT(*) FROM "replies") AS replies,
		        (SELECT COUNT(*) FROM "posts") AS posts`,
	);
	return json(rows[0]);
});

// GET /boards?limit=&cursor=
app.get("/boards", async (c) => {
	const limit = num(c.req.query("limit"), 25);
	const cursor = c.req.query("cursor");
	const where = cursorWhere('"created_at"', cursor);
	const q = `SELECT * FROM "boards" ${where ? `WHERE ${where}` : ""} ORDER BY ${cursorOrder('"created_at"')} LIMIT ${limit}`;
	const rows = await fetchAll(q);
	const nextCursor =
		rows.length === limit ? rows[rows.length - 1].created_at : null;
	return json({ rows, nextCursor });
});

// GET /boards/:id
app.get(`/boards/:id{${UUID}}`, async (c) => {
	const id = c.req.param("id");
	const board = (await fetchAll(`SELECT * FROM "boards" WHERE "id" = ?`, [id]))[0];
	if (!board) return fail("board not found", 404);
	const moderator = (await fetchAll(`SELECT id, name, email FROM "users" WHERE "id" = ?`, [board.moderatorId]))[0] ?? null;
	return json({ ...board, moderator });
});

// GET /boards/:id/threads?limit=&cursor=&pinned=
app.get(`/boards/:id{${UUID}}/threads`, async (c) => {
	const id = c.req.param("id");
	const limit = num(c.req.query("limit"), 25);
	const cursor = c.req.query("cursor");
	const pinned = c.req.query("pinned");
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
});

// GET /boards/:id/hot?limit= — hottest threads: most replies, weighted by recency
app.get(`/boards/:id{${UUID}}/hot`, async (c) => {
	const id = c.req.param("id");
	const limit = num(c.req.query("limit"), 10);
	const q =
		`SELECT t.id, t.title, t.boardId, t.authorId, t.pinned, t.updated_at, ` +
		`COUNT(r.id) AS reply_count ` +
		`FROM "threads" t LEFT JOIN "replies" r ON r."threadId" = t.id ` +
		`WHERE t."boardId" = '${id}' ` +
		`GROUP BY t.id ORDER BY reply_count DESC, t."updated_at" DESC LIMIT ${limit}`;
	return json(await fetchAll(q));
});

// GET /threads/:id
app.get(`/threads/:id{${UUID}}`, async (c) => {
	const id = c.req.param("id");
	const thread = (await fetchAll(`SELECT * FROM "threads" WHERE "id" = ?`, [id]))[0];
	if (!thread) return fail("thread not found", 404);
	const author = (await fetchAll(`SELECT id, name, email FROM "users" WHERE "id" = ?`, [thread.authorId]))[0] ?? null;
	const board = (await fetchAll(`SELECT id, name, slug FROM "boards" WHERE "id" = ?`, [thread.boardId]))[0] ?? null;
	const replyCount = (await fetchAll(`SELECT COUNT(*) AS n FROM "replies" WHERE "threadId" = ?`, [id]))[0].n;
	return json({ ...thread, author, board, replyCount });
});

// GET /threads/:id/replies?limit=&cursor= — oldest-first, tree preserved via parentId
app.get(`/threads/:id{${UUID}}/replies`, async (c) => {
	const id = c.req.param("id");
	const limit = num(c.req.query("limit"), 50);
	const cursor = c.req.query("cursor");
	// Qualify with `r.` — the join brings in `users.created_at` too.
	const cw = cursorWhere('r."created_at"', cursor, "asc");
	const q =
		`SELECT r.id, r."threadId", r."authorId", r."parentId", r.body, r."created_at", ` +
		`u.name AS author_name ` +
		`FROM "replies" r LEFT JOIN "users" u ON u.id = r."authorId" ` +
		`WHERE r."threadId" = '${id}' ${cw ? `AND ${cw}` : ""} ` +
		`ORDER BY ${cursorOrder('r."created_at"', "asc")} LIMIT ${limit}`;
	const rows = await fetchAll(q);
	const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
	return json({ rows, nextCursor });
});

// GET /users/:id
app.get(`/users/:id{${UUID}}`, async (c) => {
	const id = c.req.param("id");
	const user = (await fetchAll(`SELECT id, name, email, role, age, "created_at" FROM "users" WHERE "id" = ?`, [id]))[0];
	if (!user) return fail("user not found", 404);
	return json(user);
});

// GET /users/:id/threads?limit=
app.get(`/users/:id{${UUID}}/threads`, async (c) => {
	const id = c.req.param("id");
	const limit = num(c.req.query("limit"), 50);
	const rows = await fetchAll(
		`SELECT * FROM "threads" WHERE "authorId" = ? ORDER BY "updated_at" DESC LIMIT ?`,
		[id, limit],
	);
	return json(rows);
});

// GET /users/:id/posts?limit= — the "latest posts" question at the SQL layer
app.get(`/users/:id{${UUID}}/posts`, async (c) => {
	const id = c.req.param("id");
	const limit = num(c.req.query("limit"), 50);
	const rows = await fetchAll(
		`SELECT id, title, body, "authorId", "contentHash", published, "created_at", "updated_at" ` +
		`FROM "posts" WHERE "authorId" = ? AND published = 1 ` +
		`ORDER BY "updated_at" DESC LIMIT ?`,
		[id, limit],
	);
	return json(rows);
});

// GET /users/:id/replies?limit=
app.get(`/users/:id{${UUID}}/replies`, async (c) => {
	const id = c.req.param("id");
	const limit = num(c.req.query("limit"), 50);
	const rows = await fetchAll(
		`SELECT r.id, r."threadId", r.body, r."created_at", t.title AS thread_title ` +
		`FROM "replies" r LEFT JOIN "threads" t ON t.id = r."threadId" ` +
		`WHERE r."authorId" = ? ORDER BY r."created_at" DESC LIMIT ?`,
		[id, limit],
	);
	return json(rows);
});

// GET /search?q=&limit= — substring search over thread titles + post titles
app.get("/search", async (c) => {
	const q = c.req.query("q") ?? "";
	if (!q) return fail("search requires ?q=");
	const limit = num(c.req.query("limit"), 20);
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
});

// GET /latest-posts — globally latest published posts (the "latest posts" feed)
app.get("/latest-posts", async (c) => {
	const limit = num(c.req.query("limit"), 20);
	const rows = await fetchAll(
		`SELECT p.id, p.title, p.body, p."authorId", p."contentHash", p."created_at", p."updated_at", ` +
		`u.name AS author_name ` +
		`FROM "posts" p LEFT JOIN "users" u ON u.id = p."authorId" ` +
		`WHERE p.published = 1 ORDER BY p."updated_at" DESC LIMIT ?`,
		[limit],
	);
	return json(rows);
});

// Anything unmatched — the same 404 the regex fallback produced.
app.notFound((c) => fail(`no route for ${c.req.method} ${c.req.path}`, 404));

const server = Bun.serve({
	port: Number(process.argv[2]) || 8787,
	fetch: app.fetch,
});

console.log(`BBS query server running on http://localhost:${server.port}`);
console.log("Try: /stats, /boards, /boards/:id/threads, /threads/:id/replies, /users/:id/posts, /search?q=, /latest-posts");
