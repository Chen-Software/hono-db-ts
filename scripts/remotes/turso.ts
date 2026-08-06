/**
 * Remote Turso Cloud seeding helper.
 *
 * Inserts seed rows into the remote Turso database via `@libsql/client`.
 * The auth token is resolved in this priority order:
 *   1. `TURSO_AUTH_TOKEN` / `TURSO_TOKEN` from the active env (e.g. `.env`).
 *   2. Otherwise mint a **fresh token via the Turso CLI** (`turso group tokens
 *      create` / `turso db tokens create`) — the same credential that the
 *      deploy hook stores as the Worker secret.
 *
 * Note: Cloudflare Worker secrets are **write-only** — they cannot be read back
 * with Wrangler. So instead of fetching the deployed secret, this mints a
 * current token for the same Turso database, which is what seeding needs.
 */

import { execSync } from "node:child_process";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { movies } from "../../src/db/schema/sqlite";

/** Resolve the Turso database name and its group for a URL (via `turso db list`). */
function resolveDb(url: string): { db: string; group: string } {
	const list = execSync("turso db list", { encoding: "utf8" }).toString();
	for (const row of list.split("\n")) {
		const cols = row.trim().split(/\s+/);
		if (cols.length >= 3 && cols[cols.length - 1] === url) {
			return { db: cols[0], group: cols[2] };
		}
	}
	const match = /libsql:\/\/([^.]+)\./.exec(url);
	if (match) return { db: match[1], group: "" };
	throw new Error(`Cannot resolve Turso database for URL: ${url}`);
}

/** Mint a fresh Turso token via the CLI (group-level preferred). */
function mintToken(url: string): string {
	const { db, group } = resolveDb(url);
	const command = group
		? `turso group tokens create ${group}`
		: `turso db tokens create ${db}`;
	const token = execSync(command, { encoding: "utf8" })
		.trim()
		.split("\n")
		.pop();
	if (!token) throw new Error("Turso CLI returned no token");
	return token;
}

/**
 * Seed the remote Turso Cloud database.
 * @param rows seed rows conforming to the SQLite movies schema.
 * @returns the connected client (caller may `await client.close()`).
 */
export async function seedRemoteTurso(
	rows: { title: string; releaseYear: number }[],
): Promise<Client> {
	const url =
		process.env["TURSO_URL"] ?? `file:///${process.cwd()}/tursodb.db`;
	const authToken =
		process.env["TURSO_AUTH_TOKEN"] ?? process.env["TURSO_TOKEN"];

	// Local file URLs need no token. Cloud URLs: use a provided token, else
	// mint a fresh one via the Turso CLI.
	const isLocal = url.startsWith("file:") || url.startsWith("file://");
	const token = isLocal ? undefined : (authToken ?? mintToken(url));

	const client = createClient({
		url,
		...(token ? { authToken: token } : {}),
	});
	const db = drizzle(client);
	await db.insert(movies).values(rows);
	console.log(`Seeding complete (turso → ${url}).`);
	return client;
}
