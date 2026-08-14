/**
 * auth — integration tests for the Better Auth setup.
 *
 * Verifies the pieces that the Hono reference example wires up, adapted to
 * this starter's SQLite-everywhere runtime:
 *
 *   1. `mountBetterAuth` applies the idempotent auth schema (`drizzle/*_auth_*`)
 *      and mounts `/api/auth/*` on a Hono app.
 *   2. The mounted handler signs up a user (email + password), sets a session
 *      cookie, and `getSession` resolves it — the exact flow the UI islands
 *      will use.
 *
 * Uses an in-memory bun:sqlite DB, same as `serve` with `DATABASE_URL=:memory:`.
 */
import { SQL } from "bun";
import { Hono } from "hono";
import { describe, expect, it } from "bun:test";

import { mountBetterAuth } from "./mount";

const AUTH_URL = "http://localhost:8787";
const AUTH_SECRET = "test-secret-0123456789abcdef-0123456789";

/** Build a fresh in-memory app with Better Auth mounted at /api/auth/*. */
async function buildApp() {
	const client = new SQL(":memory:");
	const mount = await mountBetterAuth(client);
	const app = new Hono();
	mount(app);
	// A trivial query-app route to prove auth routes win at /api/auth/*.
	app.get("/api/stats", (c) => c.json({ ok: true, data: "stats" }));
	return { app, client };
}

describe("mountBetterAuth", () => {
	it("mounts /api/auth/* and the query app still serves other /api routes", async () => {
		const { app } = await buildApp();
		const res = await app.request("/api/stats");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, data: "stats" });
	});

	it("signs up a user and resolves the session via the session cookie", async () => {
		const { app } = await buildApp();

		// GET /api/auth/session with no cookie → unauthenticated.
		const anon = await app.request("/api/auth/session");
		expect(anon.status).toBe(200);
		expect(await anon.json()).toEqual({ session: null, user: null });

		// Sign up (email + password).
		const signUp = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "auth@example.com",
				password: "password123",
				name: "Auth Test",
			}),
		});
		expect(signUp.status).toBe(200);
		const signedUp = (await signUp.json()) as { user?: { email: string } };
		expect(signedUp.user?.email).toBe("auth@example.com");

		const cookie = signUp.headers
			.get("set-cookie")
			?.match(/better-auth\.session_token=([^;]+)/)?.[1];
		expect(cookie).toBeTruthy();

		// GET /api/auth/session with the cookie → authenticated.
		const session = await app.request("/api/auth/session", {
			headers: { cookie: `better-auth.session_token=${cookie}` },
		});
		expect(session.status).toBe(200);
		const body = (await session.json()) as {
			session?: { userId?: string };
			user?: { email?: string };
		};
		expect(body.user?.email).toBe("auth@example.com");
		expect(body.session?.userId).toBeTruthy();
	});

	it("rejects duplicate email sign-up", async () => {
		const { app } = await buildApp();
		const body = JSON.stringify({
			email: "dup@example.com",
			password: "password123",
			name: "Dup",
		});
		const first = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		});
		expect(first.status).toBe(200);
		const second = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		});
		expect(second.status).toBe(400);
	});
});
