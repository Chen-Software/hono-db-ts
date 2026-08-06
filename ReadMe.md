# Hono + Drizzle ORM Starter

A starter project for a REST API built with **Hono** and **Drizzle ORM**, run on **Bun** locally and deployable to **Cloudflare Workers**.

## Stack

- [Bun](https://bun.sh) — runtime & test runner
- [Hono](https://hono.dev) — web framework
- [Drizzle ORM](https://orm.drizzle.team) — database access layer
- [Biome](https://biomejs.dev) — lint & format
- [Cloudflare Workers](https://workers.cloudflare.com) — edge deployment
- [D1](https://developers.cloudflare.com/d1/) — serverless SQLite database (Workers)

## Local development (Bun + SQLite)

```bash
bun install          # install dependencies
bun run dev          # start the Hono server in watch mode (SQLite, loads .env.dev)
bun run db:generate  # (re)generate SQL migrations from the schema
bun run db:migrate   # apply migrations to the SQLite database
```

By default **local dev** uses SQLite (`sqlite.db`), and the generic `.env.example`
defaults to the production `d1` dialect.

## Environment configuration

The project ships **per-dialect** env files. Bun's `--env-file` flag loads the
file you want; the relevant scripts already point at them:

| File                    | `DATABASE_TYPE` | Used by                                   |
| ----------------------- | --------------- | ----------------------------------------- |
| `.env.dev`              | `sqlite`        | `bun run dev` (sqlite local dev)          |
| `.env.dev.d1`           | `sqlite`        | `bun run dev` (local D1 → sqlite driver)  |
| `.env.dev.turso`        | `turso` (file://) | `bun run dev` (local TursoDB)           |
| `.env.dev.neon`         | `neon`          | `bun run dev` (local Neon)                |
| `.env.dev.postgres` | `postgres`      | `bun run dev:postgres` (local Postgres)   |
| `.env.neon` (gitignored) | `neon`         | `bun run dev:neon` (Neon serverless PG)   |
| `.env.example.neon`     | `neon`          | Neon template (copy to `.env.dev.neon`)   |
| `.env.turso` (gitignored) | `turso` (libsql://) | `bun run dev:turso` (Turso Cloud)       |
| `.env.example.turso-cloud` | `turso` (libsql://) | Turso Cloud template (copy to `.env.turso`) |
| `.env.example`          | `d1`            | generic reference — D1 is the deployable default |

> **`bun run dev` is dialect-aware and runs a local dev server.** It reads
> `DATABASE_TYPE` from `.env` (defaults to `d1` when missing):
>   - `d1` → local **`sqlite`** driver (closest to D1), `.env.dev.d1`
>   - `sqlite` → Bun server, `.env.dev`
>   - `postgres` → Bun server, `.env.dev.postgres`
>   - `neon` → local **Postgres** (Neon Local, via `docker compose up -d`),
>     Bun server, `.env.dev.neon`
>   - `turso` → local `file://` libSQL SDK, `.env.dev.turso` (never Turso Cloud)
> The env file is picked by priority: `.env.dev` (if it matches the dialect) →
> `.env.dev.<type>` → `.env.dev`.

**LOCAL-ONLY dialects (never available on Cloudflare Workers):**
- **`sqlite`** — `bun:sqlite` cannot run inside a Worker (no such driver there).
- **`postgres`** — `postgres-js` uses Node.js TCP, which Workers don't support.

Both only affect the **local Bun server** (`bun run dev*`). The Worker never
imports them.

**DEPLOYABLE dialects (what the Worker actually uses):**
- **`d1`** — the Worker's `env.DB` D1 binding. `bun run deploy` targets the
  top-level `wrangler.jsonc` environment, which has **no Hyperdrive**.
- **`neon`** — serverless Postgres on the Worker via a **Hyperdrive** binding.
  `bun run deploy:neon` targets the `neon` wrangler environment (`--env=neon`),
  which **does include Hyperdrive**.

The Worker selects its database at runtime from the bindings present (see
`src/worker.ts`): if a `HYPERDRIVE` binding exists → Neon; otherwise → D1. So
`DATABASE_TYPE` / `DATABASE_URL` in `.env` are irrelevant to the deployed
Worker — they only configure the local Bun server.

To point the app at a given dialect, either rely on the scripts or load a file
explicitly:

```bash
bun run dev                      # picks env file from .env's DATABASE_TYPE
bun run dev:postgres             # postgres (.env.dev.postgres)
bun run dev:neon                 # neon (.env.dev.neon — needs a Neon project linked)
bun run dev:tursodb              # local TursoDB (file:///…/tursodb.db, .env.dev.turso)
bun run dev:turso                # Turso Cloud (.env.turso — needs a Turso DB + token)
bun run --env-file=.env.example postgres… # or any file, explicitly
```

Variables:

| Variable          | Description                                   | Default                                              |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_TYPE`   | Dialect: `sqlite`, `postgres`, `neon`, `turso`, or `d1` | `d1` (in `.env.example`) / `sqlite` (in `.env.dev`) |
| `DATABASE_URL`    | Connection URL for the selected dialect       | `sqlite.db` (SQLite) / `postgres://…:5432/mydb` (PG) |
| `TURSO_URL`       | Turso connection URL (`file:///` local, `libsql://` cloud) | `file:///…/tursodb.db` (local)             |
| `TURSO_AUTH_TOKEN`| Turso Cloud auth token (cloud only)           | —                                                  |
| `DATABASE_POOL_SIZE` | Postgres/Neon connection pool size (optional) | `10`                                                 |

### When is `DATABASE_TYPE` read?

`DATABASE_TYPE` / `DATABASE_URL` are **build-time** values. They are read **once, at bundle time** by the macros in `src/macros/db.ts` (which run under `bun run dev`, `bun run build`, and CI) and inlined into the emitted code as literals. They are **never** read at runtime and are **not** part of the Cloudflare Worker bundle:

- **Local dev / CI** — the macros run and bake the selected dialect into the bundle.
- **Cloudflare Worker** — the Worker reads its database binding at runtime (`env.HYPERDRIVE` → Neon, else `env.DB` → D1) and has no macros; `DATABASE_TYPE` / `DATABASE_URL` are irrelevant there.

> Because the value is baked in at build time, change `DATABASE_TYPE` in the relevant env file (`.env.dev` for `bun run dev`, `.env.dev.postgres` for `bun run dev:postgres`, `.env.dev.neon` for `bun run dev:neon`, `.env.dev.turso` for `bun run dev:tursodb`, `.env.turso` for `bun run dev:turso`) and **restart** the dev server / re-run `bun run build` for it to take effect.

### Dialects

- `d1` (production default) — the Cloudflare Worker's D1 binding (`env.DB`). There is **no local driver** for it; locally this throws a clear error. Use `bun run worker:dev` (or deploy) for the D1 path.
- `sqlite` (local dev default) — local `bun:sqlite` driver, used via `bun run dev`.
- `postgres` — local `postgres` driver (requires the `DATABASE_URL` and a running Postgres), used via `bun run dev:postgres`.
- `neon` — serverless Postgres hosted on Neon. Uses the same `postgres-js` driver + schema as `postgres`, but reads a Neon connection string. Used via `bun run dev:neon`.
- `turso` — Turso (edge SQLite, SQLite-compatible). `TURSO_URL` decides local vs cloud: `file:///` (local TursoDB, `bun run dev:tursodb`) or `libsql://` + `TURSO_AUTH_TOKEN` (Turso Cloud, `bun run dev:turso`). `tursodb` / `turso-cloud` are accepted aliases.

Detailed per-type guides (env vars, cloud setup, architecture):

- [Turso (`turso`)](docs/db-type-turso.md)
- [Neon (`neon`)](docs/db-type-neon.md)

For Postgres dialect testing:

```bash
docker compose up -d # start local Postgres on :5432
bun run db:migrate:postgres # apply the Postgres migrations
bun run test:postgres      # run the Postgres endpoint tests
# then set DATABASE_TYPE=postgres and DATABASE_URL in .env to run the app against Postgres
```

The Postgres endpoint tests (`src/routes/movies-postgres.test.ts`) exercise the same
`/movies` API surface against a live Postgres. They are **opt-in** — the default
`bun test` only runs the SQLite tests (loading `.env.dev`) — and require a running
Postgres plus applied migrations. `bun run test:postgres` loads
`.env.dev.postgres`.

### Neon (serverless Postgres)

Neon is a serverless Postgres. Because `neon` maps to the same `postgres-js`
driver + schema as `postgres`, it works with the same repo and test suite.

```bash
# one-time setup — link a Neon project and pull its connection string
bunx neon link               # picks your Neon org/project/branch
bunx neon checkout main      # pin a branch
bunx neon env pull           # writes DATABASE_URL etc. into .env
cp .env.example.neon .env.neon
# fill in HYPERDRIVE_ID (from `bun x wrangler hyperdrive list`) for deploys

# then use the neon dialect
bun run dev:neon             # run the app against Neon
bun run db:migrate:neon      # apply migrations to Neon
bun run test:neon            # run the endpoint tests against Neon
bun run deploy:neon          # deploy the Worker to use Neon via Hyperdrive
```

`.env.neon` is gitignored because it holds real credentials (incl. the
`HYPERDRIVE_ID`); commit the `.env.example.neon` template instead.

### Turso (edge SQLite)

Turso is a SQLite-compatible edge database, so it reuses the SQLite schema and
repo (with an **async** libSQL client). A single `DATABASE_TYPE=turso` covers both
modes; `TURSO_URL` decides local vs cloud.

- **Local TursoDB** (`.env.dev.turso`, `TURSO_URL=file:///…`, no account):
  ```bash
  bun run dev:tursodb         # run against file:///…/tursodb.db
  bun run db:migrate:tursodb  # apply SQLite migrations to the local file
  bun run test:tursodb        # endpoint tests against local TursoDB
  ```
- **Turso Cloud** (`.env.example.turso-cloud`, `TURSO_URL=libsql://…` + token):
  ```bash
  # one-time setup
  turso auth login
  turso db create movies-db
  turso db show movies-db --url            # → TURSO_URL
  turso db tokens create movies-db         # → TURSO_AUTH_TOKEN
  cp .env.example.turso-cloud .env.turso   # fill in the values

  bun run dev:turso                        # run against Turso Cloud
  bun run db:migrate:turso                 # apply SQLite migrations
  bun run test:turso                       # endpoint tests against Turso Cloud
  ```
- **Deploy the Turso worker** — the Worker uses `@libsql/client/http` (not
  WebSocket), which reads `env.TURSO_URL` (var) and `env.TURSO_AUTH_TOKEN`
  (secret):
  ```bash
  bun run deploy:turso                     # build + wrangler deploy --env=turso
  # one-time: store the token as a Worker secret (not a plain var)
  echo "$TURSO_AUTH_TOKEN" | bun x wrangler secret put TURSO_AUTH_TOKEN --env=turso
  ```
  The generated `wrangler.jsonc` keeps only `TURSO_URL` in `vars`; the token is
  a secret. Deploys as `movies-worker-turso` at
  `https://movies-worker-turso.<account>.workers.dev`.

`.env.turso` is gitignored (real token); commit `.env.example.turso-cloud`
instead. `turso` is a SQLite-compatible **local/remote dev** path — it does not
ship to the Cloudflare Worker (which uses D1 or Neon via Hyperdrive).
(`tursodb` / `turso-cloud` are accepted aliases for `DATABASE_TYPE=turso`.)

## Build process

`bun run build` runs `scripts/build.ts`, which uses [`Bun.build`](https://bun.com/docs/bundler) to bundle the app **and execute the macros** (`import ... with { type: "macro" }`) at build time. Output goes to `dist/`:

| Output | Source                     | Target   | Notes                                   |
| ------ | -------------------------- | -------- | --------------------------------------- |
| `dist/server.js` | `src/main.ts`       | `bun`    | Local server bundle; macros are inlined |
| `dist/worker.js` | `src/worker.ts`     | `browser`| Cloudflare Worker bundle (no macros)    |

Both are emitted with `minify` and an external sourcemap. A failing job aborts the build with a non-zero exit code.

```bash
DATABASE_TYPE=sqlite  bun run build   # bake in the sqlite dialect
DATABASE_TYPE=postgres bun run build  # bake in the postgres dialect
```

> The macros read `process.env` at build time, so the `DATABASE_TYPE`/`DATABASE_URL` present in the environment when you run `build`/`dev`/CI are the ones baked in.

## Deploy to Cloudflare Workers

The app ships with a `wrangler.jsonc` and a dedicated Worker entry (`src/worker.ts`) that picks its storage from the bindings available at runtime:

- if a **`HYPERDRIVE`** binding is present → **Neon** (serverless Postgres) via Hyperdrive, using `postgres-js` + `nodejs_compat`.
- otherwise → **D1** (`env.DB`).

`wrangler.jsonc` uses Wrangler **named environments** to toggle Hyperdrive:

- **top-level (default, `bun run deploy`)** — D1 only, **no Hyperdrive** → deploys `movies-worker` using D1.
- **`neon` environment (`bun run deploy:neon`)** — adds a **Hyperdrive** binding → deploys `movies-worker-neon` using Neon.
- **`turso` environment (`bun run deploy:turso`)** — `TURSO_URL` var + `TURSO_AUTH_TOKEN` secret → deploys `movies-worker-turso` using Turso Cloud (via `@libsql/client/http`).

This keeps `DATABASE_TYPE=d1` (`wrangler.jsonc` top-level) free of Hyperdrive, while
`DATABASE_TYPE=neon` (`--env=neon`) carries it — automatically matching the dialect.

### 1. Create the D1 database (fallback)

```bash
bun x wrangler d1 create movies-db
```

Copy the printed `database_id` into `wrangler.jsonc`, replacing
`REPLACE_WITH_YOUR_D1_DATABASE_ID`. Alternatively, use `${D1_DATABASE_ID}` and
set that env var / `.dev.vars` entry for CI-friendly interpolation. A value of
`REPLACE_WITH_YOUR_D1_DATABASE_ID` will fail a real deploy (dry-run is fine).

### 2. (Optional) Wire Neon via Hyperdrive

To make the Worker use Neon instead of D1:

```bash
# 1. Create a Hyperdrive config pointing at your Neon (unpooled) connection string
bun x wrangler hyperdrive create neon-hyperdrive \
  --connection-string="postgresql://user:pass@host.region.aws.neon.tech/db"

# 2. Set HYPERDRIVE_ID in your .env / .env.neon (e.g.
#    HYPERDRIVE_ID=<the id from `wrangler hyperdrive list`>). The build
#    (wrangler.config.ts) generates wrangler.jsonc from it under
#    env.neon.hyperdrive[].id. The top-level D1 env stays free of Hyperdrive.
```

> Neon's guidance: use Hyperdrive with a standard TCP Postgres driver (`postgres-js`),
> **not** the Neon Serverless (WebSocket) driver. Hyperdrive provides its own pool,
> so `max: 1` is used. Requires the `nodejs_compat` compatibility flag.

### 4. Apply the schema

For D1, generate and run the SQLite migration:

```bash
bun run db:generate
bun x wrangler d1 execute movies-db --remote --file ./drizzle/sqlite/0000_*.sql
```

For Neon, apply the Postgres migrations to the Neon database:

```bash
bun run db:migrate:neon   # requires .env.neon (the Neon connection string)
```

### 5. Deploy

```bash
bun run deploy            # deploy D1 worker `movies-worker` (no Hyperdrive)
bun run deploy:neon       # deploy Neon worker `movies-worker-neon` (with Hyperdrive)
bun run deploy:turso      # deploy Turso worker `movies-worker-turso` (TURSO_URL var + token secret)
bun run deploy:dry-run        # validate the D1 bundle without deploying
bun run deploy:dry-run:neon   # validate the Neon bundle without deploying
bun run deploy:dry-run:turso  # validate the Turso bundle without deploying
```

### Local Workers development

```bash
bun run worker:dev   # run the Worker locally (uses a local D1 simulation)
bun run worker:types # regenerate worker-configuration.d.ts
```

### Worker types

[For generating/synchronising types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
bun run worker:types
```

Pass the `CloudflareBindings` as generics when instantiating `Hono` in the Worker entry:

```ts
// src/worker.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## Scripts

| Script                 | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `bun run dev`          | Start the Hono server in watch mode (SQLite, loads `.env.dev`) |
| `bun run dev:postgres` | Start the Hono server against Postgres (loads `.env.dev.postgres`) |
| `bun run dev:neon`     | Start the Hono server against Neon (loads `.env.neon`) |
| `bun run dev:tursodb`  | Start the Hono server against local TursoDB (loads `.env.dev.turso`) |
| `bun run dev:turso`    | Start the Hono server against Turso Cloud (loads `.env.turso`) |
| `bun run build`        | Bundle server + Worker with `Bun.build` (runs macros) |
| `bun test`             | Run the SQLite endpoint tests (loads `.env.dev`) |
| `bun run test:postgres` | Run the Postgres endpoint tests (loads `.env.dev.postgres`, needs a running Postgres) |
| `bun run test:neon`    | Run the Postgres endpoint tests against Neon (loads `.env.neon`) |
| `bun run test:tursodb` | Run the endpoint tests against local TursoDB (loads `.env.dev.turso`) |
| `bun run test:turso`   | Run the endpoint tests against Turso Cloud (loads `.env.turso`) |
| `bun run typecheck`    | Run `tsc --noEmit`                              |
| `bun run db:generate`  | Generate SQL migrations for SQLite **and** Postgres |
| `bun run db:generate:sqlite` | Generate SQLite migrations               |
| `bun run db:generate:postgres` | Generate Postgres migrations            |
| `bun run db:migrate`   | Apply migrations for the active `DATABASE_TYPE` (`sqlite`/`postgres`/`neon`; `d1` errors) |
| `bun run db:migrate:sqlite` | Alias forcing the SQLite migration        |
| `bun run db:migrate:postgres` | Alias forcing the Postgres migration     |
| `bun run db:migrate:neon` | Alias forcing the Neon migration (loads `.env.neon`) |
| `bun run db:migrate:tursodb` | Alias forcing the local TursoDB migration (loads `.env.dev.turso`) |
| `bun run db:migrate:turso` | Alias forcing the Turso Cloud migration (loads `.env.turso`) |
| `bun run db:push`      | Push the schema to SQLite **and** Postgres       |
| `bun run db:push:neon` | Push the schema to Neon (loads `.env.neon`)      |
| `bun run db:seed`      | Seed local SQLite and remote D1                  |
| `bun run deploy`       | Build (runs macros) then deploy D1 worker (no Hyperdrive) |
| `bun run deploy:neon`  | Deploy the Neon worker via `--env=neon` (with Hyperdrive) |
| `bun run deploy:turso` | Deploy the Turso worker via `--env=turso` (TURSO_URL var + token secret) |
| `bun run deploy:dry-run` | Build then validate the D1 bundle without deploying |
| `bun run deploy:dry-run:neon` | Validate the Neon bundle without deploying   |
| `bun run deploy:dry-run:turso` | Validate the Turso bundle without deploying   |
| `bun run worker:dev`   | Run the Worker locally with wrangler             |
| `bun run worker:types` | Regenerate Worker binding types                  |
| `bun run check`        | Lint & format check (Biome)                      |
| `bun run start`        | Run the server without watch mode                |

## API

### Movies

| Method   | Path           | Description      | Request body                        | Success    |
| -------- | -------------- | ---------------- | ----------------------------------- | ---------- |
| `GET`    | `/movies`      | List all movies  | —                                   | `200`      |
| `GET`    | `/movies/:id`  | Get one movie    | —                                   | `200`      |
| `POST`   | `/movies`      | Create a movie   | `{ "title": string, "releaseYear"?: number }` | `201` |
| `PUT`    | `/movies/:id`  | Update a movie   | `{ "title"?: string, "releaseYear"?: number \| null }` | `200` |
| `DELETE` | `/movies/:id`  | Delete a movie   | —                                   | `200`      |

Errors return `{ "error": string }` with an appropriate status code (`400` invalid input, `404` not found).

#### Examples

```bash
# List
curl http://localhost:3000/movies

# Create
curl -X POST http://localhost:3000/movies \
  -H 'Content-Type: application/json' \
  -d '{"title": "Inception", "releaseYear": 2010}'

# Get one
curl http://localhost:3000/movies/1

# Update
curl -X PUT http://localhost:3000/movies/1 \
  -H 'Content-Type: application/json' \
  -d '{"title": "Interstellar"}'

# Delete
curl -X DELETE http://localhost:3000/movies/1
```

### Schema

A movie has:

| Column        | Type   |
| ------------- | ------ |
| `id`          | `int`  |
| `title`       | `text` |
| `releaseYear` | `int`  |

## Project layout

```
.env.dev               # SQLite local dev config (loaded by `bun run dev`)
.env.dev.d1            # local D1 dev config → sqlite driver (loaded by `bun run dev`)
.env.dev.turso         # local TursoDB dev config (loaded by `bun run dev`)
.env.dev.neon          # local Neon dev config (loaded by `bun run dev`)
.env.example           # generic env template
.env.dev.postgres  # Postgres local dev config (loaded by `bun run dev:postgres`)
.env.neon              # Neon config (gitignored, loaded by `bun run dev:neon`)
.env.example.neon      # Neon template (copy to `.env.dev.neon`)
.env.turso             # Turso Cloud config (gitignored, loaded by `bun run dev:turso`)
.env.example.turso-cloud # Turso Cloud template (copy to `.env.turso`)
compose.yml            # local Postgres server for dialect testing
src/
  app.ts             # pure createApp(repo) Hono factory (no DB, no macros)
  main.ts            # local Bun entry (bun run dev/start) — uses macros + sqlite
  worker.ts          # Cloudflare Worker entry (D1 only, no macros)
  macros/
    db.ts            # build-time DATABASE_TYPE / DATABASE_URL macros
    platform.ts      # build-time Bun/Worker detection macros
  db/
    index.ts         # dialect factory (build-time via macros) + Drizzle clients
    sqlite-client.ts # bun:sqlite Drizzle client (local)
    postgres-client.ts # postgres Drizzle client (local)
    neon-client.ts   # Worker client: postgres-js via Hyperdrive (nodejs_compat)
    turso-client.ts  # Turso (libSQL) client — local file or cloud (async)
    schema/
      index.ts       # re-exports the SQLite movie schema for app code
      sqlite.ts      # SQLite movies table & Zod schemas
      postgres.ts    # Postgres movies table & Zod schemas
  repo/
    movies-repo.ts       # storage-agnostic MoviesRepo interface
    movies-repo-sqlite.ts# bun:sqlite implementation
    movies-repo-postgres.ts # postgres/Neon implementation (used locally + Worker)
    movies-repo-turso.ts # Turso (libSQL, async) implementation
    movies-repo-d1.ts    # Cloudflare D1 implementation
    factory.ts       # pick the repo for the active DATABASE_TYPE
  routes/
    movies.ts        # /movies REST handlers
    movies.test.ts   # SQLite /movies endpoint tests
    movies-postgres.test.ts # Postgres /movies endpoint tests (opt-in)
scripts/
  build.ts               # Bun.build: bundle server + Worker (runs macros)
  db-migrate.ts          # apply migrations for the active DATABASE_TYPE (sqlite/postgres/neon/d1)
  db-seed.ts             # seed data
wrangler.jsonc       # Cloudflare Workers configuration (main: src/worker.ts)
worker-configuration.d.ts # generated Worker binding types
```

### Why the Worker entry is separate

Bun macros only run under Bun's bundler/transpiler — Wrangler bundles Workers with esbuild and does **not** execute them (it rejects `with { type: "macro" }` imports). So the Worker uses a dedicated entry (`src/worker.ts`) that picks its database binding at runtime — `env.HYPERDRIVE` → Neon, else `env.DB` → D1 — with no macros, while the local Bun entry (`src/main.ts`) uses macros to pick its dialect at build time. This replaced the old `src/stubs/bun-sqlite.ts` + Wrangler `alias` workaround. The Worker only drags in `postgres` when the Hyperdrive path is bundled (which is why Wrangler handles that bundle with `nodejs_compat`).
