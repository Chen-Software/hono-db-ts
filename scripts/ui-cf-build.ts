/**
 * ui-cf-build — build the Honox UI (in /app) into a deployable Cloudflare
 * Worker entry.
 *
 *     bun run scripts/ui-cf-build.ts   (or via CLI: bun run src/main.ts ui:cf-build)
 *
 * Honox production builds run in TWO phases:
 *
 *   1. Client build (`mode: "client"`) — bundles `app/client.ts` + `app/style.css`
 *      into `dist/static/*` and writes `dist/.vite/manifest.json`.
 *   2. SSR build — bundles `app/server.cf.ts` (D1-backed UI + `/api`) into
 *      `dist/ui-cf/index.js` via the `@hono/vite-build/cloudflare-workers`
 *      adapter. The honox `Link`/`Script` components read the manifest to emit
 *      the hashed `/static/...` asset URLs.
 *
 * Each phase also runs the `ttsc` typia transform and Panda CSS.
 *
 * Output:
 *   - `dist/ui-cf/index.js` — the Worker entry (`wrangler.jsonc` main).
 *   - `dist/static/*`       — the client assets, served by Workers Static
 *     Assets (`wrangler.jsonc` `assets.directory`).
 *   - `dist/.vite/manifest.json` — asset manifest (honox hardcodes this path).
 */

import { build } from "vite";

// Phase 1 — client assets (static bundle + manifest).
await build({ configFile: "vite.ui.cf.config.ts", mode: "client" });
console.log("ui-cf-build: client bundle built.");

// Phase 2 — the SSR Hono app (dist/ui-cf/index.js).
await build({ configFile: "vite.ui.cf.config.ts" });
console.log("ui-cf-build: SSR app built to dist/ui-cf/.");
console.log("ui-cf-build: deploy with `bun run src/main.ts deploy` (or wrangler deploy).");
