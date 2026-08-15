# Referencible

`Referencible` generates **in-memory foreign-key accessors** (`getX()`) on a
model, resolving related instances through the unified **identity map**. The
FK-owning side of a relation falls out of a `Reference<>` tag automatically; the
inverse (collection) side is **now also auto-derived** from the *source* model's
`Reference` tag by `wireInverseRelations()` (run from `defineModel`), so
`Post.authorId -> UserSchema` yields `user.getPosts()`, `Thread.authorId ->
UserSchema` yields `user.getThreads()`, and `Reply.authorId -> UserSchema` yields
`user.getReplies()`. A manual inverse spec in `options.relations` is still allowed
and takes precedence when present.

It is the in-memory half of the relation story. The *same* `Reference` tag also
drives the SQL foreign key (via `SqlSerialisable`) — so the accessor and the DB
constraint cannot drift. But `Referencible` itself is an identity-map
navigation, not a database query.

## 1. What it is — and isn't

| | |
|---|---|
| **Is** | A capacity that adds `getX()` accessors resolving related instances through the identity map. Owner side derived from the `Reference` tag; inverse (collection) side auto-derived from the *source* model's `Reference` tag via `wireInverseRelations()` (run from `defineModel`), with manual `options.relations` still allowed and taking precedence. |
| **Is not** | A SQL mechanism. Deleting DB rows is `SqlSerialisable`'s `cascadeDelete`; `Referencible`'s `onDelete` is an *in-memory* action (see §9). |
| | A query engine. `post.getUser()` only sees what is **already registered** in the identity map — not what exists in the DB. |
| | Registered in `compose.ts`'s `REGISTRY`. It isn't (see §6) — use the **array form** only. |

## 2. The marker: the `Reference` tag (not a capacity marker)

`Referencible` has **no schema marker** of its own. The relation is declared by
the **`Reference` typia tag** (`src/tags/reference.ts`) on the FK scalar field:

```ts
interface PostSchema {
  authorId: UUID & Reference<"UserSchema", "id", "many-to-one", "cascade", "inner">;
}
```

The tag is the **single source of truth** shared by `Referencible` (in-memory
accessor) and `SqlSerialisable` (SQL FK). There is no `ReferencibleSchema` type.

## 3. The mixin — what it adds at runtime

```ts
function Referencible<TBase>(
  Base: TBase,
  mod?: any,                                   // used only to read Reference tags
  options: ReferencibleOptions = { relations: [] },
): TBase
```

- **In-place mutation.** It mutates `Base.prototype` (adds `getX` accessors) and
  registers lifecycle hooks, then **returns the same `Base`** — like
  `ProtobufEncodable`, *unlike* the new-subclass capacities (`JsonSerialisable`,
  `Immutable`, `Triggerable`, `Clonable`, `Comparable`, `Randomisable`).
- Adds per relation a **`getX()` accessor** on the prototype
  (`enumerable: false`, `configurable: true`) — so it survives on frozen
  `Immutable` instances and is ignored by `{...this}` / `clone` / `JSON`.
- Registers an **`onConstruct` hook** → every constructed instance is registered
  into its identity map as `(modelName, id)`.
- Registers an **`onDelete` hook** (for any inverse spec — manual via
  `options.relations`, or auto-derived from a `Reference` tag — whose
  `onDelete !== "noAction"`) → `restrict` / `cascade` / `setNull`, mirrored from
  the tag's `onDelete` for the auto-derived case.
- **Auto-wires inverse (collection) accessors** from the *source* model's tags.
  `defineModel` calls the exported `wireInverseRelations()` (idempotent) after
  every `registerModel`, so each model's `Reference`-tagged FK installs a
  collection getter on its TARGET prototype (`user.getPosts()` from
  `Post.authorId`, `user.getBoards()` from `Board.moderatorId`). The pass
  converges as models load regardless of import order (installed only once both
  source + target are registered); an existing getter wins, so a manual inverse
  in `options.relations` is preserved. `onDelete` is mirrored from the tag.
- Adds a `__deregister(inst)` helper for the delete path to drop the instance
  from the map.
- Registration-gated via `addCapacity("Referencible")` (silent no-op if the
  `capacities` Set is absent — so it must compose after `Triggerable`).

## 4. The `Reference` tag vocabulary

```ts
Reference<Target extends string, Column="id", Card, Action="noAction", Join="left", Name?>
```

| Param | Meaning |
|---|---|
| `Target` | Target **model name** (`"UserSchema"`). Resolved lazily via the registry / tag, so circular imports are fine. |
| `Column` | Referenced column on the target (default `"id"`). |
| `Card` | `RelationCardinality` (`one-to-one` / `one-to-many` / `many-to-one` / `many-to-many`). |
| `Action` | `onDelete` referential action (`cascade` / `setNull` / `restrict` / `noAction`). |
| `Join` | Owner-side join mode (`inner` / `left` / `right` / `full`). |
| `Name` | Optional explicit accessor name (without `get`); derived from `Target` if absent. |

The manual `RelationSpec` (inverse side) carries the same vocabulary, plus:

> **Inverse is now auto-derived.** You rarely need a manual inverse spec anymore:
> `wireInverseRelations()` derives `user.getPosts()` / `user.getThreads()` /
> `user.getReplies()` / `user.getBoards()` from the source models' `Reference`
> tags automatically, mirroring each tag's `onDelete`. Write a manual spec only to
> *override* the derived name / join / `onDelete`, or for relations with no tag (e.g.
> a function predicate). A manual spec on the target prototype wins over the
> auto-derived getter (the wire pass skips any getter that already exists).

- **`by`** — FK field name (`string`), or a full `(owner, target) => boolean`
  predicate for composite keys / many-to-many. The string form desugars to
  `(owner, target) => owner[fk] === target.id`, where `owner` is *always* the
  FK-holding entity. The direction is auto-flipped for the inverse (collection)
  side, so `post.getUser()` and `user.getPosts()` use the **same** predicate.
- **`cardinality`** — `"auto"` (default) resolves to `many-to-one`; any
  collection side MUST state `one-to-many` / `many-to-many` explicitly (the
  inverse has no FK column of its own to guess from).
- **`join`** — `inner` throws if no match; `left` (default) returns `undefined`
  / `[]`. `right` / `full` are reserved and behave like `left` at the accessor
  level.
- **`through`** — junction model name for `many-to-many`. **Not wired yet**
  (see §9).
- **`onDelete`** — the in-memory referential action when *this* entity is
  deleted; `fk` names the column to null for `setNull` when `by` is a function.

## 5. How accessors resolve: the identity map + scoping

`post.getUser()` resolves through `getInstanceMap(inst)` →
`inst[IDENTITY_MAP] ?? defaultIdentityMap`, then scans the target store for
`matching`. Consequences:

- **Standalone instances** (no repository) resolve through the process-wide
  `defaultIdentityMap` → FK navigation is process-global.
- **Repository-managed instances** are stamped with their own `IdentityMap`
  (via `setInstanceMap`), so navigation is **scoped to that repository / session**
  — a "unit of work" in which `post.getUser()` only sees instances in that
  scope.
- The accessor returns the **same registered instance** (reference equality),
  not a copy.
- A `hasModel(targetName)` gate throws `"unknown model"` (typo / never-imported
  target) **before** the inner-join message, so the cause is obvious.

## 6. Composition & registration

> ⚠️ **`Referencible` is NOT in `compose.ts`'s `REGISTRY`** (`compose.ts:188-208`
> lists every other capacity; `Referencible` is absent). It *is* in the
> `CapacityT` type union (`compose.ts:137`) for array-form typing.

Consequences:

- **Use the array form only** — `{ capacity: Referencible, options: {...} }` or
  `[Referencible]` (which defaults to `relations: []`). The object form
  `{ Referencible: {...} }` throws `"unknown capacity"`. This is likely
  intentional (a bare `{ Referencible: true }` would have no `relations`), but
  the asymmetry is worth knowing.
- **In-place mutation** (returns `Base`), so it composes by mutating — like
  `ProtobufEncodable`.
- **Hook consumer.** It calls `addLifecycleHook(Base, "onConstruct" | "onDelete", …)`
  (from `Triggerable`) — exactly the lifecycle seam `Persistable` uses. So
  `Referencible` is a *consumer* of `Triggerable`'s hooks, not a provider.

## 7. Type-level vs runtime

- The accessors are generated at runtime with **relation-specific names**
  (`getUser`, `getPosts`, `getThreads`, …) that TypeScript cannot know.
  `Referencible` is **not** in the `CapacityInstance` type-fold (only capacities
  with a fixed API surface are), and the BBS models do **not** `declare` the
  accessors. So `user.getPosts()` is **runtime-valid but invisible to `tsc`**
  unless you add `declare getPosts(): Post[]` yourself.
- The typed surface you provide at compose time is `ReferencibleOptions` /
  `RelationSpec`.

## 8. Sibling capacities

| Capacity | Relationship |
|---|---|
| [`SqlSerialisable`](./capacity-sql-serialisable.md) | Shares the `Reference` tag vocabulary (`ReferenceMeta`, `cardinality`, `onDelete`) — the SQL FK and the in-memory accessor read the **same** tag, so they can't drift. |
| [`Identifiable`](./capacity-identifiable.md) | FK targets default to `id`; `Identifiable` is what makes relations resolvable (a real `uuid` to match on). |
| [`Triggerable`](./capacity-triggerable.md) | `Referencible` consumes the synchronous `onConstruct` / `onDelete` **hooks** (via `addLifecycleHook`) — a hook, not an event, so cascade runs before commit. |
| [`Immutable`](./capacity-immutable.md) | Accessors live on the prototype (non-enumerable), so they survive freezing and are skipped by `{...this}`. |
| [`Clonable`](./capacity-clonable.md) / [`JsonSerialisable`](./capacity-json-serialisable.md) | Accessors are non-enumerable → ignored by `clone` / `toJSON` (cloning a `Post` does not clone its `User`). |
| `SchemaModule` / `IdentityMap` | `Referencible` reads only `mod.schema` (the reflected tags); resolution is backed by `src/storage/identity-map.ts`. |

## 9. Gotchas / gaps

1. **Array form only.** No `REGISTRY` entry → `{ Referencible: {...} }` throws.
2. **Accessors are untyped at compile time** (not in the `CapacityInstance` fold;
   no `declare`). Strict `tsc` won't see `getPosts()`.
3. **In-memory navigation, not a query.** `post.getUser()` only sees what is
   *registered* in the identity map. If the related instance was never
   constructed/registered (or lives in another repository's map), the accessor
   returns `undefined` / `[]` (`left`) or throws (`inner`) — **even if the row
   exists in the DB**. This is the #1 surprise.
4. **`many-to-many` `through` is not wired.** The option is documented but the
   junction-table scan is a follow-up; only the predicate form (array
   membership) supports m2m today.
5. **`onDelete` is executed in memory (no longer dormant).** `Referencible`
   registers `onDelete` hooks for *any* inverse spec — manual
   (`options.relations`) **and** auto-derived from a `Reference` tag — mirroring
   `restrict` / `cascade` / `setNull` from the tag/spec. `User` ends up with 4
   `onDelete` hooks (3 `cascade` from Post/Thread/Reply, 1 `setNull` from Board),
   correctly mirroring each tag. These hooks are now **fired** by the instance
   `delete()` method that `ModelBase` injects:
   - `ModelBase.delete()` runs `onDelete` lifecycle hooks, then deregisters the
     instance from its identity map. Idempotency is enforced by a module-level
     `WeakSet` (frozen `Immutable` instances cannot hold a `__deleted` flag).
   - `cascade` → `(child as any).delete()` (now real, because every model has
     `delete()`).
   - `setNull` → `nullChildFk(child, fk)`: for a **mutable** child it assigns
     `child[fk] = null`; for a **frozen** (`Immutable`) child it reconstructs via
     `child.update({ [fk]: null })` and overwrites the identity-map entry, so
     identity-map navigation stays consistent without mutating a frozen object.
   - `restrict` → throws (`ReferentialIntegrityError`) if children exist.
   **Prerequisite for `setNull` to be coherent:** the FK column must actually be
   nullable, otherwise the schema forbids nulling it. `Board.moderatorId` was
   therefore made `moderatorId?: UUID & Reference<…,"setNull","left"> | null`
   (optional + nullable); its owner accessor uses a `left` join so a board with no
   moderator yields `undefined`. Verified by `src/models/bbs.test.ts`
   ("In-memory delete() fires onDelete (cascade / setNull)"): `user.delete()`
   cascades Post/Thread/Reply out of the map, setNulls Boards (reconstructs a
   frozen Board with a null FK, still in the map, removed from `user.getBoards()`),
   and `delete()` is idempotent (safe to call twice). `SqlSerialisable`'s
   `cascadeDelete` (DB rows) is independent and unaffected. The drift guard checks
   the two agree for manual specs; the auto-derived case carries its tag's
   `onDelete` directly, so there is nothing to drift.
6. **Drift guards throw at compose time** (module load) if a manual spec
   disagrees with its tag — but only when the complement model is registered;
   import order can hide a mismatch (best-effort, no throw if the complement is
   absent).
7. **`right` / `full` join modes are reserved** and behave like `left` at the
   accessor level.

## 10. See also

- [`capacity-sql-serialisable.md`](./capacity-sql-serialisable.md) — the SQL half of the same `Reference` tag.
- [`capacity-identifiable.md`](./capacity-identifiable.md) — `id` as the FK target.
- [`capacity-triggerable.md`](./capacity-triggerable.md) — the `onConstruct` / `onDelete` hook seam `Referencible` consumes.
- [`capacity-immutable.md`](./capacity-immutable.md) — accessors on frozen instances.
- [`capacity-clonable.md`](./capacity-clonable.md) / [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) — accessors ignored by clone / serialise.
- [`capacity-schema-module.md`](./capacity-schema-module.md) — `Referencible` reads only `mod.schema`.
- [`capacity-introduction.md`](./capacity-introduction.md) — catalog entry.
