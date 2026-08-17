import { drizzle } from 'drizzle-orm/d1'
import { createApp } from 'honox/server'
import { createAuth } from '../src/auth'
import { authEnvFromBindings } from '../src/auth/hono'
import { buildQueryApp } from '../src/http/app'
import { r2GitBackend } from '../src/git/backend'
import { mountGitRoutes } from '../src/git/routes'
import { handleQueueBatch, type QueueBatchLike } from '../src/worker/queue'
import type { R2Like } from '../src/git/fs-r2'
import type { Db } from '../src/services/types'

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
 * Git: the R2 bucket (`env.REPOS`) and the queue (`env.CODE_FORGE_QUEUE`) are
 * also per-request bindings, so this entry uses the same lazy-facade trick as
 * `LazyD1Database`: the git backend (`r2GitBackend`) and the `repo.push` queue
 * sink are constructed ONCE at module scope against facades that forward to
 * whatever `env.REPOS` / `env.CODE_FORGE_QUEUE` the current request bound.
 * The git smart-HTTP transport is mounted at the ROOT (`/:owner/:repo.git/…`),
 * matching `src/worker/d1.ts` — so `git push`/`git clone` against the deployed
 * worker reach real git objects in R2.
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

/**
 * R2 bucket bound lazily per-request — the same idea as `LazyD1Database`. The
 * git object backend (`r2GitBackend`) is built once at module scope against
 * this facade; each request binds its own `env.REPOS` before the git routes
 * (or the git read endpoints under `/api`) run.
 */
class LazyR2Bucket {
	private bucket: R2Like | null = null

	setBucket(bucket: R2Like) {
		this.bucket = bucket
	}

	private get current(): R2Like {
		if (!this.bucket) {
			throw new Error('LazyR2Bucket: no REPOS binding on this request')
		}
		return this.bucket
	}

	head(key: string) {
		return this.current.head(key)
	}
	get(key: string) {
		return this.current.get(key)
	}
	put(key: string, value: Uint8Array | string | ArrayBuffer) {
		return this.current.put(key, value)
	}
	delete(key: string) {
		return this.current.delete(key)
	}
	list(opts: {
		prefix?: string
		delimiter?: string
		cursor?: string
		limit?: number
	}) {
		return this.current.list(opts)
	}
}

/**
 * Queue sink bound lazily per-request. `mountGitRoutes` sends `repo.push`
 * actions to it after a successful push; if the current request has no
 * `CODE_FORGE_QUEUE` binding the send is a no-op (push never fails on queue
 * unavailability — the route already tolerates a missing queue).
 */
class LazyGitQueue {
	private queue: { send(msg: unknown): Promise<void> } | null = null

	setQueue(queue: { send(msg: unknown): Promise<void> }) {
		this.queue = queue
	}

	send(msg: unknown): Promise<void> | void {
		return this.queue?.send(msg)
	}
}

const lazyD1 = new LazyD1Database()
const lazyR2 = new LazyR2Bucket()
const lazyQueue = new LazyGitQueue()

// The git object backend + `repo.push` sink, built ONCE against the lazy
// facades (the real bindings are per-request).
const gitBackend = r2GitBackend(lazyR2)

const app = createApp({
	init(server) {
		// Bind the per-request D1 database / R2 bucket / queue to the shared
		// facades used by the service-layer query app (under /api) and the git
		// transport (at the root). SSR routes no longer receive a `c.env.sql`;
		// they reach the service layer only over HTTP.
		server.use('*', async (c, next) => {
			const env = c.env as { DB?: D1Database; REPOS?: R2Like; CODE_FORGE_QUEUE?: { send(msg: unknown): Promise<void> } }
			if (env.DB) lazyD1.setDb(env.DB)
			if (env.REPOS) lazyR2.setBucket(env.REPOS)
			if (env.CODE_FORGE_QUEUE) lazyQueue.setQueue(env.CODE_FORGE_QUEUE)
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
		// CRUD run through Drizzle's parameterised path (no `unsafe`). Pass the
		// git backend so the git READ endpoints (/tree, /read, /commits) work.
		const db = drizzle(lazyD1) as Db
		server.route('/api', buildQueryApp(db, undefined, gitBackend))

		// Git smart-HTTP transport at the ROOT (/owner/repo.git/...), exactly
		// like `src/worker/d1.ts` — this is what makes push/pull work against
		// the deployed worker.
		mountGitRoutes(server, {
			db,
			gitBackend,
			queue: lazyQueue,
		})
	},
})

// Cloudflare Queues CONSUMER — the honox `@hono/vite-build/cloudflare-workers`
// adapter collects every enumerable own property of the default export EXCEPT
// `fetch` and merges it into the worker's platform export
// (`export default { ...merged, fetch: app.fetch }`), so attaching `app.queue`
// wires the same `repo.push` / `ci.run` consumer `src/worker.ts` used to. The
// per-request bindings are not available here — the queue handler reaches D1
// via `drizzle(lazyD1)` (same lazy facade as the fetch path) and measures repo
// size by listing the R2 gitdir prefix through `lazyR2` (no fs walk).
const queueDb = drizzle(lazyD1) as Db
;(app as Record<string, unknown>).queue = (batch: QueueBatchLike): Promise<void> =>
	handleQueueBatch(batch, {
		db: queueDb,
		log: (...args: unknown[]) => console.log('[queue]', ...args),
		measureRepoSize: async (owner, repo) => {
			const gitdir = gitBackend.gitdirFor(owner, repo)
			let total = 0
			let cursor: string | undefined
			do {
				const page = await lazyR2.list({ prefix: `${gitdir}/`, limit: 1000, cursor })
				for (const obj of page.objects) total += obj.size ?? 0
				cursor = page.truncated ? page.cursor : undefined
			} while (cursor)
			return total
		},
	})

export default app
