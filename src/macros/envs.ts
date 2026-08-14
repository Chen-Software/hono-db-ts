/**
 * Compile-time environment macros — imported by `macros/index.ts` with
is
 * a Bun macro: it is CALLED at the use site and replaced with the literal
 * result at BUILD time. The module is never shipped as runtime code.
 *
 * Dead-code elimination uses these: calling them (e.g. `if (isD1)`, `!isProd`)
 * lets the bundler drop the unselected branch, so `typia.reflect` is removed
 * from the production bundle and `bun:sqlite` is removed from the worker.
 *
 * HARD RULE — every macro reads `process.env` DIRECTLY. Calling a sibling macro
 * here (e.g. `isProd()` inside `databaseType()`) breaks Bun's macro inlining:
 * Bun evaluates the outer macro, cannot run the nested macro, silently falls
 * back to a runtime call, and DCE stops firing. So NO macro calls another
 * macro. `databaseType()` / `isSqlite()` / `isD1()` re-derive their answer from
 * `process.env` directly rather than delegating to each other.
 *
 * SECURITY — `apiToken()` is a macro and WOULD inline the token into any bundle
 * that references it. It is only for the local dev server / scripts (never
 * deployed) to authenticate TO the worker. The worker's own gate uses the
 * runtime `env.API_TOKEN` / `env.ALLOWED_ORIGIN` Cloudflare secret bindings,
 * never these macros, so the worker bundle never leaks the gate secret.
 */

/** Current runtime mode, resolved at BUILD time and inlined. Default "development". */
function env(): string {
	return process.env.NODE_ENV ?? "development";
}

/** True when built for development (NODE_ENV === "development"). */
function isDev(): boolean {
	return process.env.NODE_ENV === "development";
}

/** True when built for production (NODE_ENV === "production"). */
function isProd(): boolean {
	return process.env.NODE_ENV === "production";
}

/**
 * SQL backend selected at BUILD time.
 *   - "sqlite": local dev, backed by `bun:sqlite` via `LocalD1Database`.
 *   - "d1":     Cloudflare Workers, backed by the `env.DB` D1 binding.
 *   - "turso":  libSQL (Turso) — local embedded file OR managed Turso cloud,
 *               selected by `TURSO_URL` (`file:dev.db` locally, `libsql://…`
 *               in the cloud). SQLite dialect, so it shares the D1 schema.
 * Defaults: prod → "d1", otherwise → "sqlite", overridable via DATABASE_TYPE.
 */
function databaseType(): "sqlite" | "d1" | "turso" {
	const t = process.env.DATABASE_TYPE;
	if (t === "sqlite" || t === "d1" || t === "turso") return t;
	return process.env.NODE_ENV === "production" ? "d1" : "sqlite";
}

function databaseUrl(): string {
	return (
		process.env.DATABASE_URL ||
		(process.env.DATABASE_TYPE === "turso" && process.env.TURSO_URL)
	);
}

/** True when the build targets local sqlite (bun:sqlite). Drops the D1 path in dev. */
function isSqlite(): boolean {
	const t = process.env.DATABASE_TYPE;
	if (t === "sqlite" || t === "d1" || t === "turso") return t === "sqlite";
	return process.env.NODE_ENV !== "production";
}

/** True when the build targets Cloudflare D1. Drops bun:sqlite in the worker. */
function isD1(): boolean {
	const t = process.env.DATABASE_TYPE;
	if (t === "sqlite" || t === "d1" || t === "turso") return t === "d1";
	return process.env.NODE_ENV === "production";
}

/**
 * True when the build targets libSQL (Turso) — local embedded file OR managed
 * Turso cloud, selected by `TURSO_URL`. The schema is the SQLite dialect, so
 * the SAME `users` / `post_versions` tables the D1 build uses apply here.
 */
function isTurso(): boolean {
	const t = process.env.DATABASE_TYPE;
	if (t === "sqlite" || t === "d1" || t === "turso") return t === "turso";
	return false;
}

/**
 * Whether the R2 asset client is compiled in. Defaults to true (R2 capability
 * shipped, gated at runtime by the `env.ASSETS` binding) so the worker still
 * runs without R2 (in-memory fallback). Set `R2_ENABLED=false` to tree-shake
 * the entire R2 client out of the bundle for a minimal build.
 */
function r2Enabled(): boolean {
	return process.env.R2_ENABLED !== "false";
}

/** Local Bun dev server port (default 3000). */
function port(): number {
	return Number(process.env.PORT ?? 3000);
}

/** Public base URL of the deployed worker. */
function workerUrl(): string | undefined {
	return process.env.WORKER_URL;
}

/** Deployed R2 bucket name (reference only — not a credential). */
function r2Bucket(): string | undefined {
	return process.env.R2_BUCKET;
}

/** Deployed D1 database name (reference only — not a credential). */
function d1Database(): string | undefined {
	return process.env.D1_DATABASE;
}

/** Deployed D1 database ID (reference only — wrangler needs it in the binding). */
function d1DatabaseId(): string | undefined {
	return process.env.D1_DATABASE_ID;
}

/** Optional CORS allow-list origin (also a Cloudflare secret binding). */
function allowedOrigin(): string | undefined {
	return process.env.ALLOWED_ORIGIN;
}

/**
 * CLIENT-side bearer token: local dev server / scripts use it to authenticate
 * TO the deployed worker. NOT the worker's gate secret (that is the runtime
 * `env.API_TOKEN` Cloudflare binding). See the module SECURITY NOTE above.
 */
function apiToken(): string | undefined {
	return process.env.API_TOKEN;
}

function tursoUrl(): string | undefined {
	return process.env.TURSO_URL || process.env.DATABASE_URL;
}

function tursoAuthToken(): string | undefined {
	return process.env.TURSO_AUTH_TOKEN;
}

/**
 * Whether the OpenTelemetry (OTLP/JSON) query-metrics exporter is compiled in.
 * TRUE only when `OTEL_EXPORTER_OTLP_ENDPOINT` is a non-empty string at BUILD
 * time (read from `.env.<mode>`, loaded by Bun when `cf-build` runs with
 * `NODE_ENV=production`). This is the canonical build-time gate: it inlines to
 * a literal `true`/`false`, so `if (otelEnabled()) { … }` is resolved by the
 * bundler and the exporter branch — plus the dynamic `OtlpQueryMetricsSink`
 * import it contains — is dead-code-eliminated from any `.env` that has no
 * OTEL config. An empty string (`OTEL_EXPORTER_OTLP_ENDPOINT=`) resolves to
 * `false` so it does NOT enable the exporter.
 */
function otelEnabled(): boolean {
	return !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
}

/** Full OTLP metrics endpoint, e.g. https://otel.example.com/v1/metrics. */
function otelEndpoint(): string | undefined {
	return process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
}

/** Standard OTel header string, `k1=v1,k2=v2` (e.g. Grafana Cloud auth). */
function otelHeaders(): string | undefined {
	return process.env.OTEL_EXPORTER_OTLP_HEADERS;
}

/** `service.name` resource attribute. Defaults to "artefact". */
function otelServiceName(): string | undefined {
	return process.env.OTEL_SERVICE_NAME;
}

/**
 * Whether Better Auth is compiled in. TRUE unless `BETTER_AUTH_ENABLED` is
 * explicitly "false" at BUILD time. Like the other macros this inlines to a
 * literal, so `if (betterAuthEnabled()) { … }` lets the bundler dead-code
 * eliminate the entire auth module (better-auth + drizzle adapter) from a
 * build that opts out.
 */
function betterAuthEnabled(): boolean {
	return process.env.BETTER_AUTH_ENABLED !== "false";
}

/** Public base URL of the Better Auth endpoints, e.g. https://bbs.example.workers.dev. */
function betterAuthUrl(): string | undefined {
	return process.env.BETTER_AUTH_URL;
}

/** Better Auth signing secret (>= 32 chars). A Cloudflare secret binding in prod. */
function betterAuthSecret(): string | undefined {
	return process.env.BETTER_AUTH_SECRET;
}

export {
	env,
	isDev,
	isProd,
	databaseType,
	databaseUrl,
	isSqlite,
	isD1,
	isTurso,
	r2Enabled,
	port,
	workerUrl,
	r2Bucket,
	d1Database,
	d1DatabaseId,
	allowedOrigin,
	apiToken,
	tursoUrl,
	tursoAuthToken,
	otelEnabled,
	otelEndpoint,
	otelHeaders,
	otelServiceName,
	betterAuthEnabled,
	betterAuthUrl,
	betterAuthSecret,
};
