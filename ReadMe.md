# Data Modelling Starter

A TypeScript-first validation and data-modelling starter: models are composed
from reusable **capacities** over reflected typia schemas, with a generated SQL
projection (`SqlSerialisable`), an in-memory identity map, and a full CLI for
building models, generating/applying migrations, seeding a BBS dataset, and
querying — plus an optional local HTTP query server (a Hono app: hand-written
"good queries" plus `Servable`-generated per-model routes).

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
bun run src/main.ts ui:build             # build the UI -> dist/ui/_worker.js
bun run src/main.ts serve                # UI at / , JSON API at /api, on :8787
#   dev server with HMR instead:  bun run src/main.ts ui:dev
```

Set `DATABASE_URL` (e.g. `file:./dev.db`) in the environment or `.env`.

> **Routes when `serve` runs with a built UI**: the Honox UI is at `/` and the
> JSON query API is at `/api/…`. Without a UI build, the JSON API is served at
> both `/` and `/api`.

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
  services/       event bus + transport
scripts/
  build.ts        programmatic Bun.build (typia transform plugin)
  model-build.ts  models:build  — models → src/generated/models.json
  db-generate.ts  db:generate   — models.json → CREATE TABLE SQL in drizzle/
  db-migrate.ts   db:migrate    — apply migration SQL via drizzle-orm/bun-sql
  seed.ts         db:seed       — BBS dataset via Randomisable.random()
  serve.ts        serve         — local server: Honox UI at / + JSON API at /api
  ui-build.ts     ui:build      — build the Honox UI -> dist/ui/_worker.js
app/              Honox UI (routes/, islands/, client.ts, style.css — Panda CSS)
panda.config.ts   Panda CSS config (tokens + utilities -> styled-system/)
vite.ui.config.ts Vite config for building the UI (@hono/vite-build/bun)
docs/             data-models-storage + CLI reference
```
