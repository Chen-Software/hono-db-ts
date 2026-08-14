import { drizzle } from 'drizzle-orm/d1'
import { createApp } from 'honox/server'
import { createAuth } from '../src/auth'
import { authEnvFromBindings } from '../src/auth/hono'
import { betterAuthEnabled } from '../src/macros/envs' with { type: 'macro' }
import { buildQueryApp } from '../src/http/app'
import type { SqlQueryExecutor } from '../src/capacities/servable'
import { D1Executor } from '../src/worker/d1'

/**
 * Honox UI server entry — CLOUDFLARE WORKERS variant.
 *
 * Mirrors `app/server.ts` but targets the Workers runtime with a D1 database:
 * the SSR routes read data through `c.env.sql`, which is provided by the
 * middleware below as a lazy D1-backed executor (the D1 binding `env.DB` is
 * only available per-request, so the executor is (re)bound on every request).
 *
 * The JSON query app (`buildQueryApp`) is mounted under `/api` — the same
 * `app.route('/api', …)` prefix the local `scripts/serve.ts` uses — so the
 * deployed worker serves the UI at `/` AND the API at `/api/...`.
 *
 * Better Auth (`/api/auth/*`) is OPTIONAL and per-request: the D1 binding
 * (`env.DB`) and secrets (`env.BETTER_AUTH_*`) are only available inside a
 * request handler, so the auth instance is built per request exactly like the
 * Hono reference example. `betterAuthEnabled()` is a Bun macro — with
 * `BETTER_AUTH_ENABLED=false` at build time it inlines to `false` and the
 * `if` block below (plus the module-scope auth imports it references) is
 * dead-code-eliminated.
 *
 * Build with `vite build -c vite.ui.cf.config.ts` → `dist/ui-cf/index.js`,
 * which `wrangler.jsonc` points its `main` at.
 */

/** D1 executor bound lazily per-request (env.DB is not available at app init). */
class LazyD1Executor implements SqlQueryExecutor {
	private db: D1Database | null = null

	/** Bind the current request's D1 database. */
	setDb(db: D1Database) {
		this.db = db
	}

	unsafe(sql: string, params: unknown[] = []): Promise<unknown[]> {
		if (!this.db) {
			return Promise.resolve([])
		}
		return new D1Executor(this.db).unsafe(sql, params)
	}
}

const lazyExecutor = new LazyD1Executor()

const app = createApp({
	init(server) {
		// Expose the D1-backed executor to SSR routes as `c.env.sql`.
		server.use('*', async (c, next) => {
			const db = (c.env as { DB?: D1Database }).DB
			if (db) {
				lazyExecutor.setDb(db)
				// The UI reads `c.env.sql` (typed as bun's SQL); D1Executor satisfies
				// the same `unsafe(sql, params)` shape at runtime.
				;(c.env as Record<string, unknown>).sql = lazyExecutor
			}
			await next()
		})

		// Better Auth — mounted BEFORE the query app's `/api` so `/api/auth/*`
		// routes to the auth handler. Per-request instance (env.DB + secrets).
		if (betterAuthEnabled()) {
			server.on(['GET', 'POST'], '/api/auth/*', (c) => {
				const db = (c.env as { DB?: D1Database }).DB
				if (!db) return c.json({ error: 'auth: no D1 binding' }, 500)
				return createAuth(
					drizzle(db),
					authEnvFromBindings(
						c.env as unknown as {
							BETTER_AUTH_URL?: string
							BETTER_AUTH_SECRET?: string
						},
					),
				).handler(c.req.raw)
			})
		}

		// Mount the JSON query app under /api (same as local serve.ts).
		server.route('/api', buildQueryApp(lazyExecutor))
	},
})

export default app
