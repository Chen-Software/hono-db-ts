import { SQL } from 'bun'
import { showRoutes } from 'hono/dev'
import { createApp } from 'honox/server'
import { buildQueryApp } from '../src/http/app'
import { resolveDatabaseTarget } from '../src/http/schema'
import { createQueryDb } from '@/db/client'
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
const target = rawUrl ? resolveDatabaseTarget(rawUrl, databaseType()) : null

// Optional Better Auth. It still seeds its schema through `sql.unsafe` on a
// Bun `SQL` client (legacy path); gated off by default via the build-time
// `BETTER_AUTH_ENABLED` define, so this block is dead-code-eliminated.
let sql: SQL | null = null

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
let authInstance: ReturnType<typeof import('../src/auth').createAuth> | null = null
// `__BETTER_AUTH_ENABLED__` is a Vite `define` literal (Bun macros are not
// understood by this UI build), so `if (false)` drops the Better Auth mount —
// and its better-auth + drizzle-adapter imports — from the bundle.
if (__BETTER_AUTH_ENABLED__ && target) {
	// Better Auth still seeds its schema through `sql.unsafe` on a Bun `SQL`
	// client (legacy path); off by default, so this is dead code in the build.
	sql = new SQL(target.url)
	const localAuth = await mountBetterAuth(sql)
	authMount = localAuth.mount
	authInstance = localAuth.instance
}

// Build the request-path Drizzle db. `createQueryDb` seeds the schema on the
// same libSQL client (via an `unsafe` adapter), so queries see the tables.
const db = target ? await createQueryDb(target) : null

const app = createApp({
	init(server) {
		// Better Auth first — `/api/auth/*` must win over the query app's `/api`.
		authMount(server)

		// Mount the JSON query API under /api (the honox UI routes render at /).
		// All SQL lives in the service layer mounted there; SSR routes reach it
		// only over HTTP (see app/lib/api.ts), never via a direct `c.env.sql`.
		// The db is a Drizzle SQLite database (libSQL driver) so the service
		// layer (and the generated CRUD capacities) run through Drizzle's
		// parameterised path — no `sql.unsafe` is reachable from the UI.
		if (db) server.route('/api', buildQueryApp(db, authInstance))

		// Expose the Better Auth instance to SSR routes via c.env.auth so they
		// can check sessions (see src/auth/context.ts — which never imports
		// bun:sql directly). No SQL client is provided to route handlers.
		server.use('*', async (c, next) => {
			;(c.env as { auth?: unknown }).auth = authInstance
			await next()
		})
	},
})

showRoutes(app)

export default app
