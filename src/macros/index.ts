// `./envs` is the MACRO module. The `with { type: "macro" }` attribute (SINGULAR
// — Bun silently ignores the plural "macros") marks every export as a Bun macro,
// so callers that invoke these functions (e.g. `if (isD1())`, `!isProd()`) get the
// literal result inlined at build time. This is what enables dead-code elimination
// of `typia.reflect` in production and of the `bun:sqlite` / D1 / R2 code paths
// selected by `isSqlite()` / `isD1()` / `r2Enabled()`.
//
// NOTE: re-export barrels cannot themselves be consumed `with { type: "macro" }`
// (Bun throws `export from cannot be used with "type": "macro"`). The build-time
// inlining done by this repo imports `@/macros/envs` DIRECTLY `with { type:
// "macro" }` (see `src/main.ts`, `src/cf-worker.ts`, `scripts/build.ts`). This
// barrel is a PLAIN re-export for any non-inlined runtime consumer.
export {
	allowedOrigin,
	apiToken,
	d1Database,
	databaseType,
	env,
	isD1,
	isDev,
	isProd,
	isSqlite,
	isTurso,
	port,
	r2Bucket,
	r2Enabled,
	otelEnabled,
	otelEndpoint,
	otelHeaders,
	otelServiceName,
	betterAuthEnabled,
	betterAuthUrl,
	betterAuthSecret,
	workerUrl,
} from "./envs";
