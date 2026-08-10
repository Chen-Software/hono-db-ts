/**
 * `Connectable` — a CAPACITY that declares a model's relationship to a remote
 * (or local) SOURCE, and hands back typed `fetch` / `call` operations.
 *
 * This is the model-behaviour half of the HTTP story. The OTHER two halves are
 * deliberately elsewhere, following the layering we settled on:
 *
 *   1. DECODE (pure)  → `SchemaModule.http` — turns an *incoming* query string /
 *      headers / param into a typed DTO. Used SERVER-side by handlers. No net.
 *   2. TRANSPORT (svc)→ `services/transport.ts` — the actual bytes-on-the-wire
 *      (`HttpTransport`, `LocalTransport`). Injected by name; swapped per env.
 *   3. CONNECTABLE (cap)→ THIS FILE — the model says "I can be pulled from /
 *      invoked at `/posts` via transport `X`", and offers `fetch`/`call`. It
 *      does NO I/O itself; it resolves a `Transport` from the registry and
 *      forwards, exactly like `Persistable.persist(repo)` forwards to a `Store`.
 *
 * Naming: I deliberately called this `Connectable` (not `Fetchable` /
 * `Querable` / `Callable` / `Runnable`), because those are each *narrower* than
 * what a bound source actually is — you can READ from it (`fetch`) AND ACT on
 * it (`call`), over HTTP, TCP, or in-process. "Connected to a source you can
 * pull from or invoke" is the one idea that survives every medium, so the
 * capacity owns the *binding* and the transport owns the *medium*.
 *
 * "Which model maps to which endpoint / transport?" is resolved by EXPLICIT
 * declaration here (`source` + `transport` name) — there is no implicit
 * pooler or runtime guessing. The `TransportRegistry` is the DI seam, exactly
 * like `StoreRegistry` / `BusRegistry`. Channels are distinct and named
 * (bus topics vs endpoint routes), never merged into one magical dispatcher.
 */

import type { Transport, TransportRequest } from "../services/transport";
import { getTransport } from "../services/transport";
import type { SchemaModule } from "./schema-module";

/** Options for the {@link Connectable} capacity. */
export interface ConnectableOptions {
	/**
	 * Base route template this model is served from, e.g. `/posts` or
	 * `/posts/:id`. Defaults to `/<schemaName>` (lower-cased) when omitted —
	 * but an explicit value is almost always clearer.
	 */
	source?: string;
	/**
	 * Name of the {@link Transport} to use, looked up in `TransportRegistry`.
	 * Defaults to `"http"`. For local-first / tests, bind `"local"`.
	 */
	transport?: string;
}

/** Criteria for a `fetch` — a GET against the bound source. */
export interface FetchCriteria {
	/** Path-template substitutions (`:id` → value). */
	params?: Record<string, string | number>;
	/** Query parameters (coerced to strings by the transport). */
	query?: Record<string, unknown>;
	/** Request headers. */
	headers?: Record<string, string>;
}

function decodeBody(mod: SchemaModule<any>, body: unknown): unknown {
	const from = mod.fromJSON;
	if (!from) {
		throw new Error(
			"Connectable: model has no `fromJSON` (needs JsonSerialisable " +
				"to decode the response body).",
		);
	}
	if (Array.isArray(body)) return body.map((b) => from(JSON.stringify(b)));
	return from(JSON.stringify(body));
}

/**
 * The capacity constructor. Uniform shape `(base, schemaModule, options?) =>
 * adornedClass`. Attaches static `fetch` / `fetchOne` / `call` to `Base`.
 */
export function Connectable(
	Base: any,
	schemaModule?: SchemaModule<any>,
	options?: ConnectableOptions,
): any {
	const mod = schemaModule;
	const schemaName = (Base as any).schemaName ?? Base.name ?? "Model";
	const source = options?.source ?? `/${schemaName.toLowerCase()}`;
	const transportName = options?.transport ?? "http";

	const transport = (): Transport => getTransport(transportName);

	async function run(req: TransportRequest): Promise<unknown> {
		const res = await transport().execute(req);
		if (res.status < 200 || res.status >= 300) {
			throw new Error(
				`Connectable: ${req.method} ${req.path} failed (${res.status}).`,
			);
		}
		return decodeBody(mod, res.body);
	}

	// --- GET: pull one or many from the source ------------------------------
	(Base as any).fetch = async (criteria?: FetchCriteria): Promise<unknown> =>
		run({
			method: "GET",
			path: source,
			params: criteria?.params,
			query: criteria?.query,
			headers: criteria?.headers,
		});

	// --- GET /:id: pull a single entity by id -------------------------------
	(Base as any).fetchOne = async (
		id: string | number,
		criteria?: Omit<FetchCriteria, "params">,
	): Promise<unknown> =>
		run({
			method: "GET",
			path: `${source}/:id`,
			params: { id, ...(criteria?.params ?? {}) },
			query: criteria?.query,
			headers: criteria?.headers,
		});

	// --- ACTION: invoke an operation on the source (RPC-style) --------------
	(Base as any).call = async (
		op: string,
		body?: unknown,
		criteria?: FetchCriteria,
	): Promise<unknown> =>
		run({
			method: "POST",
			path: op ? `${source}/${op}` : source,
			params: criteria?.params,
			query: criteria?.query,
			headers: criteria?.headers,
			body,
		});

	return Base;
}
