/**
 * worker/queue — Cloudflare Queues consumer for CodeForge actions.
 *
 * Producers:
 *   - `mountGitRoutes(..., { queue })` sends `repo.push` after every successful
 *     `git push` (rich payload: owner/repo/ref/oid + the authenticated pusher).
 *   - R2 Event Notifications (object_put/delete → the same queue) arrive as
 *     `r2.object`-shaped events for low-level object-store sync (metadata only,
 *     no actor) — coalesce per `owner/repo` in the consumer.
 *
 * Consumer semantics: at-least-once. Every message is retried on failure
 * (`msg.retry()`) up to `max_retries`, then dead-lettered. Handlers must be
 * idempotent enough to survive a replay (e.g. the size UPDATE is naturally so).
 *
 * The consumer also bridges each event into the in-process `EventBus`
 * (`BusRegistry`), so Cloudflare Queues becomes the DURABLE transport feeding
 * the existing `Reactive`/`Derivable` model machinery.
 */

import type { Db } from "@/services/types";
import { run } from "@/services/types";
import { getByOwnerAndName } from "@/services/repository";
import { listByRepo, type WebhookRow } from "@/services/webhooks";
import { BusRegistry, type EventBus } from "@/services/event-bus";

/** The `repo.push` action published by the git transport after a successful push. */
export interface RepoPushEvent {
	type: "repo.push";
	owner: string;
	repo: string;
	ref: string;
	oid: string;
	pusherId: string;
	ts: string;
}

/** The low-level R2 object event (from R2 Event Notifications). */
export interface R2ObjectEvent {
	type: "r2.object";
	bucket: string;
	key: string;
	size?: number;
	etag?: string;
}

export type CodeForgeAction = RepoPushEvent | R2ObjectEvent;

/** Dependency-injected surroundings — everything the consumer touches is
 *  swappable, so the whole handler is unit-testable off the platform. */
export interface QueueDeps {
	db: Db;
	/** Sum of the git object bytes for a repo (R2 list in prod, fs walk in dev). */
	measureRepoSize?: (owner: string, repo: string) => Promise<number>;
	/** The in-process bus to bridge into (defaults to `BusRegistry.default()`). */
	bus?: EventBus;
	/** Overridable webhook sender (defaults to `defaultDispatchWebhook`). */
	dispatchWebhook?: (hook: WebhookRow, event: RepoPushEvent) => Promise<void>;
	log?: (...args: unknown[]) => void;
}

/** Structural shape of the platform `MessageBatch` (avoids a hard
 *  @cloudflare/workers-types dependency in tests). */
export interface QueueBatchLike {
	messages: Array<{ body: unknown; retry(): void }>;
}

/** Platform entry — drain a batch, retrying failures. */
export async function handleQueueBatch(batch: QueueBatchLike, deps: QueueDeps): Promise<void> {
	for (const msg of batch.messages) {
		try {
			await handleAction(msg.body as CodeForgeAction, deps);
		} catch (e) {
			deps.log?.("queue action failed:", e);
			msg.retry(); // at-least-once; DLQ after max_retries
		}
	}
}

/** Dispatch a single action to its handler. */
export async function handleAction(event: CodeForgeAction, deps: QueueDeps): Promise<void> {
	switch (event?.type) {
		case "repo.push":
			return handleRepoPush(event, deps);
		case "r2.object":
			// Low-level object-store signal — the MVP consumer treats it as a
			// size/cache sync trigger; coalesce by `owner/repo` before acting.
			deps.log?.("r2.object", event.key, `size=${event.size ?? "?"}`);
			return;
		default:
			deps.log?.("queue: ignoring unknown action", event);
	}
}

/** The `repo.push` action: refresh repo metadata, then fire push webhooks. */
export async function handleRepoPush(event: RepoPushEvent, deps: QueueDeps): Promise<void> {
	const { db } = deps;
	const rec = await getByOwnerAndName(db, event.owner, event.repo);
	if (!rec) {
		deps.log?.(`repo.push: no repo ${event.owner}/${event.repo} — skipping`);
		return;
	}

	// 1) Metadata — refresh the repository size from the git backend. Best
	//    effort: a size failure alone must NOT retry the whole message.
	if (deps.measureRepoSize) {
		try {
			const size = await deps.measureRepoSize(event.owner, event.repo);
			await run(db, `UPDATE "repositories" SET "size" = ? WHERE "id" = ?`, [size, rec.id]);
		} catch (e) {
			deps.log?.("repo.push: size refresh failed (non-fatal):", e);
		}
	}

	// 2) Webhooks — every active hook subscribed to `push`. A failure throws →
	//    the message is retried (at-least-once), then DLQ'd.
	const dispatch = deps.dispatchWebhook ?? defaultDispatchWebhook;
	for (const hook of await listByRepo(db, rec.id, "push")) {
		await dispatch(hook, event);
	}

	// 3) Bridge into the in-process bus for model reactivity.
	(deps.bus ?? BusRegistry.default()).publish("cf.repo.push", event);
}

/** POST the forge event to a hook URL, HMAC-SHA256 signing when a secret is set. */
export async function defaultDispatchWebhook(hook: WebhookRow, event: RepoPushEvent): Promise<void> {
	const payload = JSON.stringify({
		event: "push",
		pusher: { id: event.pusherId },
		repository: { owner: event.owner, name: event.repo },
		ref: event.ref,
		oid: event.oid,
		ts: event.ts,
	});
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"user-agent": "codeforge-webhooks/0.1.0",
	};
	if (hook.secret) headers["x-codeforge-signature"] = await signPayload(hook.secret, payload);
	const res = await fetch(hook.url, { method: "POST", headers, body: payload });
	if (!res.ok) throw new Error(`webhook ${hook.url} -> HTTP ${res.status}`);
}

async function signPayload(secret: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
	let hex = "";
	for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, "0");
	return `sha256=${hex}`;
}

/** Re-export for type consumers (worker types, tests). */
export type { WebhookRow };
