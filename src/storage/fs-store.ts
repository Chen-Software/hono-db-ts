import { promises as fs } from "node:fs";
import path from "node:path";
import {
	decodeJson,
	encodeJson,
	matchesFilter,
	type Store,
	StoreError,
	type StoreObject,
	type StoreQuery,
} from "./store";

/**
 * `FsStore` — a local-filesystem `Store`. `put` writes a file under `rootDir`;
 * `query` enumerates + filters JSON locally. This is the "local filesystem as an
 * object store" backend — it can sit behind a virtual FS, or a localhost web
 * service can wrap it to expose it as `HttpStore` to the browser.
 *
 * Keys are sanitised so a malicious `UserSchema/../../etc/passwd` cannot escape
 * `rootDir`.
 */
export class FsStore implements Store {
	readonly name: string;
	constructor(
		private rootDir: string,
		name = "fs",
	) {
		this.name = name;
	}

	private resolve(key: string): string {
		const full = path.resolve(this.rootDir, key);
		if (full !== this.rootDir && !full.startsWith(this.rootDir + path.sep)) {
			throw new StoreError(this.name, "resolve", key, "path escapes rootDir");
		}
		return full;
	}

	async get(key: string): Promise<StoreObject | undefined> {
		try {
			const data = await fs.readFile(this.resolve(key));
			return { key, data };
		} catch (e: any) {
			if (e?.code === "ENOENT") return undefined;
			throw new StoreError(this.name, "get", key, e);
		}
	}

	async put(
		key: string,
		data: Uint8Array,
		meta?: Record<string, string>,
	): Promise<void> {
		const full = this.resolve(key);
		await fs.mkdir(path.dirname(full), { recursive: true });
		await fs.writeFile(full, data);
		if (meta) {
			await fs.writeFile(full + ".meta.json", JSON.stringify(meta));
		}
	}

	async delete(key: string): Promise<void> {
		const full = this.resolve(key);
		await fs.rm(full, { force: true });
		await fs.rm(full + ".meta.json", { force: true });
	}

	async list(prefix = ""): Promise<string[]> {
		const out: string[] = [];
		const walk = async (dir: string, rel: string) => {
			let entries: import("node:fs").Dirent[];
			try {
				entries = await fs.readdir(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const e of entries) {
				if (e.name.endsWith(".meta.json")) continue;
				const childRel = rel ? `${rel}/${e.name}` : e.name;
				if (e.isDirectory()) await walk(path.join(dir, e.name), childRel);
				else if (childRel.startsWith(prefix)) out.push(childRel);
			}
		};
		await walk(this.rootDir, "");
		return out;
	}

	async query(q: StoreQuery): Promise<StoreObject[]> {
		const keys = await this.list(q.prefix ?? "");
		const out: StoreObject[] = [];
		for (const key of keys) {
			const obj = await this.get(key);
			if (!obj) continue;
			if (q.filter && !matchesFilter(decodeJson(obj.data), q.filter)) continue;
			out.push(obj);
			if (q.limit && out.length >= q.limit) break;
		}
		return out;
	}
}

export { encodeJson };
