/**
 * serve — a local Hono HTTP server exposing the good BBS queries.
 *
 *     bun run scripts/serve.ts [port]     (default :8787)
 *
 * The Hono app lives in `src/http/app.ts` (`buildQueryApp`) and is reused by
 * the Cloudflare Worker (`src/worker.ts`); this script just binds it to a
 * `bun:sqlite` client and serves it with `Bun.serve`. Every endpoint queries
 * the SAME database the CLI `query` command and the `db:migrate`/`db:seed`
 * pipeline use, through the derived drizzle tables (`drizzle-orm/bun-sql` +
 * `databaseUrl()` macro + `new SQL` client, exactly like the app). Response
 * shape is `{ ok: true, data }` or `{ ok: false, data: { error } }`.
 *
 * Zero-setup: if the target database has no tables (a fresh `:memory:` DB or
 * an empty file DB), the generated migration SQL from `drizzle/*.sql` is
 * applied at startup (see `src/http/schema.ts`). Existing data is preserved.
 *
 * Endpoints (the "good queries" for a BBS): /stats, /boards, /boards/:id,
 * /boards/:id/threads, /boards/:id/hot, /threads/:id, /threads/:id/replies,
 * /users/:id, /users/:id/threads, /users/:id/posts, /users/:id/replies,
 * /search, /latest-posts.
 */

import { SQL } from "bun";

import { databaseUrl } from "../src/macros/envs" with { type: "macro" };
import { buildQueryApp } from "../src/http/app";
import { ensureSchema, normalizeDatabaseUrl } from "../src/http/schema";

const url = normalizeDatabaseUrl(databaseUrl() ?? "");
if (!url) {
	console.error("serve: no DATABASE_URL — set it in .env or the shell.");
	process.exit(1);
}

const client = new SQL(url);

// Zero-setup: create the schema when the DB is empty (fresh :memory: or a new
// file DB). Existing databases are left untouched.
const created = await ensureSchema(client);
if (created) {
	console.log(
		`serve: database had no schema — applied ${"drizzle/*.sql"} from the generated migrations.`,
	);
}

const app = buildQueryApp(client);

const server = Bun.serve({
	port: Number(process.argv[2]) || 8787,
	fetch: app.fetch,
});

console.log(`BBS query server running on http://localhost:${server.port}`);
console.log("Try: /stats, /boards, /boards/:id/threads, /threads/:id/replies, /users/:id/posts, /search?q=, /latest-posts");
