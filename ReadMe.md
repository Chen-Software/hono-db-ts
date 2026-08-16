# Hono + HonoX + Drizzle ORM + Typia Starter

A [Hono](https://hono.dev) + [HonoX](https://github.com/honojs/honox) + [Drizzle ORM](https://orm.drizzle.team/) + [Typia](https://typia.io) (TypeScript-first validation and data modelling) starter: models are composed
from reusable [**capacities**](docs/capacity-introduction.md).

## Quick start

```bash
bun install

# 1. Build the app (wires the typia transform via @ttsc/unplugin/bun)
bun run build

# 2. Build the models' SQL projections, generate + apply migrations
bun run src/main.ts models:build
bun run src/main.ts db:generate          # -> drizzle/<timestamp>_sqlite_create.sql
bun run src/main.ts db:migrate           # apply to the DB (DATABASE_URL)

# 3. Seed a realistic BBS dataset (Randomisable.random())
bun run src/main.ts db:seed

# 4. Query the data (CLI or HTTP)
bun run src/main.ts query boards --count
bun run src/main.ts query users '{"role":"admin"}' --limit 5
bun run src/main.ts serve                # JSON API at http://localhost:8787/api/...

# 5. (Optional) Serve the Honox UI in /app
bun run src/main.ts ui:build             # two-phase build -> dist/index.js (+ dist/static)
bun run src/main.ts serve                # UI at / , JSON API at /api, on :8787 (or PORT=)
#   dev server with HMR instead:  bun run src/main.ts ui:dev

# NOTE: `serve` only mounts the UI when dist/index.js exists. After ui:build,
# verify both `dist/index.js` AND `dist/static/` are present — an interrupted
# build leaves only the client bundle and no UI. Re-run ui:build if missing.

# 6. (Optional) Deploy UI + API to Cloudflare Workers
bun run src/main.ts ui:cf-build          # -> dist/ui-cf/index.js + dist/static/*
NODE_ENV=production DATABASE_TYPE=d1 bun run src/main.ts wrangler-config
wrangler deploy                           # worker + static assets
```

Set `DATABASE_URL` (e.g. `file:./dev.db`) in the environment or `.env`.

> **Routes when `serve` runs with a built UI**: the Honox UI is at `/` and the
> JSON query API is at `/api/…`. Without a UI build, the JSON API is served at
> both `/` and `/api`. See **REST API services** below for the full endpoint
> list and architecture.

## Better Auth (optional)

Better Auth (email + password) is mounted at `/api/auth/*` whenever
`BETTER_AUTH_ENABLED` is not `"false"` at build time. It follows the Hono
reference example: a per-env factory (`src/auth/index.ts`), shared options
(`src/auth/options.ts`), and `better-auth.config.ts` for the CLI.

```bash
# 1. Environment — see .env.development / .env.production
#    BETTER_AUTH_URL   public base URL of the auth endpoints (defaults to the worker URL)
#    BETTER_AUTH_SECRET >= 32 chars (prod: `wrangler secret put BETTER_AUTH_SECRET`)

# 2. Schema — auth tables are emitted into drizzle/ by `db:generate`
bun run src/main.ts db:generate        # writes <ts>_sqlite_create.sql + <ts>_auth_sqlite_create.sql
bun run src/main.ts db:migrate

# 3. (After adding Better Auth plugins) regenerate src/auth/schema.ts
bun run better-auth:generate

# 4. Use the typed client from islands
#    import { authClient } from "@/auth/client";   // signIn / signUp / signOut / getSession
```

Opt out entirely with `BETTER_AUTH_ENABLED=false` at build time: the
`betterAuthEnabled()` macro inlines to `false`, so the `better-auth` +
`drizzle-adapter` bundle is dead-code-eliminated from the worker/UI builds.

## REST API services

The BBS ships a JSON/HTTP API built on a **Drizzle-ORM-backed service layer**.
The same Hono app (`buildQueryApp` in `src/http/app.ts`) is mounted by both the
local dev server (`scripts/serve.ts`) and the Cloudflare Worker, so the API is
identical everywhere. The UI routes (`app/routes`) never touch SQL themselves —
they `fetch` these endpoints over HTTP.

### Architecture

```
request ─▶ src/http/app.ts  (buildQueryApp(db, auth?))
                │  calls service functions, never sql.unsafe
                ▼
          src/services/  (createServices(db)  ─▶  { boards, threads, posts, home, search, users })
                │  all SQL via the Db interface (drizzle-orm/libsql locally, drizzle-orm/d1 on Workers)
                ▼
          src/db/client.ts  (createQueryDb)  ── derived Drizzle tables from the SqlSerialisable capacity
```

- **`src/services/`** — the data-access service layer. `createServices(db)`
  returns a bound object `{ db, boards, threads, posts, home, search, users }`;
  every function is partially-applied with `db`, so handlers call
  `svc.threads.getPage(id)` without threading `db` through. None of these
  functions use `sql.unsafe` — all dynamic values reach SQL through `?` bind
  params (see `toSql` in `src/services/types.ts`).
- **`src/http/app.ts`** — `buildQueryApp(db, authInstance?)` wires the service
  layer to the routes. Hand-written read models are registered first; the
  generated aggregate + CRUD routes are registered last so the rich read models
  win on identical method+path.
- **`src/db/client.ts`** — `createQueryDb(target)` turns a `DatabaseTarget`
  (resolved from `DATABASE_URL`) into the request-path `Db` via
  `drizzle-orm/libsql`. One libSQL `Client` backs **both** the schema bootstrap
  (`ensureSchema`/`hasSchema` over an `unsafe` adapter) and the query path, so
  the tables seeded at startup are exactly what queries see. The Cloudflare
  Worker uses `drizzle-orm/d1` from the `env.DB` binding instead.

> **Why `drizzle-orm/libsql` and not `drizzle-orm/bun-sql`?** The default
> `drizzle()` from `drizzle-orm/bun-sql` wraps a Bun `SQL` client in the
> *Postgres* driver, which has no `.all`/`.run`/`.get` raw methods the service
> layer needs. The SQLite variant in that package fails to bind the client to
> its session in this drizzle version. `libsql` is the stable, first-class
> SQLite driver.

### The `Db` interface

The service layer is driver-agnostic: it talks to any SQL executor through a
small `Db` interface (`src/services/types.ts`):

- `all(query, params)` / `run(query, params)` / `get(query, params)` — raw
  `?`-parameterised helpers (converted to parameterised Drizzle `SQL` by
  `toSql`).
- `select` / `insert` / `update` / `delete` — the Drizzle query builder.

### Endpoints

All read/mutation endpoints return pretty-printed JSON of the shape
`{ "ok": true, "data": … }` (or `{ "ok": false, "data": { "error": "…" } }` on
failure). They are grouped into three families.

**1. Read models (`/api/*`)**

| Method & path | Notes |
| --- | --- |
| `GET /api/stats` | site-wide counts |
| `GET /api/stats/top-posters?limit=` | default 10 |
| `GET /api/boards?cursor=` | cursor-paginated index |
| `GET /api/boards/:id` | 404 if missing |
| `GET /api/boards/:id/threads?limit=&cursor=&pinned=` | board's threads |
| `GET /api/boards/:id/hot?limit=` | hot threads |
| `GET /api/threads/:id` | with relations |
| `GET /api/threads/:id/replies?limit=&cursor=` | oldest-first |
| `GET /api/users/:id` | 404 if missing |
| `GET /api/users/:id/threads` \| `/posts` \| `/replies` (`?limit=`) | a user's activity |
| `GET /api/search?q=&limit=` | `q` is required |
| `GET /api/latest-posts?limit=` | |
| `GET /api/<model>/aggregate` | generated by the `Aggregable` capacity, for `posts`, `users`, `threads`, `boards`, `replies` |

**2. Composite `/api/page/*` endpoints** — the exact payloads the SSR route
handlers consume (so the UI never runs SQL):

`GET /api/page/home` ·
`GET /api/page/boards?cursor=` ·
`GET /api/page/boards/:id?cursor=` ·
`GET /api/page/boards/:id/edit` ·
`GET /api/page/threads?board=&locked=&cursor=` ·
`GET /api/page/threads/:id` (also returns `currentUserId` from the session) ·
`GET /api/page/threads/:id/edit` ·
`GET /api/page/posts?published=&cursor=` ·
`GET /api/page/posts/:id` ·
`GET /api/page/posts/:id/edit` ·
`GET /api/page/users/:id`

**3. Mutations (`POST /api/page/*`)** — form-encoded (`application/x-www-form-urlencoded`),
return `3xx` redirects so the SSR route streams them to the browser. They
require an authenticated session (redirect or `401` otherwise).

- `POST /api/page/threads` with `action=create | create-thread | update-title | toggle-pin | toggle-lock | delete`
- `POST /api/page/threads/:id/edit` (`action=save`)
- `POST /api/page/threads/:id/reply`
- `POST /api/page/threads/:id/reply/:replyId/update` (author-only)
- `POST /api/page/boards` (`action=create`), `/api/page/boards/:id` (`create-thread | save`), `/api/page/boards/:id/edit` (`action=save`)
- `POST /api/page/posts/:id/edit` (`action=save`)

#### Generated CRUD (`Servable` capacity)

Each model can also register a full CRUD surface via its `Servable` capacity:
`GET/POST /api/<model>` and `GET/PUT/DELETE /api/<model>/:id`. These are
registered **last**, so the hand-written read models above win on an identical
method+path. `Thread` adds auth guards: `onBeforeCreate` requires a session and
forces `authorId` to the caller's id; `onBeforeUpdate` strips `authorId`.

### Running the API

```bash
# JSON API only (no UI build required):
PORT=8787 bun scripts/serve.ts --port=8787 --mode=api
# or through the CLI entry:
bun run src/main.ts serve --mode=api

# With a built UI: the Honox UI is at / and the same API at /api (port 8787 /
# PORT=):
bun run src/main.ts ui:build && bun run src/main.ts serve
```

### Response shape & status codes

- `200` — `{ "ok": true, "data": … }`
- `404` — `{ "ok": false, "data": { "error": "<entity> not found" } }`
- `400` — validation / missing input (e.g. `search` without `?q=`)
- `401` — guarded create/update with no session:
  `{ "ok": false, "data": { "error": "authentication required to create a thread" } }`

## What is a "model"?

A model is `defineModel` (see `src/models/base.ts`) applied to a reflected typia
schema plus a fixed bundle of typia functions (the *schema module*), then folded
with a list of **capacities** — tiny mixins that each own one cross-cutting
concern. The starter ships `User`, `Post` and the BBS models `Board`, `Thread`,
`Reply`, all composed from the same reusable capacity set (`Identifiable`,
`Timestamped`, `SqlSerialisable`, `Referencible`, `Versionable`, `Hashable`,
`Validatable`, `Queriable`, `Siftable`, `Servable`, `Randomisable`, `Meterable`,
…).

See [`docs/data-models-storage.md`](docs/data-models-storage.md) for the data
model & storage architecture, and [`docs/cli.md`](docs/cli.md) for the CLI and
query reference.

## Project layout

```
src/
  cli/            CLI entry (main.ts via index.ts barrel) + query command (query.ts)
  models/         defineModel-based models (User, Post, Board, Thread, Reply)
  capacities/     the reusable capacity mixins (compose.ts folds them)
  storage/        identity map + store
  tags/           custom typia tags (Reference, Sha256, …)
  macros/         build-time macros (env, databaseUrl, databaseType, …)
  services/       data-access service layer (boards, threads, posts, home, search, users) bound via createServices(db) — no sql.unsafe
  http/           buildQueryApp(db, auth?) — the reusable Hono query/REST app (mounted by serve.ts + the Worker)
scripts/
  build.ts        programmatic Bun.build (typia transform plugin)
  model-build.ts  models:build  — models → src/generated/models.json
  db-generate.ts  db:generate   — models.json → CREATE TABLE SQL in drizzle/
  db-migrate.ts   db:migrate    — apply migration SQL via drizzle-orm/bun-sql
  seed.ts         db:seed       — BBS dataset via Randomisable.random()
  serve.ts        serve         — local server: Honox UI at / + JSON API at /api
  ui-build.ts     ui:build      — build the Honox UI -> dist/index.js (+ static)
  ui-cf-build.ts  ui:cf-build   — build the UI into a CF Worker -> dist/ui-cf/index.js
app/              Honox UI (routes/, islands/, client.ts, style.css — Panda CSS)
  server.ts       local UI server entry (bun:sql, mounts /api)
  server.cf.ts    CF Worker UI entry (D1, mounts /api)
panda.config.ts   Panda CSS config (tokens + utilities -> design-system/)
vite.ui.config.ts     Vite config for the local UI build (@hono/vite-build/bun)
vite.ui.cf.config.ts  Vite config for the CF Worker UI build (@hono/vite-build/cloudflare-workers)
wrangler.config.ts    generates wrangler.jsonc (main + assets + D1 binding)
docs/             data-models-storage + CLI reference
```
