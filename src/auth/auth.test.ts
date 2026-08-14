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

import { describe, expect, it } from "bun:test";
import { SQL } from "bun";
import type { Env } from "hono";
import { Hono } from "hono";

import { getSession } from "./context";
import { mountBetterAuth } from "./mount";

/** Build a fresh in-memory app with Better Auth mounted at /api/auth/*. */
async function buildApp() {
	const client = new SQL(":memory:");
	const localAuth = await mountBetterAuth(client);
	// Use the augmented `Env` (like honox's `createApp`) so `c.env` has the
	// SQL/DB bindings the app's routes rely on.
	const app = new Hono<Env>();
	localAuth.mount(app);
	// Attach the auth instance like app/server.ts does, so SSR routes can call
	// getSession(c) without re-importing a bun-only driver.
	const auth = localAuth.instance;
	app.use("*", async (c, next) => {
		// hono leaves c.env undefined unless the caller passes one — honox
		// provides it for real routes; we initialize it here for the test.
		const env = (c.env ?? {}) as { auth?: unknown };
		env.auth = auth;
		(c as { env: unknown }).env = env;
		await next();
	});
	// A trivial query-app route to prove auth routes win at /api/auth/*.
	app.get("/api/stats", (c) => c.json({ ok: true, data: "stats" }));
	// A protected-style route that uses getSession(c), mirroring the SSR pattern.
	app.get("/whoami", (c) =>
		getSession(c).then((s) => c.json({ email: s?.user?.email ?? null })),
	);
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

		// GET /api/auth/get-session with no cookie → unauthenticated (null).
		// (better-auth 1.6 serves the session at /get-session; /session is 404.)
		const anon = await app.request("/api/auth/get-session");
		expect(anon.status).toBe(200);
		expect(await anon.json()).toBeNull();

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

		// GET /api/auth/get-session with the cookie → authenticated.
		const session = await app.request("/api/auth/get-session", {
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

	it("getSession(c) resolves the current user on a protected route", async () => {
		const { app } = await buildApp();

		// No cookie → unauthenticated.
		const anon = await app.request("/whoami");
		expect(anon.status).toBe(200);
		expect(await anon.json()).toEqual({ email: null });

		// Sign up, then the same cookie authenticates /whoami.
		const signUp = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "whoami@example.com",
				password: "password123",
				name: "Who",
			}),
		});
		const cookie = signUp.headers
			.get("set-cookie")
			?.match(/better-auth\.session_token=([^;]+)/)?.[1];
		expect(cookie).toBeTruthy();

		const authed = await app.request("/whoami", {
			headers: { cookie: `better-auth.session_token=${cookie}` },
		});
		expect(authed.status).toBe(200);
		expect(await authed.json()).toEqual({ email: "whoami@example.com" });
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
		expect(second.status).toBe(422); // EMAIL_ALREADY_EXISTS in better-auth 1.6
	});
});
