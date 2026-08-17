# Capacity: Aggregable

> **TL;DR** — `Aggregable` turns a `SqlSerialisable` model into an
> **aggregateable entity**: `GROUP BY` + `COUNT` / `SUM` / `AVG` / `MIN` / `MAX`
> over the reflected schema, queried through the *same* `?param=` surface the
> rest of the architecture uses. Where `Queriable`/`Servable` answer "which
> ROWS match", `Aggregable` answers "what the matching rows ADD UP TO" — e.g.
> **"which users posted the most throughout history?"**
> (`GET /posts/aggregate?groupBy=authorId&count=*&orderBy=count:desc`).

This document is the focused companion to
[`capacity-queriable.md`](./capacity-queriable.md) (the matcher engine),
[`capacity-servable.md`](./capacity-servable.md) (the row-level HTTP layer), and
[`data-models-storage.md`](../docs/data-models-storage.md) (the whole capacity
model). It focuses on what happens when a model — specifically the current
models `User` and `Repository` — composes `Aggregable`.

---

## 1. What it is — and isn't

`Aggregable` generates **roll-up / ranking routes** from the same two sources
`Servable` uses, plus one deliberate reuse:

1. **`SqlSerialisable`** — the derived drizzle `table` (name + column kinds).
   This is what the generated `SELECT … GROUP BY …` runs against.
2. **`Queriable`** — the schema-inferred matcher table (`deriveFieldPlans`),
   **reused verbatim**, so the *pre-aggregation row filter* means the same thing
   over SQL as in memory (boolean → exact, date → range, string/uuid →
   substring, array → list). If `Queriable` is not composed, `Aggregable` falls
   back to `options.fields`.

**It is not** a generic SQL gateway. There is no `?sql=`, no `/query` route, no
arbitrary client SQL. The `GROUP BY` columns and aggregate targets are validated
against the schema (unknown fields dropped), every identifier is quoted, every
value is `?`-bound. The surface is permissive but **bounded to known fields** —
exactly like `Servable`.

### In-memory + SQL, one query shape

Every `Aggregable` model has **two surfaces that agree by construction**:

| Surface | API | Purpose |
|---|---|---|
| In-memory | `Model.aggregate(items, query)` | group an array of domain instances (same contract as `Queriable.filter`) |
| SQL | `Model.serveAggregate(app, client)` → `GET /<path>` | translate the SAME params into a real `SELECT … GROUP BY …` |

---

## 2. Composition — what making a model aggregable changes

`Aggregable` must be composed **after** `SqlSerialisable` (it lifts `table` /
column kinds) and, for the richest `?param=` behavior, after `Queriable` (it
reuses the lifted `fieldPlans`). It is **purely additive**: it adds a static
method + a generated read-only route; it changes no existing behavior, no
persistence, no instance semantics.

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
    { capacity: Servable, options: { sort: { field: "updated_at", dir: "desc" },
        cascadeDelete: [{ table: "replies", column: "threadId" }] } },
    { capacity: Aggregable, options: { path: "/threads/aggregate" } },   // ← added
    { capacity: Meterable, options: { name: "Thread" } },
  ],
});
```

Then register the route once in the HTTP app:

```ts
import { Hono } from "hono";
const app = new Hono();
(ThreadModel.Thread as any).serveAggregate(app, client); // GET /threads/aggregate
```

### What you gain (per model) when composing `Aggregable`

| Model | Generated route | Answers | Concrete `?groupBy=` examples |
|---|---|---|---|
| `Post` | `GET /posts/aggregate` | ranking by poster | `?groupBy=authorId&count=*&orderBy=count:desc` |
| `User` | `GET /users/aggregate` | numeric roll-ups per group | `?groupBy=role&avg=age`, `?groupBy=role&sum=age` |
| `Thread` | `GET /threads/aggregate` | **threads per board** | `?groupBy=boardId&count=*&orderBy=count:desc` |
| `Board` | `GET /boards/aggregate` | boards per moderator | `?groupBy=moderatorId&count=*` |
| `Reply` | `GET /replies/aggregate` | **who replies the most** | `?groupBy=authorId&count=*&orderBy=count:desc` |

> **Note on `Post`.** It is the one BBS model **not** served by `Servable` (its
> *rows* are append-only version history, served via hand-written
> `/latest-posts` / `/users/:id/posts`). But `Post` **is** `Aggregable`: a
> `COUNT(*) GROUP BY authorId` over the `posts` table answers "which users have
> the most posts" using exactly the same generated route. See §6 for what "most
> throughout history" means (and does not mean) here.

---

## 3. Generated route — `GET /<path>`

`Model.serveAggregate(app, client)` registers **one** read-only GET route.
Default path: `/<tableName>/aggregate`.

### Query params

All optional, **permissive** (never a 400 — unknown group/aggregate fields and
unknown filter params are silently dropped, empty values ignored):

| Param | Meaning | Examples |
|---|---|---|
| `groupBy` | comma-separated fields to group by. Omitted → a single whole-set row (like SQL without `GROUP BY`) | `groupBy=authorId`, `groupBy=role,age` |
| `count` | `*` → `COUNT(*)` (alias `count`); `count=field` → `COUNT(field)` (alias `count_field`). Comma-separated for several counters | `count=*`, `count=*,age` |
| `sum` / `avg` / `min` / `max` | comma-separated **numeric** fields → aliases `sum_age`, `avg_age`, `min_age`, `max_age` | `sum=age`, `avg=age`, `min=age&max=age` |
| *any other field* | a `Queriable`-style row filter applied **BEFORE** grouping (same `buildFilters` SQL) | `published=true`, `created_at=[2026-01-01,2026-12-31]`, `mail=ada` |
| `orderBy` | comma-separated `<alias>[:asc\|desc]` where `<alias>` is a group field or an aggregate alias. Default: first `groupBy` field **asc** (stable) | `orderBy=count:desc`, `orderBy=role:asc,count:desc` |
| `limit` | cap the number of group rows (default 25, max 100) | `limit=10` |

### Examples

```http
# "which users posted the most?" — most posts first
GET /posts/aggregate?groupBy=authorId&count=*&orderBy=count:desc&limit=10

# "threads per board" after my Thread was made aggregable
GET /threads/aggregate?groupBy=boardId&count=*&orderBy=count:desc

# "who replies the most" after my Reply was made aggregable
GET /replies/aggregate?groupBy=authorId&count=*&orderBy=count:desc

# "boards per moderator" after my Board was made aggregable
GET /boards/aggregate?groupBy=moderatorId&count=*

# "average age per role, only published-ish rows (boolean filter)"
GET /users/aggregate?groupBy=role&avg=age
```

Roughly, `/posts/aggregate?groupBy=authorId&count=*&published=true&orderBy=count:desc`
becomes:

```sql
SELECT "authorId", COUNT(*) AS "count"
FROM "posts"
WHERE "published" = 1
GROUP BY "authorId"
ORDER BY "count" DESC
LIMIT 25;
```

### Response envelope

Mirrors the rest of the API — `{ ok, data }`, `data` being an **array** of
aggregate rows (one per group):

```json
{ "ok": true, "data": [
  { "authorId": "u1", "count": 3 },
  { "authorId": "u2", "count": 2 },
  { "authorId": "u3", "count": 1 }
] }
```

Aggregate rows are **plain data** (group field values + aggregate aliases) — not
domain entities, so no `fromRow` decoding applies.

---

## 4. Degenerate cases (the shape is forgiving by design)

These fall out of the same code path, no extra options:

- **No `groupBy`, no aggregate** → a single whole-set row count
  (`GET /posts/aggregate` → `[{ "count": 5 }]`), mirroring the CLI `--count`.
- **`groupBy` only, no aggregate** → `COUNT(*)` is implied per group.
- **Filters + no group** → `?published=true` alone gives the filtered count.
- **`orderBy` on a non-existent alias** → dropped; falls back to the first
  `groupBy` field ascending.
- **Empty `groupBy` (all fields unknown)** → treated as no grouping (whole-set
  count), never an error.
- **`avg`/`sum` over a non-numeric field** → the field is dropped from the
  valid target set (see `aggregateSpec()`, §5).

---

## 5. Introspection — `Model.aggregateSpec()`

Discovers exactly what a generated aggregate route accepts: path, table, the
**full accepted `?param=` field list** (field, param key, mode, isDate), and
which aggregate functions accept which targets (`"*"` = `COUNT(*)`):

```ts
import { Post } from "@/models/post";
console.log(Post.aggregateSpec());
// { path: "/posts/aggregate", table: "posts", dialect: "sqlite",
//   fields: [ { field: "authorId", param: "authorId", mode: "substring", isDate: false },
//             { field: "published", param: "published", mode: "eq",       isDate: false },
//             { field: "created_at", param: "created_at", mode: "range",  isDate: true }, … ],
//   aggregates: { count: ["*", "id", "authorId", "published", "created_at", …],
//                 sum: ["…numeric fields…"], avg: […], min: […], max: […] },
//   limit: { default: 25, max: 100 } }
```

---

## 6. "Throughout history" — what it does and does not mean

The generated aggregate counts **rows in the current `posts` table** — one row
per post id (the identity map keeps the latest version of each id). So:

- `COUNT(*) GROUP BY authorId` ≈ "how many posts each user currently holds" ≈
  **cumulative posts** (an id never truly disappears), which is almost always
  the intended ranking.
- It does **not** count *edit versions* — a repository's full history lives in
  the **append-only version store** (`repo.historyOf(id)`, see
  `data-models-storage.md` §5), which has **no aggregation surface** of its own.

The generic single-table capacity is `GET /repositories/aggregate`; a richer,
join-heavy read-model (e.g. owner names on the grouped rows) would be a
hand-written sibling in `src/http/app.ts`. Both answer the same question; they
are different layers.

---

## 7. Relationship to sibling capacities

| Capacity | Role | Supplies |
|---|---|---|
| `SqlSerialisable` | derives `table` + column kinds | the table/columns the `GROUP BY` runs against |
| `Queriable` | the matcher engine (`deriveFieldPlans`) | the `FieldPlan[]` `Aggregable` reuses for the pre-aggregation filter (single source of truth for aliases like `?mail=`) |
| `Servable` | row-level generated HTTP/SQL | `buildFilters` — the SAME `WHERE` builder `Aggregable` uses, so a `?param=` filter means the same thing on the list route and the aggregate route |
| `Siftable` | in-memory keyset pagination | row-level only — no aggregation |
| `Aggregable` | **this** — GROUP BY + COUNT/SUM/AVG/MIN/MAX | generated aggregate route + in-memory `aggregate` |

`Aggregable` does **not** require `Queriable` — if absent it derives its own
field plans from `options.fields`. But composing `Queriable` first is preferred,
because a `fields` alias declared once on `Queriable` is honored over the
aggregate route automatically (e.g. `?mail=` on `/users/aggregate`).

---

## 8. Options reference

| Option | Default | Meaning |
|---|---|---|
| `path` | `/<tableName>/aggregate` | route base path |
| `client` | — | default `SqlQueryExecutor` when `serveAggregate(app)` omits one |
| `fields` | — | per-field matcher overrides (same shape as `Queriable`; only used when `Queriable` is **not** composed) |
| `dialect` | `"sqlite"` | must match `SqlSerialisable` (`sqlite` / `pg`) |
| `defaultLimit` | `25` | default number of group rows |
| `maxLimit` | `100` | hard cap on group rows |

---

## 9. See also

- [`capacity-queriable.md`](./capacity-queriable.md) — the matcher engine and
  the `?param=` semantics table this capacity's pre-aggregation filter reuses.
- [`capacity-servable.md`](./capacity-servable.md) — the row-level HTTP/SQL
  sibling; the `buildFilters` shared by both; the keyset pagination this
  capacity intentionally does not need (aggregate rows are bounded by `limit`).
- [`capacity-sql-serialisable.md`](./capacity-sql-serialisable.md) — the
  foundation: how the drizzle table, column kinds, PK/FK are derived.
- [`data-models-storage.md`](../docs/data-models-storage.md) — the whole capacity
  model, the current models, and the storage layers.
- `src/capacities/aggregable.ts` — the capacity factory (`aggregate`,
  `serveAggregate`, `aggregateSpec`).
- `src/http/app.ts` — the `*.serveAggregate(app, client)` wiring, registered
  **before** the per-model CRUD so a literal `/users/aggregate` beats the
  generic `GET /users/:id`.
