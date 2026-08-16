import { drizzle } from 'drizzle-orm/d1'
import { createApp } from 'honox/server'
import { createAuth } from '../src/auth'
import { authEnvFromBindings } from '../src/auth/hono'
import { buildQueryApp } from '../src/http/app'

/**
 * Honox UI server entry — CLOUDFLARE WORKERS variant.
 *
 * Mirrors `app/server.ts` but targets the Workers runtime with a D1 database:
 * the SSR routes read data over HTTP through the JSON query app (mounted under
 * `/api`), which binds a lazy D1-backed executor per request (the D1 binding
 * `env.DB` is only available per-request, so the executor is (re)bound on
 * every request).
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

/**
 * D1 database bound lazily per-request. Drizzle's D1 driver needs the concrete
 * `D1Database`, but the binding is only available inside a request handler, so
 * this facade forwards `prepare` / `exec` / `batch` to whatever `env.DB` the
 * current request bound. `drizzle(lazyD1)` then wraps it and is handed to
 * `buildQueryApp` — so the service layer + generated CRUD run through Drizzle
 * (no `unsafe`) on Cloudflare too.
 */
class LazyD1Database {
	private db: D1Database | null = null

	/** Bind the current request's D1 database. */
	setDb(db: D1Database) {
		this.db = db
	}

	private get current(): D1Database {
		if (!this.db) {
			throw new Error('LazyD1Database: no D1 binding on this request')
		}
		return this.db
	}

	prepare(query: string): D1PreparedStatement {
		return this.current.prepare(query)
	}
	exec(query: string): Promise<D1ExecResult> {
		return this.current.exec(query)
	}
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
		return this.current.batch(statements)
	}
}

const lazyD1 = new LazyD1Database()

const app = createApp({
	init(server) {
		// Bind the per-request D1 database to the shared facade used by the
		// service-layer query app (mounted under /api). SSR routes no longer
		// receive a `c.env.sql`; they reach the service layer only over HTTP.
		server.use('*', async (c, next) => {
			const db = (c.env as { DB?: D1Database }).DB
			if (db) lazyD1.setDb(db)
			await next()
		})

		// Better Auth — mounted BEFORE the query app's `/api` so `/api/auth/*`
		// routes to the auth handler. Per-request instance (env.DB + secrets).
		// `__BETTER_AUTH_ENABLED__` is a Vite `define` literal (Bun macros are
		// not understood by this Workers build), so `if (false)` here drops the
		// entire Better Auth subtree from the deployed bundle.
		if (__BETTER_AUTH_ENABLED__) {
			server.on(['GET', 'POST'], '/api/auth/*', async (c) => {
				const db = (c.env as { DB?: D1Database }).DB
				if (!db) return c.json({ error: 'auth: no D1 binding' }, 500)
				try {
					return await createAuth(
						drizzle(db),
						authEnvFromBindings(
							c.env as unknown as {
								BETTER_AUTH_URL?: string
								BETTER_AUTH_SECRET?: string
							},
						),
					).handler(c.req.raw)
				} catch (e) {
					// Surface the real error rather than letting it become an
					// opaque empty-body 500 from the Worker runtime. This makes
					// the cause visible both to the client (the island now
					// renders the message) and to a direct `curl`. Typical
					// culprits: a missing BETTER_AUTH_SECRET secret, or Better
					// Auth's D1 tables not having been migrated to prod.
					const message = e instanceof Error ? e.message : String(e)
					return c.json({ error: message }, 500)
				}
			})
		}

		// Mount the JSON query app under /api (same as local serve.ts). Wrap the
		// per-request D1 database in Drizzle so the service layer + generated
		// CRUD run through Drizzle's parameterised path (no `unsafe`).
		server.route('/api', buildQueryApp(drizzle(lazyD1)))
	},
})

export default app
