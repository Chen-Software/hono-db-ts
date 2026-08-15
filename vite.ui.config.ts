import { resolve } from 'node:path'
import build from '@hono/vite-build/bun'
import { defineConfig } from 'vite'
import honox from 'honox/vite'
import { guardedTtsc } from './scripts/ttsc-island-guard'

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
 *   - `@hono/vite-build/bun` emits `dist/index.js` (a Hono app that serves SSR
 *     HTML + static assets via `hono/bun`'s `serveStatic`). The UI must build
 *     to `dist/` because honox's `Link`/`Script` read the manifest from
 *     `<root>/dist/.vite/manifest.json`.
 *
 * The project root stays the repo root so honox's `/app/routes/**` globs and
 * the `@/*` → `src/*` alias resolve as they do everywhere else.
 *
 * Usage:
 *   bun run src/main.ts ui:build        (two-phase: client then SSR)
 *   bun run src/main.ts ui:dev          (dev server, HMR)
 */
export default defineConfig({
  plugins: [
    guardedTtsc(),
    honox({
      entry: 'app/server.ts',
      client: { input: ['/app/client.ts', '/app/style.css'] },
    }),
    build({
      // NOTE: honox's Link/Script read the manifest from the vite root at
      // `/dist/.vite/manifest.json`, so the UI must build to `dist/` (the
      // @hono/vite-build default). This coexists with the CLI (`dist/main.js`)
      // and worker (`dist/worker.js`) builds.
      //
      // staticRoot = dist so the generated `serveStatic({ root })` for the
      // `/static/*` route resolves `/static/x` → `dist/static/x` (the client
      // bundle). Viappo copies public → dist, so `/favicon.ico` works.
      staticRoot: resolve(process.cwd(), 'dist'),
    }),
  ],
  // `with { type: "macro" }` (Bun macros) is NOT understood by this Vite/Rollup
  // pipeline, so `betterAuthEnabled()` would stay a runtime call and never
  // dead-code-eliminate. Inject the same build-time flag as a literal via
  // `define` so `if (__BETTER_AUTH_ENABLED__)` inlines to `if (false)` when
  // disabled and Better Auth is dropped from the local UI bundle too.
  define: {
    __BETTER_AUTH_ENABLED__: JSON.stringify(process.env.BETTER_AUTH_ENABLED !== 'false'),
  },
  build: {
    outDir: resolve(process.cwd(), 'dist'),
    emptyOutDir: false,
    // honox's server entry uses top-level `await` (reading the client
    // manifest); esbuild-transpile reads `build.target` (default es2020) and
    // rejects it. Bun supports top-level await, so raise to esnext.
    target: 'esnext',
  },
  // `public` holds the UI's static files (favicon.ico, etc.); Vite copies
  // it into the build outDir so `/favicon.ico` is served by `serveStatic`.
  publicDir: resolve(process.cwd(), 'public'),
  // The app imports the Panda design-system via the bare specifier
  // `design-system/*` (e.g. `design-system/css`, `design-system/recipes`) —
  // alias it to the generated outdir at the repo root.
  resolve: {
    alias: {
      'design-system': resolve(process.cwd(), 'design-system'),
      '@': resolve(process.cwd(), 'src'),
    },
  },
  server: {
    port: 8787,
  },
  ssr: {
    // `bun` (SQL) is a Bun runtime builtin — keep it external in the dev SSR
    // pipeline so Vite doesn't try to resolve it from node_modules.
    external: ['bun'],
  },
})
