/**
 * `Transport` — the abstraction over *how* a request reaches a remote (or
 * local) endpoint.
 *
 * Why this exists, and why it is a SERVICE and not a capacity:
 *
 * The `Connectable` capacity declares that a MODEL participates in a remote
 * source ("this model can be fetched/called from `/posts`"). But the actual
 * bytes-on-the-wire are infrastructure — HTTP, a TCP socket, or, in a
 * local-first app, an in-process dispatch to a localhost service (or even a
 * CLI/WebUI talking to that same service). That I/O belongs in a *transport
 * driver*, injected by name, exactly like the `Store` drivers (`FsStore`,
 * `HttpStore`, `GitStore`) and the `EventBus`. The model stays pure; the
 * transport is swappable per deployment (real HTTP in prod, `LocalTransport`
 * in tests / local-first) without touching the model.
 *
 * The unifying shape is deliberately tiny — `request → response` over a
 * normalised request object. Every backend you named is the same operation;
 * only the *address* and the *medium* differ, which is the driver's problem:
 *
 *   - `HttpTransport`  → `fetch(baseUrl + path)` over the network (REST/RPC).
 *   - `LocalTransport` → dispatch IN-PROCESS to a Hono app (no network at all —
 *                         the local-first case: same service, zero latency,
 *                         no running server required).
 *   - (future) `TcpTransport` / `WsTransport` → streaming medium.
 *
 * "Which endpoint maps to which model" is resolved by EXPLICIT binding in the
 * `Connectable` capacity options (a route template + a transport NAME looked
 * up in `TransportRegistry`) — there is no implicit pooler or runtime
 * guessing. Just as `StoreRegistry` / `BusRegistry` provide the DI seam for
 * persistence and events, `TransportRegistry` does it for requests.
 */

/** A normalised outbound request — medium-agnostic. */
export interface TransportRequest {
	/** HTTP method / operation kind. */
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	/** Route path or template, e.g. `/posts` or `/posts/:id`. */
	path: string;
	/** Path-template substitutions (`":id" → "42"`). */
	params?: Record<string, string | number>;
	/** Query string parameters (coerced to strings by the transport). */
	query?: Record<string, unknown>;
	/** Request headers. */
	headers?: Record<string, string>;
	/** Request body (serialised by the transport; typically JSON). */
	body?: unknown;
}

/** A normalised inbound response. */
export interface TransportResponse {
	status: number;
	headers: Record<string, string>;
	/** Parsed body — JSON-decoded by the transport, or raw `Uint8Array`. */
	body: unknown;
}

/** The contract every driver implements. */
export interface Transport {
	/** Human-readable name (e.g. `"http"`, `"local"`). */
	readonly name: string;
	/** Execute a request and resolve the normalised response. */
	execute(req: TransportRequest): Promise<TransportResponse>;
}

/** Expand a `":id"`-style path template with `params`. */
function expandPath(
	path: string,
	params?: Record<string, string | number>,
): string {
	if (!params) return path;
	return path.replace(/:([A-Za-z_][\w]*)/g, (_, key: string) => {
		const v = params[key];
		if (v === undefined) {
			throw new Error(`Transport: path "${path}" needs param ":${key}"`);
		}
		return encodeURIComponent(String(v));
	});
}

/** Build a query string from a params record (skips undefined). */
function toQueryString(query?: Record<string, unknown>): string {
	if (!query) return "";
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(query)) {
		if (v === undefined || v === null) continue;
		if (Array.isArray(v)) {
			for (const item of v) sp.append(k, String(item));
		} else {
			sp.append(k, String(v));
		}
	}
	const s = sp.toString();
	return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// HttpTransport — real network I/O via the platform `fetch`.
// ---------------------------------------------------------------------------
export interface HttpTransportOptions {
	/** Base URL, e.g. `"https://api.example.com"` or `"http://localhost:8787"`. */
	baseUrl: string;
	/** Default headers merged into every request (e.g. `Authorization`). */
	defaultHeaders?: Record<string, string>;
}

export class HttpTransport implements Transport {
	readonly name = "http";
	constructor(private readonly opts: HttpTransportOptions) {}

	async execute(req: TransportRequest): Promise<TransportResponse> {
		const url =
			this.opts.baseUrl.replace(/\/$/, "") +
			expandPath(req.path, req.params) +
			toQueryString(req.query);
		const headers: Record<string, string> = {
			...(this.opts.defaultHeaders ?? {}),
			...(req.headers ?? {}),
		};
		const hasBody = req.body !== undefined;
		if (hasBody && !("content-type" in headers)) {
			headers["content-type"] = "application/json";
		}
		const res = await fetch(url, {
			method: req.method,
			headers,
			body: hasBody ? JSON.stringify(req.body) : undefined,
		});
		const buf = await res.arrayBuffer();
		const ct = res.headers.get("content-type") ?? "";
		const body =
			ct.includes("application/json") || ct.includes("+json")
				? JSON.parse(new TextDecoder().decode(buf))
				: new Uint8Array(buf);
		const outHeaders: Record<string, string> = {};
		res.headers.forEach((v, k) => {
			outHeaders[k] = v;
		});
		return { status: res.status, headers: outHeaders, body };
	}
}

// ---------------------------------------------------------------------------
// LocalTransport — in-process dispatch (local-first, no network).
//
// Bun's Hono app exposes `app.request(Request)` which runs the matching
// handler in-process and returns a `Response` — identical to a real HTTP
// request but with zero socket round-trip. This is the local-first seam: the
// SAME `UserService` / `PostService` Hono app serves both the network and the
// in-process model, so `Post.fetch({ id })` and `GET /posts/:id` are the same
// code path. Also accepts any `(Request) => Response | Promise<Response>`
// handler, so it works without Hono too.
// ---------------------------------------------------------------------------
export type LocalHandler = {
	request(req: Request): Promise<Response> | Response;
};

export class LocalTransport implements Transport {
	readonly name = "local";
	constructor(
		private readonly handler:
			| LocalHandler
			| ((r: Request) => Response | Promise<Response>),
	) {}

	async execute(req: TransportRequest): Promise<TransportResponse> {
		const path = expandPath(req.path, req.params) + toQueryString(req.query);
		const headers = new Headers(req.headers ?? {});
		if (req.body !== undefined && !headers.has("content-type")) {
			headers.set("content-type", "application/json");
		}
		const request = new Request(`http://local${path}`, {
			method: req.method,
			headers,
			body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
		});
		const fn = "request" in this.handler ? this.handler.request : this.handler;
		const res = await fn(request);
		const buf = await res.arrayBuffer();
		const ct = res.headers.get("content-type") ?? "";
		const body =
			ct.includes("application/json") || ct.includes("+json")
				? JSON.parse(new TextDecoder().decode(buf))
				: new Uint8Array(buf);
		const outHeaders: Record<string, string> = {};
		res.headers.forEach((v, k) => {
			outHeaders[k] = v;
		});
		return { status: res.status, headers: outHeaders, body };
	}
}

// ---------------------------------------------------------------------------
// TransportRegistry — the DI seam (name → Transport).
// ---------------------------------------------------------------------------
const TRANSPORTS = new Map<string, Transport>();

export function registerTransport(t: Transport): void {
	TRANSPORTS.set(t.name, t);
}

export function getTransport(name: string): Transport {
	const t = TRANSPORTS.get(name);
	if (!t) {
		throw new Error(
			`TransportRegistry: no transport "${name}". ` +
				`Known: ${[...TRANSPORTS.keys()].join(", ") || "(none)"}.`,
		);
	}
	return t;
}

export function hasTransport(name: string): boolean {
	return TRANSPORTS.has(name);
}
