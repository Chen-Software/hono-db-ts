import { test } from "bun:test";
import * as git from "isomorphic-git";
import { r2GitBackend } from "./backend";
import { listRefs } from "./refs";

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

test("dbg init on r2", async () => {
	const bucket = new MemR2();
	const backend = r2GitBackend(bucket as any);
	await backend.ensureRepo("owner", "repo");
	console.log("keys after init:", JSON.stringify(bucket.keys(), null, 2));
	const fs = backend.fsFor("owner", "repo");
	const gitdir = backend.gitdirFor("owner", "repo");
	try {
		const refs = await listRefs(fs, gitdir);
		console.log("refs:", JSON.stringify(refs));
	} catch (e) {
		console.log("listRefs threw:", (e as Error).message);
	}
	try {
		const branches = await git.listBranches({ fs, gitdir });
		console.log("branches:", branches);
	} catch (e) {
		console.log("listBranches threw:", (e as Error).message);
	}
});
