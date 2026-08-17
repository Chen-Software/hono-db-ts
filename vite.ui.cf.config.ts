import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import build from "@hono/vite-build/cloudflare-workers";
import { defineConfig, type Plugin } from "vite";
import honox from "honox/vite";
import { guardedTtsc } from "./scripts/ttsc-island-guard";

/**
 * isomorphic-git ships dual entry points: the `node` export condition
 * (`./index.cjs`, used by Vite's SSR resolver by default) pulls in
 * `tar-stream`/`bl`/`sha.js`/`inherits` — CJS packages that call
 * `createRequire(import.meta.url)("util")` at module load. The Workers
 * runtime's `nodejs_compat` cannot resolve bare `"util"`/`"buffer"` through
 * that dynamic require, so the worker crashes on boot
 * (`Uncaught TypeError: The argument 'path' ... must be ... an absolute path
 * string`). The browser entry (`./index.js`) uses Web-Platform-only deps
 * (`pako`, `crc-32`, `diff3`, `sha.js/sha1.js`, …) and is what the git
 * backend is written against (`Workers-safe`). Force it via alias.
 */
const isomorphicGitBrowser = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"node_modules/isomorphic-git/index.js",
);

const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * Drizzle's sqlite dialect chunks import `node:fs` / `node:fs/promises` /
 * `node:os` / `node:async_hooks` at module scope even though they never call
 * them. The Cloudflare Workers runtime has no real implementations of those
 * modules, so *importing* them throws at chunk-load time → the auth endpoints
 * (`drizzle(db)`) return 500 while the rest of the worker works fine.
 *
 * These imports are dead (no `readFile`/`writeFile`/… is ever referenced), so
 * we can safely strip them from every emitted chunk. Works for both the entry
 * and dynamically-imported dialect chunks.
 */
function stripNodeBuiltins(): Plugin {
	return {
		name: "strip-node-builtins",
		generateBundle(_options, bundle) {
			for (const name of Object.keys(bundle)) {
				const chunk = bundle[name];
				if (chunk?.type !== "chunk") continue;
				let code = chunk.code;
				// Drop bare side-effect imports of node builtins that Workers lacks.
				code = code.replace(
					/import"node:(fs|fs\/promises|os|path|async_hooks|util|url|buffer|stream|events|crypto)";/g,
					"",
				);
				// Drop `import X from "node:..."` default/namespace imports (drizzle
				// imports them but never calls them — dead imports crash chunk load
				// on Workers, which has no real implementations).
				code = code.replace(
					/import\s+\w+\s+from"node:(?:fs|fs\/promises|os|path|async_hooks|util|url|buffer|stream|events|crypto)";/g,
					"",
				);
				if (code !== chunk.code) {
					chunk.code = code;
				}
			}
		},
	};
}

/**
 * Vite config for building the Honox UI (in /app) into a CLOUDFLARE WORKERS
 * entry (`dist/ui-cf/index.js`) that serves SSR HTML + the `/api` query app.
 *
 * Same pipeline as `vite.ui.config.ts` (ttsc typia transform, honox routes +
 * islands, Panda CSS) but the `@hono/vite-build/cloudflare-workers` adapter
 * instead of the Bun one, and the UI server entry is `app/server.cf.ts` (D1
 * backed, mounts `/api` under the same prefix local serve uses).
 *
 * Build:  vite build -c vite.ui.cf.config.ts
 * Deploy: `wrangler.jsonc` main points at `dist/ui-cf/index.js`.
 */
export default defineConfig({
	plugins: [
		stripNodeBuiltins(),
		guardedTtsc(),
		honox({
			entry: "app/server.cf.ts",
			client: { input: ["/app/client.ts", "/app/style.css"] },
		}),
		build({
			entry: "app/server.cf.ts",
			outputDir: resolve(rootDir, "dist/ui-cf"),
			emptyOutDir: true,
			staticRoot: resolve(rootDir, "app/public"),
			// honox's server entry uses top-level `await` (reading the client
			// manifest), which the default `ssrTarget: "webworker"` rejects.
			// The Workers runtime supports top-level await, so raise the target.
			ssrTarget: "esnext",
			// The Workers runtime has no real `node:*` implementations (even with
			// `nodejs_compat`, fs/os/path/async_hooks are edge stubs). Drizzle's
			// d1 adapter chunk imports them at module scope, which crashes the
			// auth endpoints (`import("node:fs/promises")` throws → 500). Keep
			// them external so they don't break chunk loading at runtime.
			external: [
				"bun",
				"node:crypto",
				"node:fs",
				"node:fs/promises",
				"node:os",
				"node:path",
				"node:async_hooks",
				"node:util",
				"node:url",
				"node:buffer",
				"node:stream",
				"node:events",
				"node:sqlite",
			],
		}),
	],
	// `with { type: "macro" }` (Bun macros) is NOT understood by the Vite/Rollup
	// pipeline that builds this Workers entry, so `betterAuthEnabled()` would
	// stay a runtime call and never dead-code-eliminate here. Inject the same
	// build-time flag as a literal via `define` so `if (__BETTER_AUTH_ENABLED__)`
	// inlines to `if (false)` when disabled and the entire Better Auth subtree
	// (better-auth + drizzle adapter) is dropped from the deployed bundle.
	define: {
		__BETTER_AUTH_ENABLED__: JSON.stringify(
			process.env.BETTER_AUTH_ENABLED !== "false",
		),
	},
	// The app imports the Panda design-system via the bare specifier
	// `design-system/*` — alias it to the generated outdir at the repo root
	// (same as vite.ui.config.ts).
	resolve: {
		alias: {
			"design-system": resolve(rootDir, "design-system"),
			"@": resolve(rootDir, "src"),
			// isomorphic-git browser entry — see the header comment.
			"isomorphic-git": isomorphicGitBrowser,
		},
	},
	// esbuild-transpile (vite 5) reads `build.target` (not `ssr.target`) for the
	// SSR chunk too, and the default es2020 rejects honox's top-level `await`.
	// Workers supports top-level await, so raise it to esnext.
	build: {
		target: "esnext",
	},
});
