import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import build from '@hono/vite-build/cloudflare-workers'
import { defineConfig } from 'vite'
import honox from 'honox/vite'
import ttsc from '@ttsc/unplugin/vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

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
		ttsc(),
		honox({
			entry: 'app/server.cf.ts',
			client: { input: ['/app/client.ts', '/app/style.css'] },
		}),
		build({
			entry: 'app/server.cf.ts',
			outputDir: resolve(rootDir, 'dist/ui-cf'),
			emptyOutDir: true,
			staticRoot: resolve(rootDir, 'app/public'),
		}),
	],
	// The app imports the Panda design-system via the bare specifier
	// `design-system/*` — alias it to the generated outdir at the repo root
	// (same as vite.ui.config.ts).
	resolve: {
		alias: {
			'design-system': resolve(rootDir, 'design-system'),
		},
	},
})
