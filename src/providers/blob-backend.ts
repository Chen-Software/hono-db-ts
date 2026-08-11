import {
	decodeJson,
	matchesFilter,
	type BlobStoreObject,
	type BlobStoreProvider,
} from "./blob-store";
import type { SchemaModule } from "../capacities/schema-module";
import type { EntityFilter, StoreBackend } from "./store-backend";

/**
 * `BlobBackend<E>` — the BLOB-shaped `StoreBackend` adapter.
 *
 * It wraps any `BlobStoreProvider` (object store, fs, db-as-blob — all the same
 * `key -> bytes` contract) and layers the entity abstraction on top: each entity
 * is ONE blob keyed by `<namespace>/<id>`, produced by the model's own
 * `SchemaModule.toJSON` (assert + stringify, so invalid data is rejected AT
 * WRITE) and read back via `SchemaModule.fromJSON`. `find` filters the decoded
 * JSON locally, mirroring the object-store behaviour.
 *
 * The stored bytes are the RAW JSON string (`TextEncoder.encode(toJSON(e))`),
 * exactly like the previous `StoreProvider` did — so the backends' own `query`
 * (object store / db) can `decodeJson` the bytes into an object and filter it.
 * We do NOT run the bytes through `encodeJson` again (that would double-encode
 * the already-string `toJSON` result and break filtering). The SQL-shaped path
 * (real relational columns) is the separate `SqlBackend`.
 */
export class BlobBackend<E> implements StoreBackend<E> {
	readonly kind = "blob" as const;

	constructor(
		private blob: BlobStoreProvider,
		private schema: SchemaModule<E>,
	) {}

	private key(ns: string, id: string): string {
		return `${ns}/${id}`;
	}

	async insert(ns: string, e: E): Promise<void> {
		const json = this.schema.toJSON(e); // assert + stringify -> JSON string
		await this.blob.put(
			this.key(ns, (e as { id: string }).id),
			new TextEncoder().encode(json),
		);
	}

	async get(ns: string, id: string): Promise<E | null> {
		const obj = await this.blob.get(this.key(ns, id));
		if (!obj) return null;
		return this.schema.fromJSON(new TextDecoder().decode(obj.data));
	}

	async update(ns: string, id: string, patch: Partial<E>): Promise<void> {
		const existing = await this.get(ns, id);
		if (!existing) return;
		const merged = { ...existing, ...patch } as E;
		await this.insert(ns, merged);
	}

	async delete(ns: string, id: string): Promise<void> {
		await this.blob.delete(this.key(ns, id));
	}

	async find(ns: string, filter: EntityFilter<E> = {}): Promise<E[]> {
		const prefix = `${ns}/`;
		const objs: BlobStoreObject[] = this.blob.query
			? await this.blob.query({
					prefix,
					filter: filter.where as Record<string, unknown>,
				})
			: await this.scan(ns, filter.where);
		let out = objs.map((o) =>
			this.schema.fromJSON(new TextDecoder().decode(o.data)),
		);
		if (filter.limit != null) out = out.slice(0, filter.limit);
		return out;
	}

	/** Fallback enumeration for backends without a native `query`. */
	private async scan(
		ns: string,
		where?: Record<string, unknown>,
	): Promise<BlobStoreObject[]> {
		const keys = await this.blob.list(`${ns}/`);
		const out: BlobStoreObject[] = [];
		for (const k of keys) {
			const o = await this.blob.get(k);
			if (!o) continue;
			if (where && !matchesFilter(decodeJson(o.data), where)) continue;
			out.push(o);
		}
		return out;
	}

	raw(): null {
		return null;
	}
}
