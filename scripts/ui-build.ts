/**
 * ui-build — build the Honox UI (in /app) into a Bun-serveable Hono app.
 *
 *     bun run scripts/ui-build.ts      (or via CLI: bun run src/main.ts ui:build)
 *
 * Uses the dedicated Vite config (`vite.ui.config.ts`):
 *
 *   - the honox plugin wires the file-system routes + islands,
 *   - `@hono/vite-build/bun` emits `dist/ui/_worker.js` — a Hono app that serves
 *     SSR HTML + static assets via `hono/bun`'s `serveStatic`,
 *   - the `ttsc` plugin runs the typia transform so the `@/macros` build-time
 *     macros resolve at build time,
 *   - Panda CSS (postcss.config.mjs) compiles the utilities into `app/style.css`.
 *
 * Output is `dist/ui/` — `scripts/serve.ts` mounts it at `/` alongside the JSON
 * query app at `/api`.
 */

import { build } from "vite";

await build({ configFile: "vite.ui.config.ts" });

console.log("ui-build: built the Honox UI to dist/ui/");
console.log("ui-build: serve it with `bun run src/main.ts serve`");
