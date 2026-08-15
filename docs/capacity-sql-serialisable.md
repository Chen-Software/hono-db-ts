# Capacity: SqlSerialisable

> **TL;DR** — `SqlSerialisable` is the **model → Drizzle bridge** and the single
> SQL home of the codebase. A model composes it with a `name` (the table name)
> and it **derives** the drizzle `Table`, the `toRow`/`fromRow` mappers, the
> foreign-key `.references()` constraints, and `CHECK` constraints — all from
> the model's reflected typia JSON schema. The model writes **zero** drizzle
> column code. Both `Queriable` and `Servable` read this same derived plan.

This document is the focused companion to
[`capacity-queriable.md`](./capacity-queriable.md) (the filter engine) and
[`capacity-servable.md`](./capacity-servable.md) (the HTTP/SQL CRUD surface).
Those two capacities are **downstream consumers** of what this one produces; read
this one to understand *where the columns and kinds come from*.

---

## 1. What it is — the single SQL home

`SqlSerialisable` does two jobs in one file:

1. **The bridge helpers** — `toDrizzleTable`, `deriveSqlPlan`, `SqlSchemaDef`,
   `SqlModelPlan`, `SqlTablisableOptions` — that turn a reflected typia JSON
   schema into a real Drizzle `Table` + row mappers, for either dialect.
2. **The capacity** — consumes those helpers at compose time and **lifts**
   `table` / `toRow` / `fromRow` onto the model class.

Historically the bridge lived in a misleadingly-named `sql-tablisable.ts`.
That name is gone: `SqlSerialisable` (registered in `compose.ts`) is the only
SQL capacity, and it is the **single source of truth** for "what columns does
this model have, and how are they stored." `Queriable`/`Servable`/`Siftable`
all read the plan it derives (`deriveSqlPlan`) — they never re-derive columns.

The reflected schema (`mod.schema`, a plain JSON object typia inlines at build
time) carries our custom `Reference` tag as an `x-reference` extension. The
bridge turns that into a real Drizzle table **and** derives FK columns +
`.references()` constraints from any `x-reference` it finds. It is deliberately
**typia-free at runtime** — `toDrizzleTable` runs under plain `bun`/Workers with
no transformer.

---

## 2. How to compose it

`name` is **required** — the reflected schema has no reliable table name.
`dialect` picks the **primary** projection (default `"sqlite"`); the opposite
dialect is derived alongside it unless `both: false`.

```ts
const PostModel = defineModel<PostSchema>({
  schemaName: "PostSchema",          // must match the `Reference` target names
  schemaModule: PostSchemaModule,
  capacities: [
    JsonSerialisable,
    { capacity: SqlSerialisable, options: { name: "posts", dialect: "sqlite" } },
    Queriable,
    { capacity: Servable, options: { sort: { field: "created_at", dir: "desc" } } },
  ],
});
```

After composition:
- `PostSchemaModule.sql` and `.sqlPg` hold the derived `SqlSchemaDef`s (read by
  the SQL storage provider, e.g. `SqlBackend` / `UserRepo.overSql`).
- The class itself gained statics: `Post.table`, `Post.toRow(entity)`,
  `Post.fromRow(row)`, plus an instance `post.toRow()`.
- A model that does **not** compose `SqlSerialisable` has **none** of these
  statics — the "only present when the capacity is enabled" guarantee falls out
  of composition, exactly like `JsonSerialisable`'s `toJSON`/`fromJSON`.

---

## 3. Column strategy (schema → storage)

`planColumns` maps each reflected property to a storage kind. The decision
order (see `kindOf`):

| Reflected type | Stored as | Notes |
|---|---|---|
| `string` / `enum` / `date-time` / `date` / `uuid` | `text` | ISO dates kept as text; `uuid` stored raw (NOT JSON-quoted — a naive `oneOf` lookup would double-quote it) |
| `integer` | `integer` | |
| `number` | `real` (sqlite) / `double precision` (pg) | |
| `boolean` | `integer` 0/1 (sqlite) / `boolean` (pg) | |
| `object` / `array` (nested) | `text` **JSON-encoded** | pragmatic default; normalise into real relations in production |
| `string-literal union` (`"admin" \| "member"`) | `text` | inspected via `oneOf` — scalar union stays TEXT, not JSON |
| `id` property | `primaryKey()` | |
| nullable / optional (`field?`) | `.nullable()` | optional = not in `required` ⇒ nullable |

Critical correctness detail for unions: typia reflects branded strings (`UUID`)
and string-literal unions as a `oneOf` with **no top-level `type`**. A naive
lookup would return `undefined` and degrade to JSON — double-quoting the stored
value so `WHERE` filters never match. `kindOf` instead inspects `oneOf` members:
if **every** member is a scalar, the column takes the most general scalar kind;
only if some member is an object/array does it degrade to `"json"`. This is why
`?authorId=<uuid-prefix>` substring search works.

---

## 4. Foreign keys via the `Reference` tag

Relations are **declared in the type**, not in hand-written drizzle code. The
`Reference<…>` typia tag on a scalar id field is the single declarative source
for both the SQL FK constraint and the in-memory accessor (read by
`Referencible` from the same `x-reference` node).

```ts
// src/models/post.ts
interface PostSchema {
  authorId: UUID & Reference<"UserSchema", "id", "many-to-one", "cascade", "inner">;
}
// src/models/thread.ts
interface ThreadSchema {
  boardId: UUID & Reference<"BoardSchema", "id", "many-to-one", "cascade", "inner">;
  authorId: UUID & Reference<"UserSchema", "id", "many-to-one", "cascade", "inner", "author">;
}
```

At derive time, `buildColumns` wires `.references()` against the registered
target table:

```ts
col.references(() => resolveTableThunk(targetName, dialect)()[targetColumn], { onDelete });
```

- **Resolution is lazy** (inside drizzle's thunk), so two models can reference
  each other without a circular-import failure at module load. The target must
  have composed `SqlSerialisable` (so its table is in `tableRegistry`) before
  query-plan time — if not, `resolveTableThunk` throws with a clear message.
- Target matching is by model name: `schemaName` must equal the `Reference`
  target (`"UserSchema"` etc.), because `modelNameOf` reads
  `components.schemas.<ModelName>` from the reflected envelope.
- `cardinality` / `onDelete` mirror the `Referencible` vocabulary
  (`"many-to-one"`, `"cascade"`, …). `join`/`name` drive the in-memory accessor
  (e.g. `?author=` ⇒ `getAuthor()`), not the SQL side.

The inverse (collection) side — `user.getPosts()` — has no FK column of its own,
so it is still declared manually in `Referencible`'s `relations`, but its
`cardinality`/`onDelete` are guarded against the tag so the two cannot drift.

---

## 5. `CHECK` constraints from reflected bounds

When `check` is not `false` (the default), `planChecks` emits dialect-agnostic
`CHECK` constraints from the reflected numeric/string bounds:

| Reflected bound | `CHECK` expression |
|---|---|
| `minimum` | `"col" >= n` |
| `maximum` | `"col" <= n` |
| `exclusiveMinimum` (number) | `"col" > n` |
| `exclusiveMaximum` (number) | `"col" < n` |
| `minLength` | `length("col") >= n` |
| `maxLength` | `length("col") <= n` |
| `enum` membership | `"col" IN ('a', 'b', …)` |
| `pattern` | `"col" ~ 're'` (pg) / `"col" REGEXP 're'` (sqlite) |

These are attached to the drizzle table via `check(name, sql\`…\`)`. Set
`check: false` to skip — e.g. when typia runtime validators already enforce the
bounds and you want leaner DDL.

> **Caveat on `pattern`.** On Postgres the constraint uses the `~` regex
> operator (enforced). On SQLite the code emits `REGEXP`, but stock SQLite has
> **no built-in `REGEXP`** unless the regexp extension is loaded — so on a
> default SQLite deployment the `pattern` check is effectively best-effort (and
> may error at table-creation time rather than silently passing). Validate
> pattern constraints through typia (`Validatable`) instead of relying on the
> SQLite-side `CHECK`.

---

## 6. Dialects — `sql` (primary) and `sqlPg` (opposite)

`SqlSerialisable` derives **both** projections by default:

- `mod.sql` — the **primary** dialect (`options.dialect`), holds `table`,
  `toRow`, `fromRow` lifted onto the class.
- `mod.sqlPg` — the **opposite** dialect (sqlite ⇄ pg). The naming is literal:
  even if you compose with `dialect: "pg"`, `sql` is pg and `sqlPg` is sqlite.

Set `both: false` to derive only the primary projection (skips `sqlPg`). This is
handy for a single-dialect deploy or to shrink the bundle.

The mappers are dialect-aware in exactly two places (everything else touches
only column **name** strings, so a single `toRow`/`fromRow` works for both):
- booleans → `0/1` on sqlite, native `bool` on pg;
- dates → kept as ISO text on both.

---

## 7. The build-time path (Cloudflare-safe)

Because deriving a `Table` needs drizzle at runtime, but a Worker shouldn't run
typia at import time, there is a **build-time** sibling: `deriveSqlPlan`
produces a `SqlModelPlan` — a drizzle-free, **JSON-serialisable** description
(`kind`, `nullable`, `isId`, `reference`, `checks` per column) with **no** sql
template. The flow:

```
scripts/model-build.ts   → deriveSqlPlan(...) → src/generated/models.json
scripts/db-generate.ts   → reads the plan      → drizzle/*.sql migrations
runtime                  → reads mod.sql / mod.sqlPg (already derived at build)
```

So the runtime never needs typia, and `Queriable`/`Servable` consume the same
`deriveSqlPlan` helper, keeping the plan in lockstep with the live drizzle
derivation.

---

## 8. What it lifts onto the class

| Lifted member | Kind | Source |
|---|---|---|
| `Model.table` | static | `primaryDef.table` (primary dialect) |
| `Model.toRow(entity)` | static | `primaryDef.toRow` |
| `Model.fromRow(row)` | static | `primaryDef.fromRow` |
| `instance.toRow()` | method | `primaryDef.toRow(this)` |
| `mod.sql` / `mod.sqlPg` | schema-module slice | the two `SqlSchemaDef`s |

`toRow` emits **only** columns the table knows (so partial patches become
partial `SET`s in `Servable`), JSON-encoding objects/arrays and normalizing
booleans/dates per dialect. `fromRow` inverts. A `null` is only written when the
column is nullable; a `null` into a `NOT NULL` column is skipped (never clobbers
a default).

---

## 9. Options reference

| Option | Default | Meaning |
|---|---|---|
| `name` | **required** | table name (`"posts"`, `"users"`, …) |
| `dialect` | `"sqlite"` | primary projection; opposite derived as `sqlPg` |
| `modelName` | derived from `components.schemas` | registry key for FK lookups; usually `schemaName` |
| `check` | `true` | emit `CHECK` constraints from reflected bounds |
| `both` | `true` | also derive the opposite dialect into `sqlPg` |

---

## 10. Relationship to sibling capacities

| Capacity | Role | Depends on `SqlSerialisable`? |
|---|---|---|
| `SqlSerialisable` | **this** — derives table + mappers + FKs + checks from the reflected schema | — (foundation) |
| `JsonSerialisable` | mirrors the approach for JSON `toJSON`/`fromJSON` | no — independent neutral projection |
| `Queriable` | reads `deriveSqlPlan` to infer per-field `?param=` matchers | yes (reads its plan) |
| `Servable` | reads `deriveSqlPlan` for column kinds + PK, and `Queriable.fieldPlans` for filters | transitively yes |
| `Siftable` | reads `deriveSqlPlan` for in-memory keyset pagination | yes |
| `Referencible` | shares the `Reference` tag vocabulary (`ReferenceMeta`, `cardinality`, `onDelete`) so SQL FKs and in-memory accessors can't drift | shares the tag, separate capacity |

`SqlSerialisable` is the **root** of the SQL branch of the capacity tree: every
other SQL-aware capacity is a consumer of the plan it derives.

---

## 11. See also

- [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) — the
  JSON `toJSON`/`fromJSON` capacity (the text wire-format counterpart of this
  relational one).
- [`capacity-protobuf-encodable.md`](./capacity-protobuf-encodable.md) — the
  binary `encode`/`decode`/`message` capacity (the other wire-format sibling).
- [`capacity-queriable.md`](./capacity-queriable.md) — the matcher engine that
  reads `deriveSqlPlan` to decide each field's `?param=` mode.
- [`capacity-versionable.md`](./capacity-versionable.md) — the `updated_at`
  column this capacity derives is the entity's version pointer.
- [`capacity-hashable.md`](./capacity-hashable.md) — the `contentHash` column
  this capacity derives (a `string & Sha256`) is the content-address.
- [`capacity-servable.md`](./capacity-servable.md) — the HTTP/SQL CRUD surface
  that reads the same plan for column kinds + PK and reuses `Queriable`'s filters.
- [`data-models-storage.md`](../docs/data-models-storage.md) — the whole
  capacity model, the BBS models, storage layers, and the "query post history"
  recipe.
- `src/capacities/sql-serialisable.ts` — the bridge (`toDrizzleTable`,
  `deriveSqlPlan`) + the capacity.
- `src/tags/reference.ts` — the `Reference` typia tag shared by `SqlSerialisable`
  and `Referencible`.
- `scripts/model-build.ts`, `scripts/db-generate.ts` — the build-time plan →
  `models.json` / `drizzle/*.sql` flow.
- `src/capacities/sql-serialisable.test.ts` — verified behaviors (derives
  `mod.sql`/`mod.sqlPg`, `id` → PK, boolean → 0/1 on sqlite, `Reference` →
  `.references()`).
