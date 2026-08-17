/**
 * factory — bind a `Db` (SQL executor) to every service module so handlers can
 * call `svc.repository.getPage(id)` instead of passing `db` around. This is the
 * single object both the `/api` layer and (indirectly, over HTTP) the SSR
 * routes depend on.
 */
import type { Db } from './types'
import * as accessTokens from './access-tokens'
import * as repository from './repository'
import * as home from './home'
import * as search from './search'
import * as users from './users'
import * as webhooks from './webhooks'
import * as runs from './workflow-runs'
import * as issues from './issues'
import * as releases from './releases'
import * as labels from './labels'
import * as milestones from './milestones'

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
		accessTokens: bind(accessTokens, db),
		repository: bind(repository, db),
		home: bind(home, db),
		search: bind(search, db),
		users: bind(users, db),
		webhooks: bind(webhooks, db),
		runs: bind(runs, db),
		issues: bind(issues, db),
		releases: bind(releases, db),
		labels: bind(labels, db),
		milestones: bind(milestones, db),
	}
}

export type Services = ReturnType<typeof createServices>
