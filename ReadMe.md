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
cp .env.example .env # configure DATABASE_TYPE / DATABASE_URL
bun run db:generate  # (re)generate SQL migrations from the schema
bun run db:migrate   # apply migrations to the SQLite database
bun run dev          # start the Hono server in watch mode
```

By default the app uses SQLite (`sqlite.db`).

## Environment configuration

The app reads its database dialect from the environment **at build time** via Bun macros (`src/macros/db.ts`). Copy `.env.example` to `.env` and set:

| Variable          | Description                                   | Default                                              |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_TYPE`   | Dialect: `sqlite`, `postgres`, or `d1`        | `sqlite`                                             |
| `DATABASE_URL`    | Connection URL for the selected dialect       | `sqlite.db` (SQLite) / `postgres://…:5432/mydb` (PG) |
| `DATABASE_POOL_SIZE` | Postgres connection pool size (optional)    | `10`                                                 |

> `DATABASE_TYPE` is baked in at bundle time by the macros, which only run locally or in CI — they never execute on the Cloudflare Worker. `d1` refers to the Worker's D1 binding (`env.DB`), which has no local driver; use `bun run worker:dev` for that path.

For Postgres dialect testing:

```bash
docker compose up -d # start local Postgres on :5432
# then set DATABASE_TYPE=postgres and DATABASE_URL in .env
```

## Deploy to Cloudflare Workers

The app ships with a `wrangler.jsonc` and a Workers entry point (`src/main.ts`) that stores movies in **D1**.

### 1. Create the D1 database

```bash
bun x wrangler d1 create movies-db
```

Copy the printed `database_id` into `wrangler.jsonc` (replace the `REPLACE_WITH_YOUR_D1_DATABASE_ID` placeholder).

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

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/main.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## Scripts

| Script                 | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `bun run dev`          | Start the Hono server in watch mode (Bun)       |
| `bun run build`        | Bundle server + Worker with `Bun.build` (runs macros) |
| `bun test`             | Run the test suite                              |
| `bun run typecheck`    | Run `tsc --noEmit`                              |
| `bun run db:generate`  | Generate SQL migrations for SQLite **and** Postgres |
| `bun run db:generate:sqlite` | Generate SQLite migrations               |
| `bun run db:generate:postgres` | Generate Postgres migrations            |
| `bun run db:migrate`   | Apply migrations to SQLite **and** Postgres      |
| `bun run db:migrate:sqlite` | Apply SQLite migrations                   |
| `bun run db:migrate:postgres` | Apply Postgres migrations               |
| `bun run db:push`      | Push the schema to SQLite **and** Postgres       |
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
    movies-repo-d1.ts    # Cloudflare D1 implementation
  routes/
    movies.ts        # /movies REST handlers
    movies.test.ts   # /movies endpoint tests
scripts/
  build.ts               # Bun.build: bundle server + Worker (runs macros)
  db-migrate.ts          # apply SQLite migrations
  db-migrate-postgres.ts # apply Postgres migrations
  db-seed.ts             # seed data
wrangler.jsonc       # Cloudflare Workers configuration (main: src/worker.ts)
worker-configuration.d.ts # generated Worker binding types
docker-compose.yml   # local Postgres for dialect testing
```

### Why the Worker entry is separate

Bun macros only run under Bun's bundler/transpiler — Wrangler bundles Workers with esbuild and does **not** execute them (it rejects `with { type: "macro" }` imports). So the Worker uses a dedicated entry (`src/worker.ts`) that reads the `env.DB` D1 binding directly with no macros, while the local Bun entry (`src/main.ts`) uses macros to pick its dialect at build time. This replaced the old `src/stubs/bun-sqlite.ts` + Wrangler `alias` workaround, and the Worker bundle no longer drags in `bun:sqlite` or `postgres`.
