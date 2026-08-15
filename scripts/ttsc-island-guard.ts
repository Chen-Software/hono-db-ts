/**
 * ttsc-island-guard — harden the ttsc (typia) Vite plugin so it NEVER runs its
 * transform on honox island components or the Better Auth wiring.
 *
 * Root cause this fixes
 * ---------------------
 * honox's `transform-island-components` plugin rewrites each island source in
 * its `load()` hook into a HonoXIsland wrapper:
 *
 *     import.meta.env.SSR ? <HonoXIsland componentName=… Component=… props=…/>
 *                         : <Component {...props}/>
 *
 * `createClient()` scans the SSR HTML for the emitted `<honox-island>` markers
 * and dynamically imports the island chunk to hydrate it. If the wrapper is
 * missing, the island ships as a static component and never hydrates — which is
 * exactly what broke ~40 interactive islands on the Cloudflare Workers build.
 *
 * ttsc's typia transform (`enforce: "pre"`) re-emits that generated wrapper code
 * and silently drops the `HonoXIsland` wrapper. It also mangles `src/auth/*`
 * (strips the `drizzleAdapter` / `drizzle-orm/d1` wiring), which broke the auth
 * database connection on Workers (sign-up/session returned 500).
 *
 * Both are pure runtime wiring with no typia type assertions, so skipping typia
 * for them is completely safe.
 *
 * Why the guard lives at the `transform` hook (not `transformInclude`)
 * --------------------------------------------------------------------
 * unplugin's Vite adapter consumes the factory's `transformInclude` *internally*
 * via closure, so it is NOT exposed as a top-level hook that Vite consults.
 * The only reliable interception point is the `transform` hook itself: we
 * short-circuit skipped paths there and hand the source straight back, bypassing
 * typia entirely.
 */

import ttsc from '@ttsc/unplugin/vite'

/**
 * Paths ttsc must never typia-transform:
 *  - honox island components (`app/islands/*.tsx`, `src/islands/*.tsx`)
 *  - the Better Auth wiring (`src/auth/*.ts`)
 */
const SKIP_TYPIA =
	/\/(?:app|src)\/islands\/[^/]+\.tsx$|\/src\/auth\/[^/]+\.ts$/

/** Vite passes ids that may carry a query (`?v=…`, `?ssr`) or `\0` prefix. */
function moduleBasePath(id: string): string {
	const withoutNul = id.includes('\0') ? id.slice(id.lastIndexOf('\0') + 1) : id
	return withoutNul.split('?')[0]
}

/** The ttsc Vite plugin (array or single object). */
function isVitePlugin(x: unknown): x is { name: string; transform?: unknown } {
	return typeof x === 'object' && x !== null && 'name' in x
}

/**
 * Returns the ttsc plugin(s) with `transform` hardened to skip islands + auth.
 */
export function guardedTtsc() {
	const plugins = ttsc()
	const list = Array.isArray(plugins) ? plugins : [plugins]
	return list.map((p) => {
		if (!isVitePlugin(p) || p.name !== 'ttsc-unplugin') return p
		const originalTransform = p.transform as
			| ((this: unknown, source: string, id: string) => unknown)
			| undefined
		return {
			...p,
			async transform(source: string, id: string) {
				// Island / auth: return the source untouched, bypassing typia.
				if (SKIP_TYPIA.test(moduleBasePath(id))) return source
				if (typeof originalTransform !== 'function') return undefined
				return await originalTransform.call(this, source, id)
			},
		}
	})
}
