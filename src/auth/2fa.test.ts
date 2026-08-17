/**
 * 2FA — verifies the git transport refuses password auth for 2FA-enrolled
 * users, while leaving normal (non-2FA) password auth and PAT auth intact.
 *
 * This is the closure of the P0-1 security gap: `src/git/auth.ts` `resolvePassword`
 * must reject any user with `twoFactorEnabled` set, because the better-auth 2FA
 * plugin (enabled in `src/auth/options.ts`) refuses to mint a session for them.
 *
 * Uses an in-memory bun:sqlite DB, same as `auth.test.ts`. The 2FA column is
 * simulated by flipping `user.twoFactorEnabled` directly (the full TOTP enrol
 * flow needs a generator + trust cookies and is out of scope here — we only
 * care that the transport honours the flag once set).
 */

import { describe, expect, it } from "bun:test";
import { SQL } from "bun";
import type { Env } from "hono";
import { Hono } from "hono";

import { resolveGitUser } from "@/git/auth";
import type { Db } from "@/services/types";
import { mountBetterAuth } from "./mount";

/** A no-op Db — the password path never touches resolveToken, so this is unused. */
const dbStub = {
	all: () => [],
	run: () => {},
	get: () => undefined,
	select: () => ({}),
	insert: () => ({}),
	update: () => ({}),
	delete: () => ({}),
} as unknown as Db;

/** Build a fresh in-memory app with Better Auth mounted at /api/auth/*. */
async function buildApp() {
	const client = new SQL(":memory:");
	const localAuth = await mountBetterAuth(client);
	const app = new Hono<Env>();
	localAuth.mount(app);
	const auth = localAuth.instance;
	app.use("*", async (c, next) => {
		const env = (c.env ?? {}) as { auth?: unknown };
		env.auth = auth;
		(c as { env: unknown }).env = env;
		await next();
	});
	// Probe route: resolve a git Basic-auth user exactly like the transport does.
	app.get("/git-resolve", async (c) => {
		const u = await resolveGitUser(c, dbStub);
		return c.json({ id: u?.id ?? null, type: u?.type ?? null });
	});
	return { app, client };
}

function basic(email: string, password: string): string {
	return "Basic " + Buffer.from(`${email}:${password}`).toString("base64");
}

describe("2FA · git transport", () => {
	it("still resolves a non-2FA user via password (no regression)", async () => {
		const { app } = await buildApp();
		const email = "normal@example.com";
		const res = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password: "password123", name: "Normal" }),
		});
		expect(res.status).toBe(200);

		const git = await app.request("/git-resolve", {
			headers: { authorization: basic(email, "password123") },
		});
		expect(git.status).toBe(200);
		const body = (await git.json()) as { id: string | null; type: string | null };
		expect(body.type).toBe("password");
		expect(body.id).toBeTruthy();
	});

	it("rejects password auth for a 2FA-enrolled user", async () => {
		const { app, client } = await buildApp();
		const email = "twofa@example.com";
		const signUp = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password: "password123", name: "TwoFA" }),
		});
		expect(signUp.status).toBe(200);

		// Simulate 2FA enrolment: flip the plugin's flag on the user row.
		await client.unsafe(
			`UPDATE "user" SET "twoFactorEnabled" = 1 WHERE "email" = ?`,
			[email],
		);

		// Password auth must now be refused — the transport sees no session.
		const git = await app.request("/git-resolve", {
			headers: { authorization: basic(email, "password123") },
		});
		expect(git.status).toBe(200);
		const body = (await git.json()) as { id: string | null; type: string | null };
		expect(body.id).toBeNull();
		expect(body.type).toBeNull();

		// Sanity: the column really is set (so the rejection was due to 2FA,
		// not a generic sign-in failure).
		const rows = (await client.unsafe(
			`SELECT "twoFactorEnabled" FROM "user" WHERE "email" = ?`,
			[email],
		)) as Array<{ twoFactorEnabled: number }>;
		expect(rows[0]?.twoFactorEnabled).toBe(1);
	});
});
