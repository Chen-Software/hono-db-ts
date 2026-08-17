# Capacity: Queriable

> **TL;DR** — `Queriable` turns *any* model into a queryable entity whose
> `?param=` semantics are **inferred from the reflected schema**, with zero
> per-model predicate code. Over the REST API, the companion `Servable`
> capacity ([`capacity-servable.md`](./capacity-servable.md)) reuses that exact
> inference to generate `GET /<table>` routes that accept the same `?param=`
> filters plus `?limit=`/`?cursor=` pagination.

This document is the focused companion to
[`data-models-storage.md`](../docs/data-models-storage.md). It covers **only**
the queriable capacity and how to drive it through query params — both
in-memory and over the REST API.

---

## 1. The problem it removes

Before `Queriable`, filtering a model meant a hand-written predicate function
per model (`filterPosts`, `filterUsers`, …) that had to stay in sync with the
schema by hand. `Queriable` replaces that boilerplate: it reads the *same*
reflected typia schema the rest of the architecture uses (`SqlSerialisable`
derives its drizzle table from it) and, per field, decides the correct matcher.

It never touches SQL or the transport layer — it filters an in-memory array of
model instances. `Servable` is the bridge to the REST API: it reuses the
**exact same** matcher table so a `?param=` means the same thing in memory and
over SQL.

```ts
const filtered = Post.filter(items, c.req.query()); // in-memory
// over REST: GET /posts?authorId=…&published=… (Servable)
```

---

## 2. How to compose it into a model

`Queriable` is just another capacity in the `defineModel` bundle. No other
model code changes:

```ts
const PostModel = defineModel<PostData>({
  schemaName: "PostData",
  schemaModule: PostSchemaModule,
  capacities: [
    Identifiable, Timestamped, JsonSerialisable, ProtobufEncodable, Clonable,
    Comparable,
    { capacity: SqlSerialisable, options: { name: "posts", dialect: "sqlite" } },
    Referencible, Versionable, Validatable,
    { capacity: Hashable, options: { key: "body" } },
    Randomisable,
    Queriable,                                  // ← adds Post.filter(items, query)
    { capacity: Meterable, options: { name: "Post" } },
  ],
});
```

`User` composes it too, with a `fields` override that exposes an alias:

```ts
{ capacity: Queriable, options: { fields: { email: { as: "mail" } } } },
```

So `?email=` and `?mail=` both filter `User` by email.

To expose the model over the REST API, add `Servable` **after**
`SqlSerialisable` (it lifts `table`, `fromRow`):

```ts
{ capacity: Servable, options: { sort: { field: "created_at", dir: "desc" } } },
// → GET /users?… (Servable registers the route via User.serve(app, client))
```

**Note:** declare the `fields` alias **once**, on `Queriable`. `Servable`
reuses the `FieldPlan[]` that `Queriable` lifts onto the class
(`Queriable.fieldPlans`) as the single source of truth for `?param=`
semantics, so `?mail=` is honored over SQL automatically — you do **not** need
to repeat `fields` on `Servable`. (If `Queriable` is not composed, `Servable`
falls back to deriving its own plans from its own `fields` option.)

---

## 3. Query-param semantics (schema-inferred)

`Queriable` decides each field's matcher in this priority order:

1. A `fields` override in the capacity options (`{ fields: { created_at: { mode: "range" } } }`).
2. Inference from the reflected column kind / `format`.

### Mode table

| Field kind / `format` | Inferred mode | `?param=` meaning |
|---|---|---|
| `boolean` | `eq` | exact `true`/`false` → `?published=true` |
| `number` / `integer` | `range` | bare = exact number; `[min,max]` = closed numeric range → `?age=[20,30]` |
| `date` / `date-time` | `range` | bare = exact **day**; `[min,max]` = closed date range → `?created_at=[2026-01-01,2026-12-31]` |
| `uuid` / `string` | `substring` | case-insensitive `includes` → `?title=keyword`, `?authorId=<prefix>` |
| `array` | `list` | comma list "contains ALL" → `?tags=a,b` |
| overridden to `none` | — | field is **not** queryable (ignored like an unknown param) |

### The range convention (important)

For `range` fields a **bare** value is an **exact** match; only a value wrapped
in `[` `]` is a **tuple range**. This keeps commas on the wire unambiguous — a
comma is a literal value, never a range separator:

```
?created_at=2026-08-15              → exact day-level match
?created_at=[2026-01-01,2026-12-31] → closed range  >= min AND <= max
?age=25                            → exactly 25
?age=[20,30]                       → 20 <= age <= 30
```

---

## 4. Driving it from the REST API

`Servable.serve(app, client)` registers `GET /<table>` (and `GET /<table>/:id`).
The list route translates `?param=` values into `WHERE` clauses using the
**same** matcher table `Queriable` derives, with all identifiers quoted and all
values `?`-bound (SQL injection-safe). Unknown params and empty values are
**ignored** (never a 400). The full route list, write routes, validation,
`cascadeDelete`, and `routeSpec()` introspection are documented in
[`capacity-servable.md`](./capacity-servable.md).

```http
# Posts by a specific author, only published, in 2026, paginated
GET /posts?authorId=<uuid>&published=true&created_at=[2026-01-01,2026-12-31]&limit=20&cursor=<iso>

# Users whose email contains a string (note the `mail` alias)
GET /users?mail=example.com&limit=50

# Boards sorted by created_at desc (Siftable-style keyset pagination)
GET /boards?limit=25&cursor=<iso>
```

Equivalent in-memory call (same semantics):

```ts
Post.filter(posts, {
  authorId: "<uuid>",
  published: "true",
  created_at: "[2026-01-01,2026-12-31]",
});
```

### Pagination

| Layer | Mechanism | Params |
|---|---|---|
| `Servable` (REST) | keyset (cursor) | `?limit=` (clamped to `[1, maxLimit]`, default 25) + `?cursor=`; response carries `nextCursor` |
| `Siftable` (in-memory) | keyset (cursor) | `Model.sift(items, query?, { limit, cursor })` |
| `Queriable` (in-memory) | slice only | `Model.filter(items, query)` honours `?limit=` |

Sort order defaults to `updated_at` desc, falling back to `created_at`, then the
primary key when a model lacks a natural sort key (e.g. `User`). Override with
`Servable`'s `sort` option.

---

## 5. The permissive contract

All matching is **permissive** so extra/optional params can't break a request
(`queriable.ts:46`, `servable.ts:194`):

- an unknown param key → ignored (no 400);
- an empty value (`""`) → ignored (predicate passes);
- an unparseable range bound → that field's clause is skipped;
- a field absent on an item → treated as a pass.

This is why `?mail=` works for `User` but is silently dropped for `Post` (no
`mail` field, no alias).

---

## 6. What it CANNOT do — and the right pattern instead

`Queriable`/`Servable` params are **row-level filters**: they emit `WHERE`
predicates against *individual rows*. There is deliberately **no**
`?groupBy=`, `?orderBy=count`, or `?aggregate=`. So you can ask:

> "all published posts by author X in 2026"

but you **cannot** ask:

> "rank users by how many repositories they own"  (a `GROUP BY ownerId ORDER BY COUNT(*) DESC`)

That is an **aggregation** (a multi-row read-model), which the architecture
keeps out of the generic filter surface. The generated answer is the
`Aggregable` capacity — `GET /repositories/aggregate?groupBy=ownerId&count=*`
(`src/capacities/aggregable.ts`) — and join-heavy variants are hand-written
read-models in `src/http/app.ts` (e.g. `/stats`). Those use
`client.unsafe(sql)` **server-side only**; the REST API does **not** accept
arbitrary SQL from clients (that would be a SQL-injection / data-exfiltration
hole).

If you need client-triggerable but server-vetted aggregation, add a **named
query registry** (predefined SQL keyed by a safe name) — never a raw `?sql=`
passthrough.

```http
# the supported way to answer "who owns the most repositories"
GET /repositories/aggregate?groupBy=ownerId&count=*&orderBy=count:desc&limit=10
```

---

## 7. Relationship to sibling capacities

| Capacity | Role | Supplies |
|---|---|---|
| `SqlSerialisable` ([`capacity-sql-serialisable.md`](./capacity-sql-serialisable.md)) | **root** — derives the drizzle `table` + `fromRow`/`toRow` + FKs + `CHECK`s from the reflected schema | the columns + kinds `Queriable`/`Servable`/`Siftable` all read |
| `Queriable` | the matcher engine (`deriveFieldPlans`, `Model.filter`) | the per-field query-param → matcher table |
| `Servable` | generates `GET /<table>` (+ write routes) over SQL | reuses `Queriable.fieldPlans` (the lifted static) — single source of truth for aliases |
| `Siftable` | in-memory keyset pagination for BBS list endpoints | same query shape, ordered + cursor-paged |

Composition order matters: `SqlSerialisable` **must** precede `Servable`.

---

## 8. Introspection

`Servable` exposes `Model.routeSpec()` — it returns the path, table, sort key,
limit bounds, and the **full accepted `?param=` list** (field, param key, mode,
isDate) so a client can discover exactly what a route accepts:

```ts
import { User } from "@/models/user";
console.log(User.routeSpec());
// { path: "/users", table: "users", sort: { field: "created_at", dir: "desc" },
//   limit: { default: 25, max: 100 },
//   fields: [ { field: "email", param: "email", mode: "substring", isDate: false },
//             { field: "email", param: "mail",  mode: "substring", isDate: false }, … ],
//   write: true }
```

---

## 9. See also

- [`capacity-servable.md`](./capacity-servable.md) — the HTTP/SQL layer these
  `?param=` semantics run through: generated CRUD routes, keyset pagination,
  write guards, `cascadeDelete`, and `routeSpec()` introspection.
- [`capacity-sql-serialisable.md`](./capacity-sql-serialisable.md) — the
  foundation these params read from: how columns/kinds/FKs/`CHECK`s are derived
  from the reflected schema.
- [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) — the JSON
  `toJSON`/`fromJSON` capacity; the text wire-format sibling of the SQL layer.
- [`capacity-protobuf-encodable.md`](./capacity-protobuf-encodable.md) — the
  binary `encode`/`decode`/`message` capacity; the other wire-format sibling.
- [`capacity-versionable.md`](./capacity-versionable.md) — the `updated_at`
  version field these params filter on: append-only version semantics.
- [`capacity-hashable.md`](./capacity-hashable.md) — the `contentHash` field
  (a derived SHA-256 of the payload, not a query key) these params never filter.
- [`data-models-storage.md`](../docs/data-models-storage.md) — the whole capacity
  model, the current models, the storage layers, and the "query repositories of
  a user" / "query history" recipes.
- `src/capacities/queriable.ts` — the matcher engine + `deriveFieldPlans`.
- `src/capacities/servable.ts` — the SQL route generator + `buildFilters`.
- `src/http/app.ts` — the hand-written read-models (`/stats`, `/repositories/:id`).
