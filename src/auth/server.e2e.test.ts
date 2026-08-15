/**
 * server.e2e — drives the REAL Better Auth mount (`mountBetterAuth` →
 * `auth.handler` at `/api/auth/*`) through a full HTTP-style conversation.
 *
 * Runs the auth app IN-PROCESS and uses Hono's `app.request()` (the same code
 * path the deployed server uses — no second process, no TCP, no proxy), so it
 * works inside the memory-constrained sandbox where booting the full
 * `scripts/serve.ts` (which pulls the entire BBS graph) is OOM-killed.
 *
 * This proves, against the production mount path:
 *   1. `/api/auth/*` and a sibling `/api/stats` route COEXIST (mount order is
 *      correct — auth does not shadow the query app).
 *   2. Anon `get-session` → null.
 *   3. `sign-up/email` sets a session cookie and `get-session` resolves it.
 *   4. `sign-in/email` returns a session for the created credentials.
 *   5. Duplicate email sign-up is rejected (422).
 *   6. `sign-out` invalidates the session (what the nav's AuthButton calls).
 *
 * For a real over-the-wire check (sign-in page in a browser, etc.) run
 * `scripts/verify-auth-server.ts` on a machine without the sandbox memory cap.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { SQL } from "bun";
import { Hono } from "hono";

import { mountBetterAuth } from "./mount";

let app: Hono;

function sessionCookie(setCookie: string | null): string {
	const m = setCookie?.match(/better-auth\.session_token=([^;]+)/);
	if (!m) throw new Error("no session cookie in sign-up response");
	return `better-auth.session_token=${m[1]}`;
}

beforeAll(async () => {
	const client = new SQL(":memory:");
	const localAuth = await mountBetterAuth(client);
	app = new Hono();
	localAuth.mount(app);
	// Coexistence probe: a non-auth /api route must still work alongside auth.
	app.get("/api/stats", (c) => c.json({ ok: true }));
});

describe("Better Auth over the real mount path", () => {
	it("serves a sibling /api route alongside auth (coexistence)", async () => {
		const res = await app.request("/api/stats");
		expect(res.status).toBe(200);
	});

	it("get-session is null before authentication", async () => {
		const res = await app.request("/api/auth/get-session");
		expect(res.status).toBe(200);
		expect(await res.json()).toBeNull();
	});

	it("signs up, sets a session cookie, and resolves it", async () => {
		const signUp = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "e2e@example.com",
				password: "password123",
				name: "E2E User",
			}),
		});
		expect(signUp.status).toBe(200);
		const cookie = sessionCookie(signUp.headers.get("set-cookie"));

		const session = await app.request("/api/auth/get-session", {
			headers: { cookie },
		});
		expect(session.status).toBe(200);
		const body = (await session.json()) as { user?: { email?: string } };
		expect(body.user?.email).toBe("e2e@example.com");
	});

	it("signs in with the created credentials and returns a session", async () => {
		await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "signin@example.com",
				password: "password123",
				name: "Sign In User",
			}),
		});

		const signIn = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "signin@example.com",
				password: "password123",
			}),
		});
		expect(signIn.status).toBe(200);
		expect(sessionCookie(signIn.headers.get("set-cookie"))).toBeTruthy();
	});

	it("signs out and invalidates the session", async () => {
		const signUp = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "signout@example.com",
				password: "password123",
				name: "Sign Out User",
			}),
		});
		const cookie = sessionCookie(signUp.headers.get("set-cookie"));

		// Session is live before sign-out.
		const before = await app.request("/api/auth/get-session", {
			headers: { cookie },
		});
		expect((await before.json())?.user?.email).toBe("signout@example.com");

		// Sign out — Better Auth clears the session server-side and sends a
		// Set-Cookie that expires the session_token.
		const signOut = await app.request("/api/auth/sign-out", {
			method: "POST",
			headers: { cookie },
		});
		expect(signOut.status).toBe(200);
		expect(signOut.headers.get("set-cookie") ?? "").toContain(
			"better-auth.session_token=",
		);

		// The same cookie no longer resolves a session.
		const after = await app.request("/api/auth/get-session", {
			headers: { cookie },
		});
		expect(await after.json()).toBeNull();
	});

	it("rejects a duplicate email sign-up (422)", async () => {
		const body = JSON.stringify({
			email: "dup-e2e@example.com",
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
		expect(second.status).toBe(422);
	});
});
