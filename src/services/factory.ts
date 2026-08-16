/**
 * factory — bind a `Db` (SQL executor) to every service module so handlers can
 * call `svc.threads.getPage(id)` instead of passing `db` around. This is the
 * single object both the `/api` layer and (indirectly, over HTTP) the SSR
 * routes depend on.
 */
import type { Db } from './types'
import * as boards from './boards'
import * as threads from './threads'
import * as posts from './posts'
import * as home from './home'
import * as search from './search'
import * as users from './users'

type AnyModule = Record<string, unknown>

/** Partially-apply `db` to every function in a service module. */
function bind<T extends AnyModule>(mod: T, db: Db): { [K in keyof T]: T[K] extends (d: Db, ...a: infer A) => infer R ? (...a: A) => R : T[K] } {
	const out: AnyModule = {}
	for (const [k, v] of Object.entries(mod)) {
		out[k] = typeof v === 'function' ? (...args: unknown[]) => (v as (d: Db, ...a: unknown[]) => unknown)(db, ...args) : v
	}
	return out as never
}

export function createServices(db: Db) {
	return {
		db,
		boards: bind(boards, db),
		threads: bind(threads, db),
		posts: bind(posts, db),
		home: bind(home, db),
		search: bind(search, db),
		users: bind(users, db),
	}
}

export type Services = ReturnType<typeof createServices>
