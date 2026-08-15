# Capacity: Servable

> **TL;DR** — `Servable` turns a `SqlSerialisable` model into a small **generated
> REST surface** (`GET /<table>`, `GET /<table>/:id`, plus `POST`/`PUT`/`DELETE`)
> backed by SQL. The list route reuses `Queriable`'s schema-inferred `?param=`
> filters and adds keyset pagination — so "make a model queryable via query
> params over the REST API" is exactly what this capacity does.

This document is the focused companion to
[`capacity-queriable.md`](./capacity-queriable.md) (the matcher engine) and
[`data-models-storage.md`](../docs/data-models-storage.md) (the whole capacity
model). Read *that* one for the `?param=` semantics table; this one covers the
HTTP/SQL layer those params run through.

---

## 1. What it is — and isn't

`Servable` generates **per-model CRUD + filterable list routes**. It is the
"models become HTTP endpoints" prototype: route lists and `WHERE` filters are
*derived*, not hand-written. They come from the same two sources the rest of the
architecture already uses:

1. **`SqlSerialisable`** — the derived drizzle `table` (name + columns). This is
   what the SQL runs against, via a caller-supplied client (`exec.unsafe(sql, params)`).
2. **`Queriable`** — the schema-inferred matcher table (`deriveFieldPlans`),
   **reused verbatim** so `?param=` means the same thing over SQL as in memory
   (boolean → exact, date → range, string/uuid → substring, array → list).

**It is not** a generic SQL gateway. There is no `?sql=`, no `/query` route, no
arbitrary client SQL — the only `unsafe()` calls are *server-side, inside these
handlers*. The filter surface is permissive but **bounded to known fields**
(`buildFilters` ignores unknown params). See §7 for why raw SQL is never a
client passthrough.

---

## 2. Composition

`Servable` must be composed **after** `SqlSerialisable` (it lifts `table` /
`fromRow`) and, for the richest `?param=` behavior, after `Queriable`. It also
pairs with `Validatable` (write guards) and is independent of `Connectable`
(the client-side transport binding).

```ts
const ThreadModel = defineModel<ThreadData>({
  schemaName: "ThreadData",
  schemaModule: ThreadSchemaModule,
  capacities: [
    Identifiable, Timestamped, JsonSerialisable, ProtobufEncodable, Clonable,
    Comparable,
    { capacity: SqlSerialisable, options: { name: "threads", dialect: "sqlite" } },
    Referencible, Validatable, Randomisable,
    Queriable,
    { capacity: Servable, options: {
        sort: { field: "updated_at", dir: "desc" },
        cascadeDelete: [{ table: "replies", column: "threadId" }],
      } },
    { capacity: Meterable, options: { name: "Thread" } },
  ],
});
```

Then, in the HTTP app, register the routes once:

```ts
import { Hono } from "hono";
const app = new Hono();
(ThreadModel.Thread as any).serve(app, client); // GET/POST/PUT/DELETE /threads
```

### Currently served models (`src/http/app.ts`)

| Model | Route | Writes | Notes |
|---|---|---|---|
| `User` | `/users` | on | `sort` → `created_at desc` (no `updated_at`); `?mail=` alias via `Queriable` |
| `Board` | `/boards` | on | `sort` → `updated_at desc` |
| `Thread` | `/threads` | on | `cascadeDelete` replies by `threadId` |
| `Reply` | `/replies` | on | `sort` → `created_at asc`; `cascadeDelete` replies by `parentId` (self-ref) |
| `Post` | — | — | **intentionally NOT served** — append-only version history; served via `/latest-posts`, `/users/:id/posts` hand-written routes instead |

---

## 3. Generated routes

`Model.serve(app, client)` registers:

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/<table>` | list: `?param=` filters + keyset (`?limit=`/`?cursor=`) + sort |
| `GET` | `/<table>/:id` | one row by primary key (404 when absent) |
| `POST` | `/<table>` | create: body is a domain object → `toRow` → insert (201 + decoded row) |
| `PUT` | `/<table>/:id` | partial update: only provided columns `SET` (no null clobber) |
| `DELETE` | `/<table>/:id` | delete by PK (404 when absent; returns `{ id, deleted: true }`) |

All toggled by options: `byId` (default `true`), `write` (default `true`).

### Response envelope

Mirrors the hand-written server:

```json
{ "ok": true,  "data": { "rows": [ … ], "nextCursor": "2026-08-15T…" } }   // GET list
{ "ok": true,  "data": { … } }                                               // GET /:id, POST, PUT
{ "ok": true,  "data": { "id": "…", "deleted": true } }                     // DELETE
{ "ok": false, "data": { "error": "…" } }                                   // 400/404/500
```

Rows are decoded through `SqlSerialisable.fromRow`, so booleans / JSON columns
come back as domain values, not storage encodings.

---

## 4. The list route (`GET /<table>`)

### Filters → `WHERE`

`?param=` values become SQL `WHERE` clauses via the **same** `deriveFieldPlans`
matcher table `Queriable` derives (`buildFilters`, `servable.ts:199`). Every
identifier is quoted; every value is `?`-bound (injection-safe). Unknown params
and empty values are silently ignored (never a 400).

```http
GET /posts?authorId=<uuid>&published=true&created_at=[2026-01-01,2026-12-31]&limit=20&cursor=<iso>
```

→ roughly:

```sql
SELECT * FROM "posts"
WHERE "authorId" LIKE ? AND "published" = 1
  AND date("created_at") >= ? AND date("created_at") <= ?
  AND "created_at" < ?
ORDER BY "created_at" DESC
LIMIT 21;
```

The full `?param=` semantics table (boolean → `eq`, number/date → `range`,
uuid/string → `substring`, array → `list`, bare-exact vs `[min,max]`-range) is
in `capacity-queriable.md` §3. **The `?mail=` alias is honored here automatically**
because `Servable` reuses the `FieldPlan[]` that `Queriable` lifts
(`Queriable.fieldPlans`) — declare the alias once, on `Queriable` (`user.ts`).

### Sort

Defaults to `updated_at desc`, falling back to `created_at`, then the primary
key when a model lacks a natural sort key (e.g. `User`). Override with the
`sort` option (`thread.ts` uses `updated_at desc`; `reply.ts` uses
`created_at asc`).

### Pagination — keyset (cursor)

Not offset. `?limit=` is clamped to `[1, maxLimit]` (default 25, max 100).
`?cursor=` resumes **strictly after** the last seen sort-key value
(`WHERE sortKey < ?` for desc), so it's stable under concurrent writes. The
handler fetches `limit + 1` rows to detect a next page; `nextCursor` is the last
row's sort-key value when more exist.

---

## 5. Write routes

### Create (`POST`) — server-managed fields

- Body is a domain JSON object; encoded through `SqlSerialisable.toRow`.
- The client **never** decides the final `id` / `created_at` / `updated_at`:
  - `id` is generated (`crypto.randomUUID()`) when absent; a client-supplied id
    is honored (idempotent creates).
  - `created_at` / `updated_at` are **always** the server clock.
- Omitted **boolean** columns default to `false`. Other optional/nullable
  columns are left unset (`toRow` skips them; DB `DEFAULT`/nullability covers
  them). Required non-boolean fields left missing → `Validatable` 400s.

### Update (`PUT`) — partial, no null clobber

- Body is a field patch merged onto the current row (decoded via `fromRow`).
- `toRow` skips absent fields, so **only the provided columns are `SET`** — a
  `null` or omitted field is never written.
- `created_at` and the PK are pinned (client values ignored); `updated_at`
  refreshes.

### Delete (`DELETE`) — cascade helper

Deletes by PK (404 when absent). When the DB doesn't enforce `ON DELETE CASCADE`
(SQLite/D1 by default), set `cascadeDelete` to delete FK children **first**:

```ts
// thread.ts — a thread's replies go before the thread
cascadeDelete: [{ table: "replies", column: "threadId" }]
// reply.ts — a reply's nested replies (self-reference via parentId) go first
cascadeDelete: [{ table: "replies", column: "parentId" }]
```

### Validation

When the model also composes `Validatable`, the static `assert` (the strictest
guard `Validatable` lifts) runs on the **create body** and the **merged update
object** before any write. A bad payload never reaches SQL — this is the safety
net that makes "every Servable model gets CRUD" safe.

---

## 6. Introspection — `Model.routeSpec()`

Discovers exactly what a generated route accepts: path, table, sort key, limit
bounds, and the **full accepted `?param=` list** (field, param key, mode,
isDate):

```ts
import { User } from "@/models/user";
console.log(User.routeSpec());
// { path: "/users", table: "users", idColumn: "id", dialect: "sqlite",
//   sort: { field: "created_at", dir: "desc" },
//   limit: { default: 25, max: 100 },
//   fields: [ { field: "email", param: "email", mode: "substring", isDate: false },
//             { field: "email", param: "mail",  mode: "substring", isDate: false }, … ],
//   write: true }
```

---

## 7. What it CANNOT do — and the pattern instead

The `?param=` surface is **row-level `WHERE` filtering only**. There is no
`?groupBy=`, `?orderBy=count`, or `?aggregate=`. So:

> `GET /threads?authorId=<id>` works, but "rank users by post count" does not.

Aggregation (a multi-row read-model) is kept out of the generic filter and lives
in **hand-written join endpoints** — `/stats`, `/boards/:id/hot`,
`/stats/top-posters` (`src/http/app.ts`), each using `client.unsafe(sql)`
**server-side only**.

**Raw SQL is never a client passthrough.** A `?sql=` route would be a direct
SQL-injection / data-exfiltration hole (`DROP`, cross-table reads). The only
ad-hoc runner that exists is the dev/ops CLI (`src/cli/query.ts`), and even that
is structured (drizzle `WHERE` from a JSON filter) — still no `GROUP BY`. If you
need client-triggerable but server-vetted aggregation, add a **named query
registry** (predefined SQL keyed by a safe name), not a raw passthrough.

---

## 8. Options reference

| Option | Default | Meaning |
|---|---|---|
| `path` | `/<tableName>` | route base path |
| `client` | — | default `SqlQueryExecutor` when `serve(app)` omits one |
| `sort` | `{ field: "updated_at", dir: "desc" }` | list sort (falls back to `created_at`, then PK) |
| `fields` | — | per-field matcher overrides (same shape as `Queriable`; only used when `Queriable` is **not** composed) |
| `defaultLimit` | `25` | page size |
| `maxLimit` | `100` | page-size ceiling |
| `dialect` | `"sqlite"` | must match `SqlSerialisable` (`sqlite` / `pg`) |
| `byId` | `true` | emit `GET /<table>/:id` |
| `write` | `true` | emit `POST`/`PUT`/`DELETE` |
| `cascadeDelete` | `[]` | child tables to delete before the row (FK safety on SQLite/D1) |

---

## 9. Relationship to sibling capacities

| Capacity | Role | Supplies |
|---|---|---|
| `SqlSerialisable` | derives `table` + `fromRow`/`toRow` from the schema | the columns/kinds `Servable` reads |
| `Queriable` | the matcher engine (`deriveFieldPlans`, `Model.filter`) | the `FieldPlan[]` `Servable` reuses (single source of truth for aliases) |
| `Servable` | **this** — generated HTTP/SQL CRUD + filterable list | routes, keyset pagination, write guards |
| `Siftable` | in-memory keyset pagination for BBS list endpoints | same query shape, no HTTP |
| `Connectable` | declares a model reachable at a route for client-side `fetch` | the transport binding (separate from SERVE) |
| `Validatable` | strict payload guard | `assert` run on create/update bodies |

`Servable` does **not** require `Queriable` to be composed — if `Queriable` is
absent it derives its own field plans from `options.fields`. But composing
`Queriable` first is preferred, because then a `fields` alias declared once on
`Queriable` is honored over SQL automatically.

---

## 10. See also

- [`capacity-queriable.md`](./capacity-queriable.md) — the matcher engine and
  the `?param=` semantics table (boolean/number/date/uuid/array).
- [`capacity-sql-serialisable.md`](./capacity-sql-serialisable.md) — the
  foundation this capacity reads: how the drizzle table, column kinds, PK, and
  FK constraints are derived from the reflected schema.
- [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) — the JSON
  `toJSON`/`fromJSON` capacity; the text wire-format sibling of the SQL one this
  capacity serves.
- [`capacity-protobuf-encodable.md`](./capacity-protobuf-encodable.md) — the
  binary `encode`/`decode`/`message` capacity; the other wire-format sibling.
- [`capacity-versionable.md`](./capacity-versionable.md) — the `updated_at`
  version field the list route sorts/filters on; append-only version semantics.
- [`capacity-hashable.md`](./capacity-hashable.md) — the `contentHash` field
  the routes read/serve (derived SHA-256; never a filter param).
- [`data-models-storage.md`](../docs/data-models-storage.md) — the whole
  capacity model, the BBS models, storage layers, and the "query latest posts"
  / "query post history" recipes.
- `src/capacities/servable.ts` — the route generator (`buildFilters`,
  `runList`/`runById`/`runCreate`/`runUpdate`/`runDelete`, `routeSpec`).
- `src/capacities/queriable.ts` — the matcher engine + `deriveFieldPlans`.
- `src/http/app.ts` — the hand-written aggregation read-models (`/stats`,
  `/boards/:id/hot`, `/stats/top-posters`) and the `*.serve(app, client)` wiring.
