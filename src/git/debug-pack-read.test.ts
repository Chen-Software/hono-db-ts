import { test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
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
import type { R2Like } from "@/git/fs-r2";

const OWNER_ID = "00000000-0000-0000-0000-0000000000aa";
const REPO_ID = "11111111-1111-1111-1111-1111111111bb";
const OWNER = "owner";
const REPO = "repo";

class MemoryR2 implements R2Like {
	private store = new Map<string, Uint8Array>();
	async head(key: string) { const v = this.store.get(key); return v ? { size: v.byteLength } : null; }
	async get(key: string, opts?: { range?: { offset: number; length: number } }) {
		const v = this.store.get(key); if (!v) return null;
		if (opts?.range) return { async arrayBuffer() { return v.slice(opts.range!.offset, opts.range!.offset + opts.range!.length).buffer as ArrayBuffer; }, size: v.byteLength };
		return { async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer; }, size: v.byteLength };
	}
	async put(key: string, value: Uint8Array | string | ArrayBuffer) { this.store.set(key, new Uint8Array(value as ArrayBuffer)); }
	async delete(key: string) { this.store.delete(key); }
	async list(opts: { prefix?: string; delimiter?: string; cursor?: string; limit?: number } = {}) {
		const keys = [...this.store.keys()].filter((k) => k.startsWith(opts.prefix ?? ""));
		return { objects: keys.map((key) => ({ key })), delimitedPrefixes: [], truncated: false };
	}
}

function makeHttp(app: Hono) {
	return {
		async request({ url, method, headers, body }: any) {
			const req = new Request(url, {
				method,
				headers: new Headers(headers ?? {}),
				body: Array.isArray(body)
					? Buffer.concat(body.map((b: any) => Buffer.from(b)))
					: body instanceof Uint8Array
						? body
						: body == null
							? undefined
							: Buffer.from(body),
			});
			const res = await app.request(req);
			const buf = new Uint8Array(await res.arrayBuffer());
			const stream = new ReadableStream<Uint8Array>({ start(c) { if (buf.length) c.enqueue(buf); c.close(); } });
			return { statusCode: res.status, statusMessage: res.statusText, headers: Object.fromEntries(res.headers.entries()), body: stream };
		},
	};
}

test("debug: server pack-read correctness + clone dir creation", async () => {
	const bucket = new MemoryR2();
	const base = mkdtempSync(join(tmpdir(), "cf-dbg-"));
	const dbFile = join(base, "test.db");
	const db = await createQueryDb(resolveDatabaseTarget(`file:${dbFile}`, "sqlite"));
	await run(db, `INSERT INTO users (id, created_at, name, email, role, age) VALUES (?, ?, ?, ?, ?, ?)`, [OWNER_ID, new Date().toISOString(), OWNER, "o@e.com", "admin", 30]);
	await run(db, `INSERT INTO "repositories" ("id","created_at","ownerId","name","lowerName","description","defaultBranch","website","isPrivate","isArchived","isMirror","isTemplate","objectFormatName","topics","numStars","numForks","numOpenIssues","numClosedIssues","size","avatar","status") VALUES (?,?,?,?,?,?,?,?,0,0,0,0,'sha1','[]',0,0,0,0,0,'',0)`, [REPO_ID, new Date().toISOString(), OWNER_ID, REPO, REPO, "r", "main", ""]);
	const gitBackend = r2GitBackend(bucket);
	const app = new Hono();
	app.use("*", async (c, next) => { const env = (c.env as any) ?? {}; env.auth = { api: { getSession: async () => ({ user: { id: OWNER_ID, name: OWNER } }) } }; (c as any).env = env; await next(); });
	app.route("/api", buildQueryApp(db, undefined, gitBackend));
	mountGitRoutes(app, { db, gitBackend });
	const http = makeHttp(app);
	const clientFs = nodeFs();
	const dir = mkdtempSync(join(tmpdir(), "cf-dbg-client-"));
	const cloneDir = join(tmpdir(), "cf-dbg-clone-" + Math.random().toString(36).slice(2));
	try {
		const gitdir = gitBackend.gitdirFor(OWNER, REPO);
		const url = `http://localhost/${OWNER}/${REPO}.git`;
		await git.init({ fs: clientFs, dir, defaultBranch: "main" });
		await clientFs.promises.writeFile(join(dir, "README.md"), "# Hello\n");
		await git.add({ fs: clientFs, dir, filepath: "README.md" });
		await git.commit({ fs: clientFs, dir, message: "c1", author: { name: OWNER, email: "o@e.com" }, committer: { name: OWNER, email: "o@e.com" } });
		await git.push({ fs: clientFs, http, dir, url, ref: "main" });

		// (a) Read README blob via the SERVER fs (pack-aware).
		const fs = gitBackend.fsFor(OWNER, REPO);
		const head = await git.resolveRef({ fs, gitdir, ref: "refs/heads/main" });
		const { tree } = await git.readTree({ fs, gitdir, oid: (await git.readCommit({ fs, gitdir, oid: head })).commit.tree });
		const fileOid = (tree as any[]).find((e: any) => e.path === "README.md")!.oid;
		console.log("(a) server README blob oid:", fileOid);
		const content: any = await git.readObject({ fs, gitdir, oid: fileOid, format: "content" });
		const cBuf = content.object instanceof Uint8Array ? content.object : new Uint8Array(content.object as ArrayBuffer);
		console.log("(a) server README content:", JSON.stringify(new TextDecoder().decode(cBuf)));

		// (b) Clone with pre-created dir.
		mkdirSync(cloneDir, { recursive: true });
		await git.clone({ fs: clientFs, http, dir: cloneDir, url, singleBranch: true });
		const readme = String(await clientFs.promises.readFile(join(cloneDir, "README.md")));
		console.log("(b) clone README:", JSON.stringify(readme));
	} catch (e) {
		console.log("ERROR:", (e as Error).message, (e as Error).stack?.split("\n").slice(0, 5).join("\n"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
		rmSync(cloneDir, { recursive: true, force: true });
		rmSync(base, { recursive: true, force: true });
	}
});
