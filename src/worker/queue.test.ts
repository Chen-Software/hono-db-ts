import { test, expect } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ensureSchema } from "../http/schema";
import * as repo from "../services/repository";
import * as webhooks from "../services/webhooks";
import type { Db } from "../services/types";
import {
	handleAction,
	handleQueueBatch,
	handleRepoPush,
	defaultDispatchWebhook,
	type RepoPushEvent,
	type WebhookRow,
} from "./queue";

function makeDb() {
	const client = createClient({ url: ":memory:" });
	const adapter = {
		async unsafe(sql: string, params?: unknown[]) {
			const res = await client.execute({ sql, args: params ?? [] });
			return (res.rows ?? []) as unknown[];
		},
	};
	return { client, db: drizzle({ client }) as Db, adapter };
}

const event: RepoPushEvent = {
	type: "repo.push",
	owner: "octocat",
	repo: "my-repo",
	ref: "refs/heads/main",
	oid: "a".repeat(40),
	pusherId: "u1",
	ts: "2026-08-17T12:00:00.000Z",
};

async function seed(client: Client, db: Db) {
	await client.execute({
		sql: `INSERT INTO "users" ("id","created_at","name","email","role","age") VALUES (?,?,?,?,?,?)`,
		args: ["u1", new Date().toISOString(), "octocat", "octo@example.com", "member", 30],
	});
	const repoId = await repo.create(db, {
		ownerId: "u1",
		name: "my-repo",
		lowerName: "my-repo",
		description: "",
		isPrivate: false,
	});
	const hookId = await webhooks.create(db, {
		repoId,
		url: "https://hooks.example.com/forge",
		secret: "sekret",
		events: ["push"],
	});
	return { repoId, hookId };
}

test("handleRepoPush: refreshes size, dispatches push webhooks, bridges into the bus", async () => {
	const { client, db, adapter } = makeDb();
	await ensureSchema(adapter as any);
	const { repoId } = await seed(client, db);

	const dispatched: Array<{ hook: WebhookRow; evt: RepoPushEvent }> = [];
	const published: Array<[string, unknown]> = [];
	const bus = { publish: (t: string, p: unknown) => void published.push([t, p]) };

	await handleRepoPush(event, {
		db,
		measureRepoSize: async () => 4242,
		dispatchWebhook: async (hook, evt) => void dispatched.push({ hook, evt }),
		bus: bus as never,
	});

	// Metadata: repository size was refreshed.
	const page = await repo.getPage(db, repoId);
	expect(page.repository.size).toBe(4242);

	// Webhooks: the active push hook received the event.
	expect(dispatched.length).toBe(1);
	expect(dispatched[0].hook.url).toBe("https://hooks.example.com/forge");
	expect(dispatched[0].evt).toEqual(event);

	// Bridge: the durable queue event was re-published on the in-process bus.
	expect(published).toEqual([["cf.repo.push", event]]);
});

test("handleQueueBatch: retries a message when an action fails (at-least-once)", async () => {
	const { client, db, adapter } = makeDb();
	await ensureSchema(adapter as any);
	await seed(client, db);

	let retried = 0;
	await handleQueueBatch(
		{
			messages: [
				{
					body: event,
					retry: () => void retried++,
				},
			],
		},
		{ db, dispatchWebhook: async () => { throw new Error("hook boom"); } },
	);
	expect(retried).toBe(1);
});

test("handleAction: ignores unknown action types", async () => {
	const { db, adapter } = makeDb();
	await ensureSchema(adapter as any);
	await handleAction({ type: "something.else" } as never, { db });
});

test("defaultDispatchWebhook: POSTs the forge payload and HMAC-signs with the secret", async () => {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (url: any, init: any) => {
		calls.push({ url, init });
		return { ok: true, status: 200 } as Response;
	}) as never;
	try {
		const hook: WebhookRow = {
			id: "h1",
			created_at: "",
			repoId: "r1",
			url: "https://hooks.example.com/forge",
			secret: "sekret",
			active: 1,
			events: '["push"]',
		};
		await defaultDispatchWebhook(hook, event);
	} finally {
		globalThis.fetch = originalFetch;
	}

	expect(calls.length).toBe(1);
	expect(calls[0].url).toBe("https://hooks.example.com/forge");
	expect(calls[0].init.method).toBe("POST");
	const body = JSON.parse(String(calls[0].init.body));
	expect(body.event).toBe("push");
	expect(body.ref).toBe("refs/heads/main");
	expect(body.oid).toBe(event.oid);
	expect(body.repository).toEqual({ owner: "octocat", name: "my-repo" });
	const headers = calls[0].init.headers as Record<string, string>;
	expect(headers["x-codeforge-signature"]?.startsWith("sha256=")).toBe(true);
});
