# Data Models & Storage

1. **What is a model here?** — the capacity-composition architecture.
2. **The current models** — `User` and `Repository` (the forge's top-level unit).
3. **Where is data stored?** — the three cooperating layers.
4. **How do I query all repositories owned by a user?**
5. **How do I query the HISTORY of an entity?**

---

## 1. The model is a set of composable "capacities"

Every model (`User`, `Repository`) is produced by `defineModel` (`src/models/base.ts`),
which takes a **reflected typia schema** plus a **fixed bundle of typia
functions** (the schema module), then folds a list of *capacities* onto it. A
capacity is a tiny mixin that owns ONE cross-cutting concern and contributes a
slice of the model's API — and every capacity is reusable across models.

### The `User` model

```ts
const UserModel = defineModel<UserSchema>({
  schemaName: "UserSchema",
  schemaModule: UserSchemaModule, // typia.json.schema + assertClassify + … bound ONCE
  capacities: [
    Identifiable,                 // uuid `id`
    Timestamped,                  // `created_at`
    JsonSerialisable,             // toJSON / fromJSON (+ JSON-override ctor)
    ProtobufEncodable,            // encode / decode / message
    { capacity: SqlSerialisable, options: { name: "users", dialect: "sqlite" } }, // drizzle table + row mappers
    { capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
    Clonable,
    Comparable,                   // equals / less / more
    { capacity: Referencible, options: { relations: [{ name: "repositories", target: () => Repository, by: "ownerId", cardinality: "one-to-many", onDelete: "setNull" }] } }, // user.getRepositories()
    Randomisable,                 // User.random()
    { capacity: Queriable, options: { fields: { email: { as: "mail" } } } }, // ?mail=
    { capacity: Meterable, options: { name: "User" } },
  ],
});
class User extends UserModel {}
```

**Schema fields:** `id: uuid`, `created_at`, `name`, `email` (format email),
`role: "admin" | "member" | "viewer"`, `age` (uint32, 19 < age ≤ 100).

### The `Repository` model

```ts
const RepositoryBase = defineModel<RepositorySchema>({
  schemaName: "RepositorySchema",
  schemaModule: RepositorySchemaModule, // typia.json.schema<RepositorySchema>() + the http DTO slice
  capacities: [
    Identifiable, Timestamped,
    JsonSerialisable, ProtobufEncodable, Clonable, Comparable,
    { capacity: SqlSerialisable, options: { name: "repositories", dialect: "sqlite" } },
    { capacity: Referencible, options: { relations: [] } }, // getOwner() is DERIVED from the FK tag
    Validatable,
    Randomisable, Queriable,
    { capacity: Meterable, options: { name: "Repository" } },
  ],
});
class Repository extends RepositoryBase {}
```

**Schema fields:** `id`, `created_at`, `ownerId` (FK → `User.id` via the
`Reference<"UserSchema","id","many-to-one","setNull","inner">` tag),
`name`/`lowerName` (the `{owner}/{repo}` routing key), `description`,
`defaultBranch`, `website`, the `isPrivate`/`isArchived`/`isMirror`/`isTemplate`
flags, `objectFormatName`, `topics`, the `numStars`/`numForks`/
`numOpenIssues`/`numClosedIssues` counters, `size`, `avatar`, `status`.

> `Repository` is a *draft* subset of Forgejo's `Repository` struct
> (`packages/forgejo/models/repo/repo.go`). Issues / PRs / branches are later
> milestones; the repository is the top-level unit of the forge.

---

## 2. The current models — User, Repository

The forge's data model is a small graph: a `User` owns many `Repository`
rows, wired by the `ownerId` FK (deferred `setNull` — Forgejo itself uses
`cascade`, tighten once deletion semantics are pinned down). The relations are
declared by `Reference` FK tags (owner side, derived accessors) + manual inverse
collections (the `Referencible` options).

### The owner relation

```ts
interface RepositorySchema extends IdentifiableSchema<UUID>, TimestampedSchema {
  ownerId?: UUID &
    Reference<"UserSchema", "id", "many-to-one", "setNull", "left">; // FK to User
}
```

- `getOwner()` — owner accessor DERIVED from the `Reference` tag (no manual
  `relations` entry needed on `Repository`).
- `user.getRepositories()` — inverse collection, auto-installed by
  `wireInverseRelations()` from the tag's target (`UserSchema`), mirroring the
  tag's `onDelete: "setNull"`.

### `Siftable` — cursor pagination

`Queriable.filter` returns the WHOLE matching set; forge list endpoints need
stable paging. `Siftable` adds `static sift(items, query?, cursorOpts?)`:

```ts
const page1 = Repository.sift(user.getRepositories(), {}, { limit: 20 });
// { rows: Repository[], nextCursor: "2026-08-05T…" }

const page2 = Repository.sift(user.getRepositories(), {}, { limit: 20, cursor: page1.nextCursor });
```

Keyset (cursor) semantics: filter (same query shape as `Queriable`) → order by
a sort key (default `updated_at` desc) → resume strictly past the cursor.
Cursor is the sort-key value of the last item, so it is opaque yet sufficient
to resume; `nextCursor` is `null` on the last page.

### `Servable` — generated SQL-backed HTTP routes

`Siftable` paginates in memory; the SQL server (`scripts/serve.ts`) hand-writes
join-heavy read models. `Servable` closes the gap: it turns any
`SqlSerialisable` model into a Hono app with **generated read routes** —
`Model.serve(app, client)` registers `GET /<table>` + `GET /<table>/:id`, and
`Model.routeSpec()` introspects what a route accepts:

```ts
import { Hono } from "hono";

const app = new Hono();
User.serve(app, client);        // GET /users, GET /users/:id
Repository.serve(app, client);  // GET /repositories, GET /repositories/:id

app.get("/repositories/:id", /* explicit owner-join read model stays hand-written */);
```

It reuses the two sources the rest of the architecture already derives from the
schema — no per-model SQL:

- **`SqlSerialisable`** — the derived drizzle `table` (name + columns), the
  column kinds and the primary key, plus the `fromRow` mapper (so booleans /
  JSON come back as domain values, not storage encodings).
- **`Queriable`** — the exported `deriveFieldPlans` matcher table, so a
  `?param=` means the SAME thing over SQL as it does in-memory: boolean →
  exact, number → exact + `[min,max]` range, date → day-level range
  (`[2026-01-01,2026-12-31]`), string/uuid → substring, array → "contains all".

List semantics mirror `Siftable`: `?limit=` (clamped to `[1, maxLimit]`) and
`?cursor=` keyset pagination, ordered by a configured sort key (default
`updated_at` desc, falling back to `created_at` then the PK), with a
`nextCursor` in the response. Like `Queriable`, it is **permissive** — unknown
params and empty values are ignored, never 400. Composition order matters:
`SqlSerialisable` must be declared before `Servable` (it lifts `table` /
`fromRow`).

> **Scope is deliberately read-only per model.** `Servable` generates the two
> generic CRUD-ish read routes only. The join-heavy read models
> (`/repositories/:id` with owner, `/search`) are multi-model read models —
> they stay as explicit handlers. `Servable` is the per-model surface; the wire
> shape it emits (`{ ok, data }`) matches the hand-written server and
> `LocalTransport`.

### `Aggregable` — generated SQL-backed aggregation

`Servable`/`Queriable` answer "which ROWS match"; `Aggregable` answers "what the
matching rows ADD UP to". It turns any `SqlSerialisable` model into an
aggregateable entity — `GROUP BY` + `COUNT`/`SUM`/`AVG`/`MIN`/`MAX` — through
the same query-param surface:

```ts
const rows = Repository.aggregate(allRepos, {
  groupBy: "ownerId", count: "*", orderBy: "count:desc",
});
// [{ ownerId: "u1", count: 3 }, …]  — most repos first

Repository.serveAggregate(app, client);   // GET /repositories/aggregate
```

Query params (all optional, PERMISSIVE like `Queriable` — never 400):

| param | meaning |
|---|---|
| `groupBy` | comma-separated fields to group by (omitted → one whole-set row) |
| `count` | `*` → `COUNT(*)` (alias `count`); `count=field` → `COUNT(field)` |
| `sum`/`avg`/`min`/`max` | comma-separated numeric fields → `sum_age`, `avg_age`, … |
| any other field | a `Queriable`-style row filter applied BEFORE grouping (same `buildFilters` SQL) |
| `orderBy` | `<alias>[:asc\|desc]` (group field or aggregate alias); default: first `groupBy` field asc |
| `limit` | cap group rows (default 25, max 100) |

The answer to "which users own the most repositories":

```
GET /repositories/aggregate?groupBy=ownerId&count=*&orderBy=count:desc&limit=10
```

Every model composes `Aggregable`, so each contributes a generated route:

| model | route | example |
|---|---|---|
| `Repository` | `GET /repositories/aggregate` | "repos per owner" → `?groupBy=ownerId&count=*&orderBy=count:desc` |
| `User` | `GET /users/aggregate` | "avg age per role" → `?groupBy=role&avg=age` |

---

## 3. Storage has three cooperating layers

| Layer | File | Holds | Used for |
|---|---|---|---|
| **Identity map** | `src/storage/identity-map.ts` | `Map<(modelName, id) -> instance>` | FK navigation + collection scans (in-memory, no round-trip) |
| **Store** | `src/storage/store.ts` | uniform `key -> blob` async I/O | `Persistable` ships model bytes; swap backends behind one interface |
| **SQL projection** | `src/capacities/sql-serialisable.ts` | derived drizzle table + `toRow`/`fromRow` | `db-generate`/`db-migrate` → real `CREATE TABLE`; `db.select().from(Repository.table)` |

**The one idea that answers both query questions** — there are TWO different
"entity collections", and knowing which you want is everything:

- the **identity map** holds **ONE instance per entity id** (the *latest* one it
  saw — each construction re-registers and overwrites by `(model, id)`). This
  powers `user.getRepositories()` and returns the **current/latest** versions;
- the **version history** holds **EVERY version** of an entity (all `updated_at`
  snapshots sharing the same `id`) — append-only, owned by infrastructure (the
  repository / version-history store), **NOT** the identity map.

> Because `SqlSerialisable` derives the actual drizzle `repositories` table from
> the reflected schema (including the `ownerId` FK from the `Reference` tag), the
> SQL layer is generated, not hand-written. `db-generate`/`db-migrate` turn it
> into real `CREATE TABLE` SQL (sqlite or pg).

---

## 4. Query all repositories owned by a user

Use the `Referencible` inverse relation `user.getRepositories()` plus the fact
that the identity map already keeps the latest instance per id:

```ts
import { User } from "../src/models/user";

// Scans the identity map for every Repository whose ownerId === user.id.
// Because the map keeps only ONE instance per repo id (the most recently
// registered), this already returns one instance per repository.
const userRepos = user.getRepositories();
```

If instead you have a mixed array, narrow it with the `Queriable` matchers —
`Queriable` infers matchers from the reflected schema (boolean → exact,
date → range with `[min,max]`, string/uuid → substring):

```ts
import { Repository } from "../src/models/repository";

const owned  = Repository.filter(allRepos, { ownerId: user.id });
const public = Repository.filter(allRepos, { isPrivate: "false" });
const recent = Repository.filter(allRepos, { created_at: "[2026-01-01,2026-12-31]" });
```

**SQL equivalent** — the derived drizzle table, at the DB layer:

```ts
import { eq } from "drizzle-orm";
const repos = await db.select().from(Repository.table).where(eq(Repository.table.ownerId, user.id));
```

---

## 5. Query the HISTORY of an entity

The identity map does **not** keep old versions — it overwrites by id. The full,
append-only history of an entity lives in the version-history store (the
repository's `historyOf(id)`), which returns every `updated_at` snapshot for
that id, oldest → newest. `Versionable` gives you the tools to reason about it
(models that compose it — the `Repository` draft does not yet — get `update`
as an immutable reconstruct + `latestOf`/`compareVersions` helpers):

```ts
// every version of this entity, oldest → newest (from the repo / history store)
const history = await repo.historyOf(id);

const newest = Entity.latestOf(history);        // max updated_at (order-independent)
const oldest = history[0];                      // the first snapshot = the original

history[2].isNewerThan(history[1]);             // true
Entity.compareVersions(history[1], history[2]); // -1
```

`Versionable`'s `update` is **immutable**: it reconstructs a brand-new instance
with a strictly-later `updated_at`, so appending that result to the history store
yields the next version. The history is literally the sequence of writes your
app produced:

```ts
const v3 = newest.update({ name: "renamed" }); // NEW instance, later updated_at
await repo.append(v3);                         // history now = [..., v2, v3]
```

To fetch the **current** version of a single entity by id, that is the identity
map / `findById` (the latest registered):

```ts
const current = repo.findById(id);
```

---

## 6. Mental model, in one paragraph

| You want… | You call… | Returns |
|---|---|---|
| All repositories owned by a user | `user.getRepositories()` | one instance per repo id |
| The owner of a repository | `repo.getOwner()` | the owner (identity-map FK resolve) |
| Every version of one entity | `repo.historyOf(id)` | all `updated_at` snapshots, oldest → newest |
| Newest version from a history array | `Entity.latestOf(history)` | the max-`updated_at` instance |
| Narrow a set (private flag, date range, substring) | `Repository.filter(items, query)` | filtered array (schema-inferred matchers) |
| The same data at the SQL layer | `Repository.table` + drizzle | real rows / `CREATE TABLE` |
| The same filters over HTTP | `Repository.serve(app, client)` | `GET /repositories` (+ `/:id`), generated SQL routes |

One repository → one `getRepositories()` entry; one repo edited twice → one
`getRepositories()` entry (the latest) but a 3-version `historyOf(id)`.

---

## 7. See also — the capacity system

For the *mechanism* behind the capacity list (how `composeCapabilities` folds
capacities, `Triggerable` always-first, the `SchemaModule` slice model, marker
vs. behavioural capacities, the type-level fold), see
[`capacity-introduction.md`](./capacity-introduction.md) — the index to the
per-capacity docs below:

- Identity & provenance: [`Identifiable`](./capacity-identifiable.md), `Timestamped`, `Referencible`
- Validation & schema: [`Validatable`](./capacity-validatable.md), `SchemaModule`
- Storage & wire format: [`SqlSerialisable`](./capacity-sql-serialisable.md), [`JsonSerialisable`](./capacity-json-serialisable.md), [`ProtobufEncodable`](./capacity-protobuf-encodable.md), `Persistable`
- Versioning & immutability: [`Versionable`](./capacity-versionable.md), [`Immutable`](./capacity-immutable.md), [`Hashable`](./capacity-hashable.md)
- Query & serve: [`Queriable`](./capacity-queriable.md), `Siftable`, [`Servable`](./capacity-servable.md), `Aggregable`
- Behaviour & utilities: [`Clonable`](./capacity-clonable.md), [`Comparable`](./capacity-comparable.md), [`Randomisable`](./capacity-randomisable.md), [`Derivable`](./capacity-derivable.md), `Reactive`, [`Meterable`](./capacity-meterable.md)
