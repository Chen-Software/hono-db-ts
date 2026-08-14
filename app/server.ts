import { SQL } from 'bun'
import { showRoutes } from 'hono/dev'
import { createApp } from 'honox/server'
import { buildQueryApp } from '../src/http/app'
import { ensureSchema, resolveDatabaseTarget } from '../src/http/schema'
import { databaseType, databaseUrl } from '../src/macros/envs' with { type: 'macro' }

/**
 * Honox server entry — the UI app.
 *
 * `createApp()` wires the file-system routes under `app/routes` (SSR) plus the
 * islands, and the `init` hook runs once at app construction:
 *
 *   1. opens the SAME SQL database the CLI / `serve.ts` / Worker use
 *      (`DATABASE_URL` via the `databaseUrl()` macro; zero-setup schema from
 *      `drizzle/*.sql` when the target is empty),
 *   2. exposes it to route handlers as `c.env.sql` so SSR pages can query,
 *   3. mounts the JSON query app (`buildQueryApp`) under `/api` so pages (and
 *      the browser) can call the "good BBS queries" at `/api/...`.
 *   4. (optional) mounts Better Auth under `/api/auth` when `BETTER_AUTH_ENABLED`
 *      isn't `false` — see the DCE note below.
 *
 * `serve.ts` (the `bun run src/main.ts serve` command) imports THIS built app
 * and serves it alongside the standalone JSON server on the same port.
 */
const rawUrl = databaseUrl() ?? ''
if (!rawUrl) {
	console.error('[app/server] no DATABASE_URL — set it in .env or the shell.')
}

const sql = rawUrl
	? new SQL(resolveDatabaseTarget(rawUrl, databaseType()).url)
	: null

// Zero-setup: create the schema when the target DB is empty.
if (sql) {
	const created = await ensureSchema(sql)
	if (created) {
		console.log(
			'[app/server] database had no schema — applied drizzle/*.sql from the generated migrations.',
		)
	}
}

// ---------------------------------------------------------------------------
// Better Auth — OPTIONAL. `betterAuthEnabled()` is a Bun macro: with
// `BETTER_AUTH_ENABLED=false` at build time it inlines to `false`, so this
// whole block (and the `mountBetterAuthOnApp` import it references) is
// dead-code-eliminated — the better-auth + drizzle-adapter bundle is dropped.
//
// The async setup (idempotent auth schema + auth instance) happens at module
// scope because honox's `init` callback is synchronous; the built instance is
// then just mounted inside `init`.
// ---------------------------------------------------------------------------
import { mountBetterAuth } from '../src/auth/mount'
let authMount: (server: import('hono').Hono<import('hono').Env>) => void = () => {}
// `__BETTER_AUTH_ENABLED__` is a Vite `define` literal (Bun macros are not
// understood by this UI build), so `if (false)` drops the Better Auth mount —
// and its better-auth + drizzle-adapter imports — from the bundle.
if (__BETTER_AUTH_ENABLED__ && sql) {
	authMount = await mountBetterAuth(sql)
}

const app = createApp({
	init(server) {
		// Better Auth first — `/api/auth/*` must win over the query app's `/api`.
		authMount(server)

		// Mount the JSON query API under /api (the honox UI routes render at /).
		if (sql) server.route('/api', buildQueryApp(sql))

		// Provide the SQL client to route handlers via c.env.sql.
		server.use('*', async (c, next) => {
			c.env.sql = sql
			await next()
		})
	},
})

showRoutes(app)

export default app
