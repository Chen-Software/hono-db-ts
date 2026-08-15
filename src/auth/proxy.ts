/**
 * auth/proxy — island-independent forwarding of the auth form to Better Auth.
 *
 * The auth `<form>` is a HonoX island that, when it hydrates, calls Better
 * Auth's client (`signUp.email` / `signIn.email`) directly via `fetch`. But if
 * the client island fails to hydrate — e.g. a Workers build that didn't emit
 * the HonoX `<honox-island>` markers — the form does a native
 * `method="post"` submit to `/sign-up` / `/sign-in`. This module lets the
 * server forward that submission to Better Auth's real `/api/auth/...`
 * endpoint, so the form keeps working with zero client JS as a fallback.
 */

/** A Better Auth instance only needs `.handler` for our purposes. */
export interface AuthHandler {
	handler: (req: Request) => Promise<Response>;
}

/** Same-origin relative-path redirect validation (no open redirects). */
export function safeRedirectTarget(next?: string | null): string {
	if (next?.startsWith("/") && !next.startsWith("//")) return next;
	return "/";
}

/** Pull a human-readable message out of a Better Auth error response body. */
export function authErrorMessage(body: unknown): string | null {
	if (!body || typeof body !== "object") return null;
	const b = body as Record<string, unknown>;
	if (typeof b.message === "string" && b.message) return b.message;
	const err = b.error as Record<string, unknown> | undefined;
	if (err && typeof err.message === "string" && err.message) return err.message;
	return null;
}

export interface ForwardResult {
	status: number;
	setCookie: string[];
	body: unknown;
}

/**
 * Forward a JSON payload to Better Auth's `/api/auth/<endpoint>` handler and
 * return the status, Set-Cookie list, and parsed body — so the caller can
 * copy cookies onto a redirect or surface an error back in the form.
 *
 * We rebuild a `Request` aimed at the auth endpoint (the browser submits to
 * `/sign-up` or `/sign-in`, not `/api/auth/...`) with a JSON body, which
 * Better Auth always parses. The original `cookie` header is forwarded so any
 * existing session is visible to Better Auth.
 */
export async function forwardAuthForm(options: {
	auth: AuthHandler;
	endpoint: "/sign-up/email" | "/sign-in/email";
	payload: Record<string, unknown>;
	cookie?: string;
	origin: string;
}): Promise<ForwardResult> {
	const url = new URL(options.origin);
	url.pathname = `/api/auth${options.endpoint}`;
	const baReq = new Request(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(options.cookie ? { cookie: options.cookie } : {}),
		},
		body: JSON.stringify(options.payload),
	});
	const res = await options.auth.handler(baReq);

	// `getSetCookie()` is the modern, multi-cookie-safe API; fall back for
	// runtimes that only expose the concatenated `set-cookie` string.
	const headers = res.headers as unknown as {
		getSetCookie?: () => string[];
	};
	const setCookie =
		typeof headers.getSetCookie === "function"
			? headers.getSetCookie()
			: res.headers.get("set-cookie")
				? [res.headers.get("set-cookie") as string]
				: [];

	let body: unknown = null;
	try {
		body = await res.json();
	} catch {
		body = null;
	}

	return { status: res.status, setCookie, body };
}
