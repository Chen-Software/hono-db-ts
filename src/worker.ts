/**
 * Cloudflare Worker entry point.
 *
 * NOTE: this must import from `./worker/index` explicitly — a bare `./worker`
 * would resolve to THIS file (`src/worker.ts` wins over the `src/worker/`
 * directory), creating a self-import cycle and an empty bundle.
 *
 * The default export is the active dialect's `{ fetch }` handler, selected at
 * build time by `src/worker/index.ts` via the `dbWorkerSpecifier` macro (Bun
 * inlines it, so only one backend ships in `dist/worker.js`).
 */
export { default } from "./worker/index";
