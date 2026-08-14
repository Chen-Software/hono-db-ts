# CLI Reference

The CLI lives in `src/cli/` and is invoked through the entry point
`src/main.ts`:

```
src/
  main.ts          entry — calls run() from cli (via src/cli/index.ts)
  cli/
    index.ts       barrel: export * from "./main"
    main.ts        command dispatch (run)
    query.ts       the `query` command (runQuery), reusable outside the CLI
```

```bash
bun run src/main.ts <command> [args]
```

All DB commands read `DATABASE_URL` (e.g. `file:./dev.db`) via the
`databaseUrl()` build-time macro (`@/macros/envs`).

## Environment files

Bun auto-loads env files by mode, layered over the base `.env`:

| File                       | Purpose                                   | Committed? |
| -------------------------- | ----------------------------------------- | ---------- |
| `.env`                     | base defaults                             | no         |
| `.env.development`         | shared development defaults               | yes        |
| `.env.development.local`   | machine-specific dev overrides            | no         |
| `.env.production`          | production defaults                       | yes        |
| `.env.production.local`    | secret / machine-specific prod overrides  | no         |

Set `NODE_ENV=development|production` to select the layer (Bun loads
`.env.<NODE_ENV>` and `.env.<NODE_ENV>.local` automatically).

- **Development** defaults to in-memory sqlite
  (`DATABASE_TYPE=sqlite`, `DATABASE_URL=sqlite:///:memory:`); override in
  `.env.development.local` to use a persistent `file:./dev.db`.
- **Production** is configured as in-memory sqlite
  (`DATABASE_TYPE=sqlite`, `DATABASE_URL=:memory:`). The Cloudflare Worker
  (`src/worker.ts`) creates a fresh schema from the bundled migration SQL on
  each isolate; there is no cross-request persistence by design.

These values feed the BUILD-TIME macros, so they control what is compiled into
the deployed artifact (e.g. which SQL backend is inlined). For a durable edge
database, switch `DATABASE_TYPE=d1` and use the `env.DB` D1 binding — the app
and routes are unchanged.

---

## Commands

### `build`

Bundle the app via `scripts/build.ts` — a programmatic `Bun.build` that wires
the `@ttsc/unplugin/bun` plugin so the typia transform runs during bundling.

### `models:build`

Build every model's SQL projection → `src/generated/models.json`. Imports all
models (running the typia transform), enumerates the registry, and derives
serialisable `SqlModelPlan`s (sqlite + pg) via the `SqlSerialisable` capacity /
`deriveSqlPlan`. This is the artifact `db:generate` consumes.

### `db:generate [dialect]`

Depends on `models:build`. Generates `CREATE TABLE` migration SQL
(`sqlite` | `pg`, default `sqlite`) from `models.json` into
`drizzle/<timestamp>_<dialect>_create.sql`. Column kinds, `PRIMARY KEY`/
`NOT NULL`, FK constraints (from `Reference` tags) and CHECK constraints
(from reflected bounds) are all derived from the models — SQLite `REGEXP`
pattern checks are skipped (no portable regexp).

### `db:migrate`

Depends on `models:build`. Applies the migration SQL files in `drizzle/` (in
timestamp order) to the DB via `drizzle-orm/bun-sql` + `databaseUrl()` (the
`new SQL(url)` → `drizzle({ client })` client pattern).

### `db:seed [counts…]`

Seed the DB with a BBS dataset using `Randomisable.random()` (format-bound
fields are stamped: uuid ids, emails, slug patterns, SHA-256 content hashes,
FK wiring). Defaults (positional-overridable):

```
50 users · 100 boards · 1000 posts · 1000 threads · 2000 replies
```

Idempotent via `INSERT OR REPLACE` by primary key.

### `query <table> [jsonFilter] [flags]`

Query a model table via `drizzle-orm/bun-sql` + `databaseUrl()`. The
implementation (`src/cli/query.ts`, `runQuery`) is standalone and importable.

`<table>` is a model/table name resolved through the registry:
`users`, `boards`, `threads`, `replies`, `posts` (or a schemaName like
`UserSchema`).

#### Filter DSL

A JSON object of per-column matchers, ANDed together:

| Form | Example | SQL |
|---|---|---|
| equality | `{"role":"admin"}` | `role = 'admin'` |
| not-equal | `{"role":{"ne":"admin"}}` | `role != 'admin'` |
| greater | `{"age":{">":30}}` | `age > 30` |
| greater-or-equal | `{"age":{">=":20}}` | `age >= 20` |
| less | `{"age":{"<":30}}` | `age < 30` |
| less-or-equal | `{"age":{"<=":20}}` | `age <= 20` |
| contains (LIKE) | `{"title":{"contains":"hello"}}` | `title LIKE '%hello%'` |
| startsWith | `{"name":{"startsWith":"a"}}` | `name LIKE 'a%'` |

Multiple operators on one column AND too:
`{"age":{">=":20,"<":30}}`. Booleans are coerced to their storage form
(SQLite stores them as `0`/`1`, so `{"pinned":"true"}` matches `pinned = 1`).

#### Flags

| Flag | Effect |
|---|---|
| `--limit N` | cap the result set (default 50) |
| `--sort field[:asc\|desc]` | order by a column (default `updated_at` desc, falling back to `created_at`) |
| `--count` | return only the matching row count |

#### Examples

```bash
# count boards
bun run src/main.ts query boards --count

# equality
bun run src/main.ts query users '{"role":"admin"}' --limit 5

# comparison range (AND)
bun run src/main.ts query users '{"age":{">=":20,"<":30}}' --count

# LIKE search + sort + limit
bun run src/main.ts query threads '{"title":{"contains":"a"}}' --sort updated_at:desc --limit 20

# boolean coercion + FK equality
bun run src/main.ts query threads '{"boardId":"<id>","pinned":"true"}'

# newest published posts
bun run src/main.ts query posts '{"published":"true"}' --sort updated_at:desc --limit 3
```

### `serve [port]`

Run the local server (`scripts/serve.ts`, default `:8787`). The server is a
**Hono app** (`import { Hono } from "hono"`); its handler is fed to
`Bun.serve({ fetch: app.fetch })`, so the same `app` can be reused in-process
(the shape `LocalTransport` in `src/services/transport.ts` consumes).

#### Routes

- **JSON query API — always under `/api`**: `GET /api/stats`, `/api/boards`,
  `/api/boards/:id`, `/api/boards/:id/threads`, `/api/boards/:id/hot`,
  `/api/threads/:id`, `/api/threads/:id/replies`, `/api/users/:id`,
  `/api/users/:id/threads`, `/api/users/:id/posts`, `/api/users/:id/replies`,
  `/api/search?q=`, `/api/latest-posts`.
  Two kinds of API routes coexist:
  1. **Hand-written "good queries"** — the multi-model read models that need
     joins/aggregation, registered in `src/http/app.ts` (`buildQueryApp`).
  2. **Generated per-model routes** — the `Servable` capacity (see
     `docs/data-models-storage.md` §6) turns any `SqlSerialisable` model into
     `GET /api/<table>` + `GET /api/<table>/:id` automatically via
     `Model.serve(app, client)`.
- **Honox UI — at `/` (when built)**: after `bun run src/main.ts ui:build`,
  the built `dist/index.js` is mounted at the root, so `/` renders the
  UI (SSR + islands + `/static/*` assets).

If `dist/index.js` does not exist (UI not built), the JSON API is ALSO
mounted at `/` for back-compatibility — so `/boards` works, but `/api/boards`
is the canonical route.

Every endpoint reads the SAME database the CLI `query` command and the
`db:generate`/`db:migrate`/`db:seed` pipeline use, through the derived drizzle
tables (`drizzle-orm/bun-sql` + `databaseUrl()` macro + `new SQL(url)`, exactly
like the app). Responses are `{ ok: true, data }` / `{ ok: false, data: { error } }`.

### `ui:build`

Build the Honox UI (in `/app`) into `dist/index.js` via the dedicated
Vite config (`vite.ui.config.ts`): a two-phase build — client bundle
(`dist/static/*` + `dist/.vite/manifest.json`) then SSR app (`dist/index.js`),
wiring honox routes/islands + the `ttsc` typia transform + Panda CSS
(`panda.config.ts` → `styled-system/`), emitted with `@hono/vite-build/bun`.
Run this **before** `serve` to get the UI at `/`.

### `ui:cf-build`

Build the Honox UI into a **Cloudflare Worker entry** via
`vite.ui.cf.config.ts`: same two-phase pipeline (client assets → `dist/static/*`
+ `dist/.vite/manifest.json`, then SSR) but the entry is `app/server.cf.ts`
(D1-backed, mounts the JSON query app under `/api`) and the adapter is
`@hono/vite-build/cloudflare-workers`, producing `dist/ui-cf/index.js`.

Deployment pairing:

```bash
bun run src/main.ts ui:cf-build       # -> dist/ui-cf/index.js + dist/static/*
NODE_ENV=production DATABASE_TYPE=d1 bun run src/main.ts wrangler-config
wrangler deploy                        # worker + static assets
```

`wrangler.jsonc` points `main` at `dist/ui-cf/index.js` and serves the built
client assets via Workers Static Assets (`assets.directory: dist/static`,
`binding: ASSETS`), so `/static/*` is served by the platform while `/` (SSR
HTML) and `/api/*` are handled by the worker.

### `ui:dev`

Run the Honox UI dev server (Vite, HMR) on `:8787` with `vite.ui.config.ts`.
This is for iterating on the UI in `/app`; it does not mount the JSON API.

---

## Typical workflow

```bash
export DATABASE_URL="file:./dev.db"

bun run src/main.ts db:generate && bun run src/main.ts db:migrate   # schema
bun run src/main.ts db:seed                                          # data
bun run src/main.ts query boards --count                             # verify

# JSON API only
bun run src/main.ts serve &            # API at /api/... and /... on :8787

# JSON API + Honox UI
bun run src/main.ts ui:build
bun run src/main.ts serve &            # UI at /, API at /api on :8787

# Deploy UI + API to Cloudflare Workers
bun run src/main.ts ui:cf-build
NODE_ENV=production DATABASE_TYPE=d1 bun run src/main.ts wrangler-config
wrangler deploy
```
