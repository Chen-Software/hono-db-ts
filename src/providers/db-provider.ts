import {
	type BlobStoreObject,
	type BlobStoreProvider,
	type BlobStoreQuery,
	decodeJson,
	matchesFilter,
} from "./blob-store";

/**
 * `DbClient` — the SQL-ish client contract, in DOCUMENT-IN-DB form.
 *
 * We deliberately store ONE ROW PER KEY with a `blob` column rather than
 * mapping each entity field to a column. That keeps `DbProvider` a *drop-in*
 * replacement for `ObjectStoreProvider` / `FsProvider` under `StoreProvider`:
 * the same "UUID-named object" abstraction works whether the bytes live in S3,
 * on the filesystem, or in a `data BYTEA` column. The trade-off is that you
 * lose column-level SQL predicates — `query` filters locally, exactly like the
 * object store. If you need real relational columns, that is a *different*
 * provider shape (an `SqlRowProvider`) and deliberately out of scope here.
 *
 * A real implementation would issue:
 *   CREATE TABLE blobs (key TEXT PRIMARY KEY, data BYTEA, updated_at TIMESTAMPTZ)
 *   INSERT ... ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data
 * and `listKeys(prefix)` would be `SELECT key FROM blobs WHERE key LIKE $1`.
 */
export interface DbClient {
	readonly name: string;
	putBlob(key: string, data: Uint8Array): Promise<void>;
	getBlob(key: string): Promise<Uint8Array | undefined>;
	deleteBlob(key: string): Promise<void>;
	listKeys(prefix?: string): Promise<string[]>;
}

/**
 * `MemoryDbClient` — in-process reference implementation of `DbClient` (a
 * `Map<key, blob>`). It proves the document-in-DB mapping without a running
 * database and stands in for tests; swap in a `PostgresDbClient` /
 * `SqliteDbClient` for production without touching `DbProvider`.
 */
export class MemoryDbClient implements DbClient {
	readonly name = "memory-db";
	private map = new Map<string, Uint8Array>();
	async putBlob(key: string, data: Uint8Array): Promise<void> {
		this.map.set(key, data);
	}
	async getBlob(key: string): Promise<Uint8Array | undefined> {
		return this.map.get(key);
	}
	async deleteBlob(key: string): Promise<void> {
		this.map.delete(key);
	}
	async listKeys(prefix = ""): Promise<string[]> {
		return [...this.map.keys()].filter((k) => k.startsWith(prefix));
	}
}

/**
 * `DbProvider` — adapts a `DbClient` to the uniform `BlobStoreProvider` contract.
 * Row key <-> object key; `data BYTEA` <-> blob. `query` enumerates + filters
 * locally, mirroring the object-store backend.
 */
export class DbProvider implements BlobStoreProvider {
	readonly name: string;
	constructor(
		private client: DbClient,
		name = `db:${client.name}`,
	) {
		this.name = name;
	}

	async get(key: string): Promise<BlobStoreObject | undefined> {
		const data = await this.client.getBlob(key);
		return data ? { key, data } : undefined;
	}
	async put(key: string, data: Uint8Array): Promise<void> {
		await this.client.putBlob(key, data);
	}
	async delete(key: string): Promise<void> {
		await this.client.deleteBlob(key);
	}
	async list(prefix = ""): Promise<string[]> {
		return this.client.listKeys(prefix);
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
