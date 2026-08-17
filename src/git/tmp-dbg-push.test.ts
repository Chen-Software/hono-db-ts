import { test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import * as git from "isomorphic-git";
import { run } from "@/services/types";
import { createQueryDb } from "@/db/client";
import { resolveDatabaseTarget } from "@/http/schema";
import { buildQueryApp } from "@/http/app";
import { r2GitBackend } from "@/git/backend";
import { mountGitRoutes } from "@/git/routes";
import { nodeFs } from "@/git/fs-node";
import { listRefs } from "@/git/refs";

const OWNER_ID = "00000000-0000-0000-0000-0000000000aa";
const REPO_ID = "11111111-1111-1111-1111-1111111111bb";

class MemR2 {
	store = new Map<string, Uint8Array>();
	async head(key: string) { const v = this.store.get(key); return v ? { size: v.byteLength } : null; }
	async get(key: string) { const v = this.store.get(key); if (!v) return null; return { async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer; }, size: v.byteLength }; }
	async put(key: string, value: Uint8Array | string | ArrayBuffer) { this.store.set(key, new Uint8Array(value as ArrayBuffer)); }
	async delete(key: string) { this.store.delete(key); }
	async list(opts: any = {}) {
		const keys = [...this.store.keys()].filter((k) => k.startsWith(opts.prefix ?? ""));
		return { objects: keys.map((key) => ({ key })), delimitedPrefixes: [], truncated: false };
	}
	keys() { return [...this.store.keys()]; }
}

test("dbg push discover via app", async () => {
	const bucket = new MemR2();
	const base = mkdtempSync(join(tmpdir(), "dbg-push-"));
	const dbFile = join(base, "test.db");
	const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
	const db = await createQueryDb(target);
	const now = new Date().toISOString();
	await run(db, `INSERT INTO users (id, created_at, name, email) VALUES (?, ?, ?, ?)`, [OWNER_ID, now, "owner", "o@e.com"]);
	await run(db, `INSERT INTO "repositories" ("id","created_at","ownerId","name","lowerName","description","defaultBranch","website","isPrivate","isArchived","isMirror","isTemplate","objectFormatName","topics","numStars","numForks","numOpenIssues","numClosedIssues","size","avatar","status") VALUES (?,?,?,?,?,?,?,?,0,0,0,0,'sha1','[]',0,0,0,0,0,'',0)`, [REPO_ID, now, OWNER_ID, "repo", "repo", "t", "main", ""]);

	const gitBackend = r2GitBackend(bucket as any);
	const app = new Hono();
	app.use("*", async (c, next) => {
		const env = (c.env as Record<string, unknown>) ?? {};
		env.auth = { api: { getSession: async () => ({ user: { id: OWNER_ID, name: "owner" } }) } };
		(c as unknown as { env: unknown }).env = env;
		await next();
	});
	app.route("/api", buildQueryApp(db, undefined, gitBackend));
	mountGitRoutes(app, { db, gitBackend });

	// Direct: after ensureRepo, what does listRefs see?
	await gitBackend.ensureRepo("owner", "repo");
	const fs = gitBackend.fsFor("owner", "repo");
	const gitdir = gitBackend.gitdirFor("owner", "repo");
	console.log("keys after ensureRepo:", JSON.stringify(bucket.keys()));
	try {
		const refs = await listRefs(fs, gitdir);
		console.log("listRefs direct:", JSON.stringify(refs));
	} catch (e) {
		console.log("listRefs direct threw:", (e as Error).message);
	}

	// Now via HTTP
	const res = await app.request(`http://localhost/owner/repo.git/info/refs?service=git-receive-pack`);
	console.log("info/refs status:", res.status);
	if (res.status !== 200) console.log("body:", await res.text());
	console.log("keys after HTTP:", JSON.stringify(bucket.keys()));
	try {
		const refs2 = await listRefs(fs, gitdir);
		console.log("listRefs after HTTP:", JSON.stringify(refs2));
	} catch (e) {
		console.log("listRefs after HTTP threw:", (e as Error).message);
	}
	await db.$client?.close?.();
	rmSync(base, { recursive: true, force: true });
});
