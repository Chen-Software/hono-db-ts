/**
 * ui-build — build the Honox UI (in /app) into a Bun-serveable Hono app.
 *
 *     bun run scripts/ui-build.ts      (or via CLI: bun run src/main.ts ui:build)
 *
 * Honox production builds run in TWO phases:
 *
 *   1. Client build (`mode: "client"`) — bundles `app/client.ts` + `app/style.css`
 *      into `dist/static/*` and writes `dist/.vite/manifest.json`.
 *   2. SSR build — bundles `app/server.ts` into `dist/index.js`; the honox
 *      `Link`/`Script` components read `dist/.vite/manifest.json` to emit the
 *      hashed `/static/...` asset URLs, and `@hono/vite-build/bun` wires
 *      `serveStatic` for them.
 *
 * Each phase also runs the `ttsc` typia transform (for `@/macros`) and Panda CSS.
 *
 * Output is `dist/` — `scripts/serve.ts` mounts `dist/index.js` at `/` alongside
 * the JSON query app at `/api`. (honox hardcodes the manifest path at
 * `<root>/dist/.vite/manifest.json`, so the UI must build to `dist/`; this
 * coexists with the CLI `dist/main.js` and worker `dist/worker.js` builds.)
 */

import { build } from "vite";

// Phase 1 — client assets (static bundle + manifest).
await build({ configFile: "vite.ui.config.ts", mode: "client" });
console.log("ui-build: client bundle built.");

// Phase 2 — the SSR Hono app (dist/index.js).
await build({ configFile: "vite.ui.config.ts" });
console.log("ui-build: SSR app built to dist/.");
console.log("ui-build: serve it with `bun run src/main.ts serve`");
