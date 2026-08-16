/**
 * lib/api — the SSR route → /api HTTP bridge.
 *
 * Route handlers call `apiFetch` / `apiPostForm` instead of touching
 * `c.env.sql`. Each call is a real same-origin HTTP request to the JSON API;
 * the service layer (mounted under `/api`) does the actual querying. This is
 * what keeps SQL out of the UI layer entirely.
 *
 * - Auth cookies are forwarded so session-scoped endpoints work.
 * - For 3xx responses (the mutation endpoints reply with redirects) the
 *   Response is returned as-is, so the route streams it straight to the
 *   browser (preserving POST/redirect semantics, no resubmission).
 * - For JSON responses the `data` field of the `{ ok, data }` envelope is
 *   returned (or `null` if the response is not ok).
 */
import type { Context } from 'hono'

/**
 * The JSON query app (`buildQueryApp`) is mounted under `/api` (see
 * `app/server.ts` / `scripts/serve.ts`), so every `/page/*` and `/api/*`
 * endpoint is actually reachable at `/api/...`. `apiFetch`/`apiPostForm` take
 * the "logical" path (e.g. `/page/home`) and this helper rewrites it to the
 * real mount point so callers don't have to remember the prefix.
 */
function toApiUrl(path: string, base: string): URL {
	const prefixed = path.startsWith('/api') ? path : `/api${path}`
	return new URL(prefixed, base)
}

/** GET a JSON endpoint and return its `data` (or `null` on failure). */
export async function apiFetch(c: Context, path: string): Promise<unknown> {
	const url = toApiUrl(path, c.req.url)
	const headers = new Headers()
	const cookie = c.req.header('cookie')
	if (cookie) headers.set('cookie', cookie)

	try {
		const res = await fetch(new Request(url.toString(), { method: 'GET', headers, redirect: 'manual' }))
		if (res.status >= 300 && res.status < 400 && res.headers.has('location')) return res
		if (!res.ok) {
			console.error(`[apiFetch] GET ${path} -> ${res.status}`)
			return null
		}
		const text = await res.text()
		if (!text) return null
		try {
			return JSON.parse(text)?.data ?? null
		} catch {
			return null
		}
	} catch (err) {
		console.error('[apiFetch]', err)
		return null
	}
}

/**
 * Forward a form POST to a `/page/*` mutation endpoint. The raw request body
 * (form-encoded) is streamed through untouched so the API's `parseBody` sees
 * the exact same fields. Returns the API's response (a redirect, which the
 * caller streams back to the browser).
 */
export async function apiPostForm(c: Context, path: string): Promise<Response> {
	const url = toApiUrl(path, c.req.url)
	const headers = new Headers()
	const cookie = c.req.header('cookie')
	if (cookie) headers.set('cookie', cookie)
	const ct = c.req.header('content-type')
	if (ct) headers.set('content-type', ct)

	try {
		const res = await fetch(
			new Request(url.toString(), {
				method: 'POST',
				headers,
				redirect: 'manual',
				body: c.req.raw.body ?? null,
			}),
		)
		if (res.status >= 300 && res.status < 400 && res.headers.has('location')) return res
		if (!res.ok) {
			console.error(`[apiPostForm] POST ${path} -> ${res.status}`)
		}
	} catch (err) {
		console.error('[apiPostForm]', err)
	}
	// Fallback: bounce back to the referring page.
	return c.redirect(c.req.url)
}
