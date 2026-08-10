import {
	type Store,
	StoreError,
	type StoreObject,
	type StoreQuery,
} from "./store";

/**
 * `HttpStore` — a `Store` reached over HTTP. This is the universal remote
 * backend: point it at a DB service, an S3-compatible gateway, a LakeFS
 * endpoint (with branch/commit sent as headers), or a localhost web service
 * wrapping `localStorage`/`IndexedDB`. The MODEL treats them all identically.
 *
 * Bytes go over the wire as `application/octet-stream`; `query` POSTs a
 * serialisable `{ prefix, filter, limit }` body and expects an array of
 * `{ key, data (base64) }` back. (LakeFS is just an `HttpStore` with
 * `branch`/`commit` headers — no separate class needed.)
 */
export interface HttpStoreOptions {
	headers?: Record<string, string>;
	/** Extra headers per operation (e.g. LakeFS branch/commit). */
	perOpHeaders?: (op: string) => Record<string, string> | undefined;
}

export class HttpStore implements Store {
	readonly name = "http";
	constructor(
		private baseUrl: string,
		private opts: HttpStoreOptions = {},
	) {}

	private async req(
		method: string,
		key: string | null,
		body?: Uint8Array | object,
	): Promise<Response> {
		const url =
			key == null ? this.baseUrl : `${this.baseUrl}/${encodeURIComponent(key)}`;
		const headers: Record<string, string> = { ...(this.opts.headers ?? {}) };
		if (this.opts.perOpHeaders)
			Object.assign(headers, this.opts.perOpHeaders(method) ?? {});
		const init: RequestInit = { method, headers };
		if (body instanceof Uint8Array) {
			init.body = body;
			headers["content-type"] = "application/octet-stream";
		} else if (body !== undefined) {
			init.body = JSON.stringify(body);
			headers["content-type"] = "application/json";
		}
		let res: Response;
		try {
			res = await fetch(url, init);
		} catch (e) {
			throw new StoreError(this.name, method, key ?? undefined, e);
		}
		if (!res.ok) {
			throw new StoreError(
				this.name,
				method,
				key ?? undefined,
				`HTTP ${res.status}`,
			);
		}
		return res;
	}

	async get(key: string): Promise<StoreObject | undefined> {
		const res = await this.req("GET", key);
		if (res.status === 404) return undefined;
		const buf = new Uint8Array(await res.arrayBuffer());
		const meta = res.headers.get("x-store-meta");
		return { key, data: buf, meta: meta ? JSON.parse(meta) : undefined };
	}

	async put(
		key: string,
		data: Uint8Array,
		meta?: Record<string, string>,
	): Promise<void> {
		const headers: Record<string, string> = {};
		if (meta) headers["x-store-meta"] = JSON.stringify(meta);
		await this.req("PUT", key, data);
		void headers;
	}

	async delete(key: string): Promise<void> {
		await this.req("DELETE", key);
	}

	async list(prefix = ""): Promise<string[]> {
		const res = await this.req("GET", null, undefined);
		const body = (await res.json()) as { keys: string[] };
		return (body.keys ?? []).filter((k) => k.startsWith(prefix));
	}

	async query(q: StoreQuery): Promise<StoreObject[]> {
		const res = await this.req("POST", "_query", q as object);
		const body = (await res.json()) as {
			results: { key: string; data: string }[];
		};
		return (body.results ?? []).map((r) => ({
			key: r.key,
			data: Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0)),
		}));
	}
}
