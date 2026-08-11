import { promises as fs } from "node:fs";
import path from "node:path";
import {
	type BlobStoreObject,
	type BlobStoreProvider,
	type BlobStoreQuery,
	decodeJson,
	matchesFilter,
	StoreError,
} from "./blob-store";

/**
 * `ObjectStoreClient` — the S3-like client contract.
 *
 * A real implementation wraps `aws-sdk` / `minio` / a compatible gateway and
 * speaks `putObject` / `getObject` / `deleteObject` / `listObjects` over the
 * wire. We keep the client seam narrow and backend-agnostic so the
 * `ObjectStoreProvider` adapter (below) never changes when you swap S3 for
 * MinIO for a localstack. The provider owns the `BlobStoreProvider` mapping;
 * the client owns only the object-store protocol.
 */
export interface ObjectStoreClient {
	readonly name: string;
	putObject(key: string, data: Uint8Array): Promise<void>;
	getObject(key: string): Promise<Uint8Array | undefined>;
	deleteObject(key: string): Promise<void>;
	listObjects(prefix?: string): Promise<string[]>;
}

/**
 * `LocalObjectStoreClient` — a DEV / TEST backend that implements
 * `ObjectStoreClient` over a local directory (object key -> file). It mirrors
 * the real contract exactly (keys are opaque strings, listed by prefix), so the
 * same `ObjectStoreProvider` you test with locally is what runs against S3 in
 * production. Swap the client, nothing else moves.
 *
 * Keys are sanitised exactly like `FsStore` so a hostile key cannot escape
 * `rootDir`.
 */
export class LocalObjectStoreClient implements ObjectStoreClient {
	readonly name = "local-object";
	constructor(private rootDir: string) {}

	private resolve(key: string): string {
		const full = path.resolve(this.rootDir, key);
		if (full !== this.rootDir && !full.startsWith(this.rootDir + path.sep)) {
			throw new StoreError(this.name, "resolve", key, "path escapes rootDir");
		}
		return full;
	}

	async putObject(key: string, data: Uint8Array): Promise<void> {
		const full = this.resolve(key);
		await fs.mkdir(path.dirname(full), { recursive: true });
		await fs.writeFile(full, data);
	}
	async getObject(key: string): Promise<Uint8Array | undefined> {
		try {
			return await fs.readFile(this.resolve(key));
		} catch (e: any) {
			if (e?.code === "ENOENT") return undefined;
			throw new StoreError(this.name, "getObject", key, e);
		}
	}
	async deleteObject(key: string): Promise<void> {
		await fs.rm(this.resolve(key), { force: true });
	}
	async listObjects(prefix = ""): Promise<string[]> {
		const out: string[] = [];
		const walk = async (dir: string, rel: string) => {
			let entries: import("node:fs").Dirent[];
			try {
				entries = await fs.readdir(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const e of entries) {
				const childRel = rel ? `${rel}/${e.name}` : e.name;
				if (e.isDirectory()) await walk(path.join(dir, e.name), childRel);
				else if (childRel.startsWith(prefix)) out.push(childRel);
			}
		};
		await walk(this.rootDir, "");
		return out;
	}
}

/**
 * `ObjectStoreProvider` — adapts an `ObjectStoreClient` to the uniform
 * `BlobStoreProvider` contract. The key -> object mapping is 1:1, so this is a
 * thin, faithful translation; `query` enumerates under the prefix and filters
 * the decoded JSON locally (object stores have no native predicate engine).
 */
export class ObjectStoreProvider implements BlobStoreProvider {
	readonly name: string;
	constructor(
		private client: ObjectStoreClient,
		name = `object:${client.name}`,
	) {
		this.name = name;
	}

	async get(key: string): Promise<BlobStoreObject | undefined> {
		const data = await this.client.getObject(key);
		return data ? { key, data } : undefined;
	}
	async put(key: string, data: Uint8Array): Promise<void> {
		await this.client.putObject(key, data);
	}
	async delete(key: string): Promise<void> {
		await this.client.deleteObject(key);
	}
	async list(prefix = ""): Promise<string[]> {
		return this.client.listObjects(prefix);
	}
	async query(q: BlobStoreQuery): Promise<BlobStoreObject[]> {
		const keys = await this.list(q.prefix ?? "");
		const out: BlobStoreObject[] = [];
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
