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
| `.env.dev`              | `sqlite`        | `bun run dev` (local dev)                 |
| `.env.example.postgres` | `postgres`      | `bun run dev:postgres` (local Postgres)   |
| `.env.neon` (gitignored) | `neon`         | `bun run dev:neon` (Neon serverless PG)   |
| `.env.example.neon`     | `neon`          | Neon template (copy to `.env.neon`)       |
| `.env.example`          | `d1`            | generic reference — defaults to the production dialect (`d1`) |

- **`bun:sqlite` is local-dev only** — it cannot run inside a Cloudflare Worker.
  The Worker always uses the D1 binding (`env.DB`) via `src/worker.ts`, so the
  SQLite path is never deployed.
- **Postgres / Neon** are serverless-Postgres paths for local development,
  testing, and production data outside the Worker. `DATABASE_TYPE=postgres` and
  `DATABASE_TYPE=neon` both use the same `postgres-js` driver + schema; `neon`
  simply points at a Neon-hosted connection string. Neither ships to the Worker
  bundle.

To point the app at a given dialect, either rely on the scripts or load a file
explicitly:

```bash
bun run dev                      # sqlite (.env.dev)
bun run dev:postgres             # postgres (.env.example.postgres)
bun run dev:neon                 # neon (.env.neon — needs a Neon project linked)
bun run --env-file=.env.example postgres… # or any file, explicitly
```

Variables:

| Variable          | Description                                   | Default                                              |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_TYPE`   | Dialect: `sqlite`, `postgres`, `neon`, or `d1`| `d1` (in `.env.example`) / `sqlite` (in `.env.dev`)  |
| `DATABASE_URL`    | Connection URL for the selected dialect       | `sqlite.db` (SQLite) / `postgres://…:5432/mydb` (PG) |
| `DATABASE_POOL_SIZE` | Postgres/Neon connection pool size (optional) | `10`                                                 |

### When is `DATABASE_TYPE` read?

`DATABASE_TYPE` / `DATABASE_URL` are **build-time** values. They are read **once, at bundle time** by the macros in `src/macros/db.ts` (which run under `bun run dev`, `bun run build`, and CI) and inlined into the emitted code as literals. They are **never** read at runtime and are **not** part of the Cloudflare Worker bundle:

- **Local dev / CI** — the macros run and bake the selected dialect into the bundle.
- **Cloudflare Worker** — the Worker uses the `env.DB` D1 binding directly (`src/worker.ts`) and has no macros; `DATABASE_TYPE` is irrelevant there.

> Because the value is baked in at build time, change `DATABASE_TYPE` in the relevant env file (`.env.dev` for `bun run dev`, `.env.example.postgres` for `bun run dev:postgres`, `.env.neon` for `bun run dev:neon`) and **restart** the dev server / re-run `bun run build` for it to take effect.

### Dialects

- `d1` (production default) — the Cloudflare Worker's D1 binding (`env.DB`). There is **no local driver** for it; locally this throws a clear error. Use `bun run worker:dev` (or deploy) for the D1 path.
- `sqlite` (local dev default) — local `bun:sqlite` driver, used via `bun run dev`.
- `postgres` — local `postgres` driver (requires the `DATABASE_URL` and a running Postgres), used via `bun run dev:postgres`.
- `neon` — serverless Postgres hosted on Neon. Uses the same `postgres-js` driver + schema as `postgres`, but reads a Neon connection string. Used via `bun run dev:neon`.

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
`.env.example.postgres`.

### Neon (serverless Postgres)

Neon is a serverless Postgres. Because `neon` maps to the same `postgres-js`
driver + schema as `postgres`, it works with the same repo and test suite.

```bash
# one-time setup — link a Neon project and pull its connection string
bunx neon link               # picks your Neon org/project/branch
bunx neon checkout main      # pin a branch
bunx neon env pull           # writes DATABASE_URL etc. into .env
cp .env.example.neon .env.neon

# then use the neon dialect
bun run dev:neon             # run the app against Neon
bun run db:migrate:neon      # apply migrations to Neon
bun run test:neon            # run the endpoint tests against Neon
```

`.env.neon` is gitignored because it holds real credentials; commit the
`.env.example.neon` template instead.

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

The app ships with a `wrangler.jsonc` and a dedicated Worker entry (`src/worker.ts`) that stores movies in **D1**. `bun run deploy` runs the build (macros) first, then deploys.

### 1. Create the D1 database

```bash
bun x wrangler d1 create movies-db
```

Copy the printed `database_id` into `wrangler.jsonc`. (This repo already has `movies-db` configured with a real `database_id`, so on a fresh clone you only need to do this if you use a different database name.)

### 2. Apply the schema to D1

Generate the SQL migration, then run it against D1:

```bash
bun run db:generate
bun x wrangler d1 execute movies-db --remote --file ./drizzle/sqlite/0000_*.sql
```

### 3. Deploy

```bash
bun run deploy       # deploy the Worker to the edge
bun run deploy:dry-run  # validate the bundle without deploying
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
| `bun run dev:postgres` | Start the Hono server against Postgres (loads `.env.example.postgres`) |
| `bun run dev:neon`     | Start the Hono server against Neon (loads `.env.neon`) |
| `bun run build`        | Bundle server + Worker with `Bun.build` (runs macros) |
| `bun test`             | Run the SQLite endpoint tests (loads `.env.dev`) |
| `bun run test:postgres` | Run the Postgres endpoint tests (loads `.env.example.postgres`, needs a running Postgres) |
| `bun run test:neon`    | Run the Postgres endpoint tests against Neon (loads `.env.neon`) |
| `bun run typecheck`    | Run `tsc --noEmit`                              |
| `bun run db:generate`  | Generate SQL migrations for SQLite **and** Postgres |
| `bun run db:generate:sqlite` | Generate SQLite migrations               |
| `bun run db:generate:postgres` | Generate Postgres migrations            |
| `bun run db:migrate`   | Apply migrations for the active `DATABASE_TYPE` (`sqlite`/`postgres`/`neon`; `d1` errors) |
| `bun run db:migrate:sqlite` | Alias forcing the SQLite migration        |
| `bun run db:migrate:postgres` | Alias forcing the Postgres migration     |
| `bun run db:migrate:neon` | Alias forcing the Neon migration (loads `.env.neon`) |
| `bun run db:push`      | Push the schema to SQLite **and** Postgres       |
| `bun run db:push:neon` | Push the schema to Neon (loads `.env.neon`)      |
| `bun run db:seed`      | Seed local SQLite and remote D1                  |
| `bun run deploy`       | Build (runs macros) then deploy to Cloudflare    |
| `bun run deploy:dry-run` | Build (runs macros) then validate the bundle  |
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
.env.example           # generic env template
.env.example.postgres  # Postgres env template (loaded by `bun run dev:postgres`)
.env.neon              # Neon config (gitignored, loaded by `bun run dev:neon`)
.env.example.neon      # Neon template (copy to `.env.neon`)
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
    schema/
      index.ts       # re-exports the SQLite movie schema for app code
      sqlite.ts      # SQLite movies table & Zod schemas
      postgres.ts    # Postgres movies table & Zod schemas
  repo/
    movies-repo.ts       # storage-agnostic MoviesRepo interface
    movies-repo-sqlite.ts# bun:sqlite implementation
    movies-repo-postgres.ts # postgres implementation
    movies-repo-d1.ts    # Cloudflare D1 implementation
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

Bun macros only run under Bun's bundler/transpiler — Wrangler bundles Workers with esbuild and does **not** execute them (it rejects `with { type: "macro" }` imports). So the Worker uses a dedicated entry (`src/worker.ts`) that reads the `env.DB` D1 binding directly with no macros, while the local Bun entry (`src/main.ts`) uses macros to pick its dialect at build time. This replaced the old `src/stubs/bun-sqlite.ts` + Wrangler `alias` workaround, and the Worker bundle no longer drags in `bun:sqlite` or `postgres`.
