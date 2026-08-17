import { test, expect } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ensureSchema } from "../http/schema";
// Import the models BEFORE the services: the repository service resolves its
// drizzle tables via `resolveTableThunk` at module load.
import "../models/user";
import "../models/repository";
import * as repo from "../services/repository";
import * as webhooks from "../services/webhooks";
import * as runs from "../services/workflow-runs";
import type { Db } from "../services/types";
import {
	handleAction,
	handleCiRun,
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
		sql: `INSERT INTO "users" ("id","created_at","name","email") VALUES (?,?,?,?)`,
		args: ["u1", new Date().toISOString(), "octocat", "octo@example.com"],
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

test("handleRepoPush: schedules a CI run + enqueues ci.run when .codeforge-ci.yml fires on push", async () => {
	const { client, db, adapter } = makeDb();
	await ensureSchema(adapter as any);
	const { repoId } = await seed(client, db);

	const enqueued: any[] = [];
	await handleRepoPush(event, {
		db,
		dispatchWebhook: async () => {}, // the seed creates an active hook — don't really POST
		workflow: {
			readWorkflowFile: async () =>
				`on: [push]\njobs:\n  build:\n    runs-on: [ubuntu-latest]\n    steps:\n      - run: echo hi\n`,
			enqueueRun: async (m) => void enqueued.push(m),
		},
	});

	const list = await runs.listRunsByRepo(db, repoId);
	expect(list.length).toBe(1);
	expect(list[0].status).toBe("queued");
	expect(list[0].ref).toBe("refs/heads/main");
	expect(list[0].commit_sha).toBe(event.oid);
	expect(list[0].workflow_path).toBe(".codeforge-ci.yml");
	expect(list[0].trigger_event).toBe("push");

	// The run was handed to the runner as a `ci.run` queue action.
	expect(enqueued.length).toBe(1);
	expect(enqueued[0].type).toBe("ci.run");
	expect(enqueued[0].runId).toBe(list[0].id);
	expect(enqueued[0].repoId).toBe(repoId);
	expect(enqueued[0].ref).toBe("refs/heads/main");
	expect(enqueued[0].oid).toBe(event.oid);
});

test("handleRepoPush: no run when the workflow is missing or not push-triggered", async () => {
	const { client, db, adapter } = makeDb();
	await ensureSchema(adapter as any);
	const { repoId } = await seed(client, db);

	// Missing workflow file.
	await handleRepoPush(event, {
		db,
		dispatchWebhook: async () => {},
		workflow: { readWorkflowFile: async () => null, enqueueRun: async () => {} },
	});
	// pull_request-only workflow → `on: [push]` does not match.
	await handleRepoPush(event, {
		db,
		dispatchWebhook: async () => {},
		workflow: {
			readWorkflowFile: async () => "on: [pull_request]\njobs:\n  x:\n    steps:\n      - run: echo\n",
			enqueueRun: async () => {},
		},
	});
	// No CI wiring at all.
	await handleRepoPush(event, { db, dispatchWebhook: async () => {} });

	expect((await runs.listRunsByRepo(db, repoId)).length).toBe(0);
});

test("handleCiRun: delegates to executeRun; without a runner the run stays queued", async () => {
	const { client, db, adapter } = makeDb();
	await ensureSchema(adapter as any);
	const { repoId } = await seed(client, db);
	const runId = await runs.createRun(db, {
		repoId,
		ref: "refs/heads/main",
		commitSha: event.oid,
		workflowPath: ".codeforge-ci.yml",
		triggerEvent: "push",
	});

	const executed: any[] = [];
	await handleCiRun(
		{ type: "ci.run", runId, repoId, ref: "refs/heads/main", oid: event.oid },
		{ db, executeRun: async (m) => void executed.push(m) },
	);
	expect(executed.length).toBe(1);
	expect(executed[0].runId).toBe(runId);

	// Without a runner backend: no throw, and the run remains queued.
	await handleCiRun({ type: "ci.run", runId, repoId, ref: "refs/heads/main", oid: event.oid }, { db });
	const run = await runs.getRun(db, runId);
	expect(run?.status).toBe("queued");
});
