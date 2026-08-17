/**
 * access-tokens service — personal access tokens for the git smart-HTTP
 * transport (Basic auth).
 *
 * Mirrors Forgejo `models/auth/access_token.go` (subset). We NEVER store the
 * raw token: `create` generates a 40-hex token, returns it to the caller
 * exactly once, and persists only its SHA-256 (`token_sha256`). Lookup is by
 * hash, so a DB leak does not leak credentials.
 *
 * Scope strings (JSON array in `scopes`):
 *   - `read:repository`  — clone / fetch (upload-pack)
 *   - `write:repository` — push (receive-pack)
 * Default is both. `expires_at` is an optional ISO timestamp; a token past it
 * is rejected by the git transport.
 */
import { sql } from "drizzle-orm";
import type { Db } from "./types";
import { all, run } from "./types";

export const GIT_SCOPES = ["read:repository", "write:repository"] as const;

export type GitScope = (typeof GIT_SCOPES)[number];

export interface AccessTokenRow {
	id: string;
	created_at: string;
	user_id: string;
	name: string;
	token_sha256: string;
	/** JSON array of scope strings, e.g. `["read:repository","write:repository"]`. */
	scopes: string;
	last_used_at: string | null;
	expires_at: string | null;
}

export interface CreateAccessTokenInput {
	userId: string;
	name: string;
	scopes?: GitScope[];
	/** Optional ISO timestamp — token is rejected after this time. */
	expiresAt?: string | null;
}

/** A newly-created token: the raw token is returned ONCE and never persisted. */
export interface CreatedAccessToken {
	id: string;
	token: string;
}

/** SHA-256 of the raw token, hex-encoded (what we store / look up by). */
export function hashToken(token: string): Promise<string> {
	return sha256Hex(token);
}

/** Generate a fresh 40-hex token (mirrors Forgejo's `CryptoRandomBytes(20)`). */
function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(20));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create a token; returns the raw token exactly once. */
export async function create(
	db: Db,
	input: CreateAccessTokenInput,
): Promise<CreatedAccessToken> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const token = generateToken();
	const tokenSha = await sha256Hex(token);
	const scopes = JSON.stringify(input.scopes ?? GIT_SCOPES);
	await run(
		db,
		`INSERT INTO "access_tokens" ("id","created_at","user_id","name","token_sha256","scopes","last_used_at","expires_at")
		 VALUES (?,?,?,?,?,?,?,?)`,
		[id, now, input.userId, input.name, tokenSha, scopes, null, input.expiresAt ?? null],
	);
	return { id, token };
}

/** Look up a token by its raw value (hashed internally). Returns null on miss. */
export async function findByToken(
	db: Db,
	rawToken: string,
): Promise<AccessTokenRow | null> {
	const tokenSha = await sha256Hex(rawToken);
	const rows = await all<AccessTokenRow>(
		db,
		`SELECT "id","created_at","user_id","name","token_sha256","scopes","last_used_at","expires_at"
		 FROM "access_tokens" WHERE "token_sha256" = ? LIMIT 1`,
		[tokenSha],
	);
	return rows[0] ?? null;
}

/** All tokens for a user (never exposes `token_sha256` — that is the hash of a secret). */
export async function listByUser(
	db: Db,
	userId: string,
): Promise<Array<Omit<AccessTokenRow, "token_sha256">>> {
	const rows = await all<AccessTokenRow>(
		db,
		`SELECT "id","created_at","user_id","name","scopes","last_used_at","expires_at"
		 FROM "access_tokens" WHERE "user_id" = ? ORDER BY "created_at" DESC`,
		[userId],
	);
	return rows.map(({ token_sha256: _omit, ...row }) => row);
}

/** Update `last_used_at` after a successful auth (best-effort). */
export async function touchLastUsed(db: Db, id: string): Promise<void> {
	await run(db, `UPDATE "access_tokens" SET "last_used_at" = ? WHERE "id" = ?`, [
		new Date().toISOString(),
		id,
	]);
}

/** Delete a token (scoped to its owner — a user can only delete their own). */
export async function remove(db: Db, id: string, userId: string): Promise<boolean> {
	const res = await db.run(
		sql`DELETE FROM "access_tokens" WHERE "id" = ${id} AND "user_id" = ${userId}`,
	);
	// libsql reports affected rows as `rowsAffected`; drizzle's `run` returns it
	// verbatim (no `changes` key).
	return (res as { rowsAffected?: number })?.rowsAffected !== 0;
}

/** Parse the `scopes` JSON column. */
export function scopesOf(row: AccessTokenRow): GitScope[] {
	try {
		return JSON.parse(row.scopes) as GitScope[];
	} catch {
		return [];
	}
}

/** Does a token row grant `scope`? */
export function hasScope(row: AccessTokenRow, scope: GitScope): boolean {
	return scopesOf(row).includes(scope);
}

/** Is the token expired? (No `expires_at` → never expires.) */
export function isExpired(row: AccessTokenRow, now = new Date()): boolean {
	return row.expires_at !== null && new Date(row.expires_at).getTime() < now.getTime();
}
