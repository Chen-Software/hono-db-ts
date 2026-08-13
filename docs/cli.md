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

Run the local BBS query server (`scripts/serve.ts`, default `:8787`). The
server is a **Hono app** (`import { Hono } from "hono"`); its handler is fed to
`Bun.serve({ fetch: app.fetch })`, so the same `app` can be reused in-process
(the shape `LocalTransport` in `src/services/transport.ts` consumes). Two kinds
of routes coexist:

1. **Hand-written "good queries"** — the multi-model read models that need
   joins/aggregation, registered in `scripts/serve.ts`: `/stats`, `/boards`,
   `/boards/:id/threads`, `/boards/:id/hot`, `/threads/:id`,
   `/threads/:id/replies`, `/users/:id`, `/users/:id/posts`,
   `/users/:id/replies`, `/search?q=`, `/latest-posts`.
2. **Generated per-model routes** — the `Servable` capacity (see
   `docs/data-models-storage.md` §6) turns any `SqlSerialisable` model into
   `GET /<table>` + `GET /<table>/:id` automatically via `Model.serve(app,
   client)`, reusing `Queriable`'s matcher inference for `?param=` filtering
   and `Siftable`'s keyset pagination (`?limit=&cursor=`).

Every endpoint reads the SAME database the CLI `query` command and the
`db:generate`/`db:migrate`/`db:seed` pipeline use, through the derived drizzle
tables (`drizzle-orm/bun-sql` + `databaseUrl()` macro + `new SQL(url)`, exactly
like the app). Responses are `{ ok: true, data }` / `{ ok: false, data: { error } }`.

---

## Typical workflow

```bash
export DATABASE_URL="file:./dev.db"

bun run src/main.ts db:generate && bun run src/main.ts db:migrate   # schema
bun run src/main.ts db:seed                                          # data
bun run src/main.ts query boards --count                             # verify
bun run src/main.ts serve &                                          # HTTP API
```
