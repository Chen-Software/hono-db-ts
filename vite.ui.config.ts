import { resolve } from 'node:path'
import build from '@hono/vite-build/bun'
import { defineConfig } from 'vite'
import honox from 'honox/vite'
import ttsc from '@ttsc/unplugin/vite'

/**
 * Vite config for building the Honox UI (in /app) into a Bun-serveable Hono
 * app that `bun run src/main.ts serve` mounts.
 *
 *   - `ttsc` wires the typia transform so `@/macros` build-time macros resolve
 *     during the UI build too.
 *   - `honox` wires the file-system routes (`app/routes`) + islands, and builds
 *     the client bundle (`app/client.ts` + `app/style.css`).
 *   - Panda CSS (via `postcss.config.mjs` + `@pandacss/postcss`) compiles the
 *     utilities from `panda.config.ts` into `app/style.css`.
 *   - `@hono/vite-build/bun` emits `dist/ui/index.js` (a Hono app that serves
 *     SSR HTML + static assets via `hono/bun`'s `serveStatic`). `outputDir` is
 *     set here (the plugin overrides the top-level `build.outDir`).
 *
 * The project root stays the repo root so honox's `/app/routes/**` globs and
 * the `@/*` → `src/*` alias resolve as they do everywhere else.
 *
 * Usage:
 *   bun run src/main.ts ui:build        (or)   vite build -c vite.ui.config.ts
 *   bun run src/main.ts ui:dev          (or)   vite --config vite.ui.config.ts
 */
export default defineConfig({
  plugins: [
    ttsc(),
    honox({
      entry: 'app/server.ts',
      client: { input: ['/app/client.ts', '/app/style.css'] },
    }),
    build({
      outputDir: resolve(import.meta.dir, 'dist/ui'),
      emptyOutDir: true,
      staticRoot: resolve(import.meta.dir, 'app/public'),
    }),
  ],
  server: {
    port: 8787,
  },
})
