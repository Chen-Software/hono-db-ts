/**
 * auth — Basic-auth resolver for the git transport (P0-1).
 *
 * Real git CLI authenticates with `Authorization: Basic` — it never sends a
 * session cookie — so the transport resolves the acting user from either:
 *   1. a cookie session (browser / API clients), or
 *   2. Basic auth:
 *      - a Personal Access Token (40-hex) → SHA-256 lookup, or
 *      - a password → Better Auth `signInEmail` (server-side).
 *
 * Design decisions (docs/git-backend-impl-plans.md P0-1):
 *   - PATs are stored ONLY as the SHA-256 of the raw token; the raw token is
 *     returned once at creation and never persisted or logged.
 *   - 2FA rejection of password auth is STUBBED: better-auth 2FA is a plugin and
 *     this project has no `isTwoFactor` column yet, so password login is
 *     currently allowed. Wire `hasTwoFactor()` once the 2FA plugin lands.
 *
 * Uses only Web Crypto + Web Platform globals (atob / crypto.subtle /
 * crypto.getRandomValues) so this module is Workers-safe.
 */

import type { Context } from "hono";
import { getSession, getAuthInstance } from "@/auth/context";
import { all, run, type Db } from "@/services/types";

export interface GitUser {
	id: string;
	type: "session" | "token" | "password";
	/** Set when type === "token". */
	tokenId?: string;
	/** Set when type === "token". */
	scopes?: string[];
}

/** SHA-256 hex digest of a string (Web Crypto — Workers + Node). */
export async function sha256Hex(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PAT_RE = /^[0-9a-f]{40}$/;

/** Resolve the git user: cookie session first, then Basic auth. Null = no auth. */
export async function resolveGitUser(c: Context, db: Db): Promise<GitUser | null> {
	const session = await getSession(c).catch(() => null);
	if (session?.user?.id) return { id: session.user.id, type: "session" };

	const header = c.req.header("authorization");
	if (header?.startsWith("Basic ")) {
		return resolveBasic(c, db, header.slice(6));
	}
	return null;
}

async function resolveBasic(c: Context, db: Db, b64: string): Promise<GitUser | null> {
	let decoded: string;
	try {
		decoded = (globalThis as { atob?: (s: string) => string }).atob?.(b64)
			?? Buffer.from(b64, "base64").toString("utf8");
	} catch {
		return null;
	}
	const idx = decoded.indexOf(":");
	if (idx < 0) return null;
	const user = decoded.slice(0, idx);
	const pass = decoded.slice(idx + 1);

	if (PAT_RE.test(pass)) return resolveToken(db, pass);
	return resolvePassword(c, user, pass);
}

async function resolveToken(db: Db, rawToken: string): Promise<GitUser | null> {
	const hash = await sha256Hex(rawToken);
	const rows = await all<{
		id: string;
		user_id: string;
		scopes: string;
		expires_at: string | null;
	}>(db, `SELECT id, user_id, scopes, expires_at FROM "access_tokens" WHERE "token_sha256" = ? LIMIT 1`, [hash]);
	const row = rows[0];
	if (!row) return null;
	if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
	let scopes: string[] = [];
	try {
		scopes = JSON.parse(row.scopes);
	} catch {
		scopes = [];
	}
	// Best-effort last_used_at stamp — non-blocking for the auth decision.
	run(db, `UPDATE "access_tokens" SET "last_used_at" = ? WHERE "id" = ?`, [new Date().toISOString(), row.id]).catch(
		() => {},
	);
	return { id: row.user_id, type: "token", tokenId: row.id, scopes };
}

async function resolvePassword(c: Context, user: string, password: string): Promise<GitUser | null> {
	// TODO(P0-1): reject when the user has 2FA enrolled. The better-auth 2FA
	// plugin is not installed and there is no isTwoFactor column, so password
	// login is allowed for now.
	const inst = await getAuthInstance(c);
	if (!inst) return null;
	try {
		const res = await inst.api.signInEmail({
			body: { email: user, password },
			headers: new Headers(),
		});
		const id =
			(res as { user?: { id?: string } })?.user?.id ??
			(res as { session?: { user?: { id?: string } } })?.session?.user?.id;
		if (!id) return null;
		return { id, type: "password" };
	} catch {
		return null;
	}
}

/**
 * Generate a 40-hex raw token, persist ONLY its SHA-256, and return the raw
 * token once. Callers (a future settings UI) must surface `rawToken` to the
 * user exactly once — it cannot be recovered.
 */
export async function createAccessToken(
	db: Db,
	userId: string,
	name: string,
	scopes: string[] = ["read:repository", "write:repository"],
	expiresAt: string | null = null,
): Promise<{ rawToken: string; id: string }> {
	const raw = [...crypto.getRandomValues(new Uint8Array(20))]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const id = crypto.randomUUID();
	const hash = await sha256Hex(raw);
	await run(
		db,
		`INSERT INTO "access_tokens" ("id","user_id","name","token_sha256","scopes","expires_at","created_at") VALUES (?,?,?,?,?,?,?)`,
		[id, userId, name, hash, JSON.stringify(scopes), expiresAt, new Date().toISOString()],
	);
	return { rawToken: raw, id };
}
