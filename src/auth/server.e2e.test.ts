/**
 * server.e2e — boots the REAL local server (`scripts/serve.ts`) and drives a
 * full Better Auth conversation over HTTP.
 *
 * This exercises the exact production mount path:
 *   `scripts/serve.ts` → `mountBetterAuth(client)` → `auth.handler` at
 *   `/api/auth/*`, on the SAME in-memory SQLite DB the app uses.
 *
 * It proves three things the unit-level `auth.test.ts` can't:
 *   1. The server entry wires auth correctly at startup (idempotent schema,
 *      auth instance, `/api/auth/*` mount BEFORE the query app).
 *   2. `/api/auth/*` and the BBS JSON API (`/api/stats`) coexist — the auth
 *      mount does not shadow or break existing `/api` routes.
 *   3. Dead-code elimination is real: with `BETTER_AUTH_ENABLED=false` the
 *      `/api/auth/*` routes are gone (404) while `/api/stats` still serves.
 *
 * Runs in `api` mode so it needs NO UI build (avoids the heavy Vite step).
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawn, type Subprocess } from "bun";

const ROOT = import.meta.dir + "/../.."; // repo root (templates/)
const ENABLED_PORT = 8731;
const DISABLED_PORT = 8732;

function startServer(port: number, enabled: boolean): Subprocess {
	const env: Record<string, string> = {
		...process.env,
		DATABASE_URL: ":memory:",
		BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long-xxxx",
		BETTER_AUTH_ENABLED: enabled ? "true" : "false",
	};
	return spawn(
		["bun", "run", "scripts/serve.ts", String(port), "api"],
		{ cwd: ROOT, env, stdout: "pipe", stderr: "pipe" },
	);
}

/** Poll the server until `/api/stats` answers, or time out. */
async function waitForReady(port: number, proc: Subprocess): Promise<void> {
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://localhost:${port}/api/stats`);
			if (res.ok) return;
		} catch {
			// not up yet — but check the child didn't crash
			if ((await proc.exited) !== null) {
				const err = await new Response(proc.stderr).text();
				throw new Error(`serve process exited early:\n${err}`);
			}
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	const err = await new Response(proc.stderr).text();
	throw new Error(`server on :${port} not ready in 20s:\n${err}`);
}

function sessionCookie(setCookie: string | null): string {
	const m = setCookie?.match(/better-auth\.session_token=([^;]+)/);
	if (!m) throw new Error("no session cookie in sign-up response");
	return `better-auth.session_token=${m[1]}`;
}

describe("local server — Better Auth over HTTP (enabled)", () => {
	let server: Subprocess;

	beforeAll(async () => {
		server = startServer(ENABLED_PORT, true);
		await waitForReady(ENABLED_PORT, server);
	});

	afterAll(() => {
		server?.kill();
	});

	it("serves the BBS JSON API alongside auth (coexistence)", async () => {
		const res = await fetch(`http://localhost:${ENABLED_PORT}/api/stats`);
		expect(res.status).toBe(200);
	});

	it("get-session is null before authentication", async () => {
		const res = await fetch(`http://localhost:${ENABLED_PORT}/api/auth/get-session`);
		expect(res.status).toBe(200);
		expect(await res.json()).toBeNull();
	});

	it("signs up, sets a session cookie, and resolves it", async () => {
		const signUp = await fetch(
			`http://localhost:${ENABLED_PORT}/api/auth/sign-up/email`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "e2e@example.com",
					password: "password123",
					name: "E2E User",
				}),
			},
		);
		expect(signUp.status).toBe(200);
		const cookie = sessionCookie(signUp.headers.get("set-cookie"));

		const session = await fetch(
			`http://localhost:${ENABLED_PORT}/api/auth/get-session`,
			{ headers: { cookie } },
		);
		expect(session.status).toBe(200);
		const body = (await session.json()) as { user?: { email?: string } };
		expect(body.user?.email).toBe("e2e@example.com");
	});

	it("sign-in with the created credentials returns a session", async () => {
		// ensure the account exists
		await fetch(`http://localhost:${ENABLED_PORT}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "signin@example.com",
				password: "password123",
				name: "Sign In User",
			}),
		});

		const signIn = await fetch(
			`http://localhost:${ENABLED_PORT}/api/auth/sign-in/email`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "signin@example.com",
					password: "password123",
				}),
			},
		);
		expect(signIn.status).toBe(200);
		expect(sessionCookie(signIn.headers.get("set-cookie"))).toBeTruthy();
	});

	it("rejects a duplicate email sign-up", async () => {
		const body = JSON.stringify({
			email: "dup-e2e@example.com",
			password: "password123",
			name: "Dup",
		});
		const first = await fetch(
			`http://localhost:${ENABLED_PORT}/api/auth/sign-up/email`,
			{ method: "POST", headers: { "content-type": "application/json" }, body },
		);
		expect(first.status).toBe(200);
		const second = await fetch(
			`http://localhost:${ENABLED_PORT}/api/auth/sign-up/email`,
			{ method: "POST", headers: { "content-type": "application/json" }, body },
		);
		expect(second.status).toBe(422);
	});
});

describe("local server — DCE (BETTER_AUTH_ENABLED=false)", () => {
	let server: Subprocess;

	beforeAll(async () => {
		server = startServer(DISABLED_PORT, false);
		await waitForReady(DISABLED_PORT, server);
	});

	afterAll(() => {
		server?.kill();
	});

	it("the BBS JSON API still works without auth compiled in", async () => {
		const res = await fetch(`http://localhost:${DISABLED_PORT}/api/stats`);
		expect(res.status).toBe(200);
	});

	it("/api/auth/* is gone (mount dropped via DCE)", async () => {
		const res = await fetch(`http://localhost:${DISABLED_PORT}/api/auth/get-session`);
		// The auth handler is not mounted, so Hono returns 404 (not 200/null).
		expect(res.status).toBe(404);
	});
});
