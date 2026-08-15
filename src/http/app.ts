/**
 * http/app — the reusable Hono query app (the "good BBS queries").
 *
 * Extracted from `scripts/serve.ts` so the SAME app can be mounted by both:
 *   - the local dev server  (`scripts/serve.ts` → `Bun.serve`),
 *   - the Cloudflare Worker (`src/worker.ts` → `export default { fetch }`).
 *
 * It is client-agnostic: it takes any SQL executor (Bun's `SQL`, or anything
 * exposing `unsafe(sql, params)`). All routing is `hono`; every handler reads
 * through the injected executor. Response shape is `{ ok, data }` /
 * `{ ok: false, data: { error } }`.
 *
 * Endpoints:
 *   GET /stats, /boards, /boards/:id, /boards/:id/threads, /boards/:id/hot,
 *   /threads/:id, /threads/:id/replies, /users/:id, /users/:id/threads,
 *   /users/:id/posts, /users/:id/replies, /search, /latest-posts
 */

import { Hono } from "hono";

import type { SqlQueryExecutor } from "@/capacities/servable";
import * as Models from "@/models";

/** UUID path segment — matches the id shape every table uses. */
const UUID = "[0-9a-f-]{36}";

/** `{ ok, data }` JSON responder (pretty-printed). */
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

/** Build the Hono query app bound to the given SQL executor. */
export function buildQueryApp(client: SqlQueryExecutor): Hono {
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
		const board = (
			await fetchAll(`SELECT * FROM "boards" WHERE "id" = ?`, [id])
		)[0];
		if (!board) return fail("board not found", 404);
		const moderator =
			(
				await fetchAll(`SELECT id, name, email FROM "users" WHERE "id" = ?`, [
					board.moderatorId,
				])
			)[0] ?? null;
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
		const thread = (
			await fetchAll(`SELECT * FROM "threads" WHERE "id" = ?`, [id])
		)[0];
		if (!thread) return fail("thread not found", 404);
		const author =
			(
				await fetchAll(`SELECT id, name, email FROM "users" WHERE "id" = ?`, [
					thread.authorId,
				])
			)[0] ?? null;
		const board =
			(
				await fetchAll(`SELECT id, name, slug FROM "boards" WHERE "id" = ?`, [
					thread.boardId,
				])
			)[0] ?? null;
		const replyCount = (
			await fetchAll(
				`SELECT COUNT(*) AS n FROM "replies" WHERE "threadId" = ?`,
				[id],
			)
		)[0].n;
		return json({ ...thread, author, board, replyCount });
	});

	// GET /threads/:id/replies?limit=&cursor= — oldest-first, tree via parentId
	app.get(`/threads/:id{${UUID}}/replies`, async (c) => {
		const id = c.req.param("id");
		const limit = num(c.req.query("limit"), 50);
		const cursor = c.req.query("cursor");
		const cw = cursorWhere('r."created_at"', cursor, "asc");
		const q =
			`SELECT r.id, r."threadId", r."authorId", r."parentId", r.body, r."created_at", ` +
			`u.name AS author_name ` +
			`FROM "replies" r LEFT JOIN "users" u ON u.id = r."authorId" ` +
			`WHERE r."threadId" = '${id}' ${cw ? `AND ${cw}` : ""} ` +
			`ORDER BY ${cursorOrder('r."created_at"', "asc")} LIMIT ${limit}`;
		const rows = await fetchAll(q);
		const nextCursor =
			rows.length === limit ? rows[rows.length - 1].created_at : null;
		return json({ rows, nextCursor });
	});

	// GET /users/:id
	app.get(`/users/:id{${UUID}}`, async (c) => {
		const id = c.req.param("id");
		const user = (
			await fetchAll(
				`SELECT id, name, email, role, age, "created_at" FROM "users" WHERE "id" = ?`,
				[id],
			)
		)[0];
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

	// GET /search?q=&limit= — substring search over thread + post titles
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

	// ------------------------------------------------------------------
	// Generated CRUD — every model that composes Servable contributes its
	// full per-model surface (GET list + GET byId + POST / PUT / DELETE)
	// here, so the app gets automatic CRUD (including Update) for free:
	//   User.serve   → /users        Board.serve  → /boards
	//   Thread.serve → /threads      Reply.serve  → /replies
	// The hand-written routes above stay for the JOIN-heavy "good queries"
	// (moderator / author+board+replyCount / hot / search / latest-posts).
	// Hono registers routes in order, so a hand-written route registered
	// before Model.serve wins for the same path+method — the rich by-id
	// reads keep their joins while the generic list / write routes fill
	// the rest. Thread.serve's DELETE cascades to replies.
	// ------------------------------------------------------------------

	// GET /latest-posts — globally latest published posts
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

	// Anything unmatched — 404.
	app.notFound((c) => fail(`no route for ${c.req.method} ${c.req.path}`, 404));

	// Generated per-model CRUD (GET list + GET byId + POST / PUT / DELETE).
	// Registered AFTER the hand-written rich queries, so the latter win on
	// identical path+method (Hono: first registration wins) — the generic
	// list routes (Queriable filters + keyset cursor) and the write routes
	// (which have no hand-written counterpart) take effect.
	(Models.User.User as any).serve(app, client);
	(Models.Board.Board as any).serve(app, client);
	(Models.Thread.Thread as any).serve(app, client);
	(Models.Reply.Reply as any).serve(app, client);

	return app;
}
