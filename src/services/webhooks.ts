/**
 * webhooks service — per-repository outbound webhooks (the push-event delivery
 * targets for the `repo.push` queue action).
 *
 * Minimal Forgejo-style hook row: a URL + optional shared secret + which events
 * it subscribes to (stored as a JSON array string, default `["push"]`). The
 * queue consumer reads these and POSTs the forge event payload to each URL;
 * `active = 0` rows are skipped so hooks can be paused without deleting them.
 */
import type { Db } from './types'
import { all, run } from './types'

export interface WebhookRow {
	id: string
	created_at: string
	repoId: string
	url: string
	/** Shared-secret for HMAC signing (null = unsigned). */
	secret: string | null
	active: number
	/** JSON array of event names, e.g. `["push"]`. */
	events: string
}

export interface CreateWebhookInput {
	repoId: string
	url: string
	secret?: string | null
	active?: boolean
	events?: string[]
}

/** Active hooks subscribed to `event` for a repo. */
export async function listByRepo(db: Db, repoId: string, event = 'push'): Promise<WebhookRow[]> {
	const rows = await all<WebhookRow>(
		db,
		`SELECT "id","created_at","repoId","url","secret","active","events"
		 FROM "webhooks"
		 WHERE "repoId" = ? AND "active" = 1
		 ORDER BY "created_at" ASC`,
		[repoId],
	)
	return rows.filter((r) => {
		try {
			return (JSON.parse(r.events ?? '[]') as string[]).includes(event)
		} catch {
			return false
		}
	})
}

export async function create(db: Db, input: CreateWebhookInput): Promise<string> {
	const id = crypto.randomUUID()
	const now = new Date().toISOString()
	await run(
		db,
		`INSERT INTO "webhooks" ("id","created_at","repoId","url","secret","active","events")
		 VALUES (?,?,?,?,?,?,?)`,
		[id, now, input.repoId, input.url, input.secret ?? null, input.active === false ? 0 : 1, JSON.stringify(input.events ?? ['push'])],
	)
	return id
}
