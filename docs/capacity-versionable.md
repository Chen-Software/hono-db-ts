# Capacity: `Versionable`

> Every mutation produces a **new version** of the entity, identified by a
> strictly-increasing `updated_at`. The capacity owns the *rules* of
> versioning — monotonic timestamps, immutability, "the `id` never changes,
> only the version rotates" — and exposes the whole version toolkit
> (`latestOf`, `isNewerThan`, `compareVersions`, `nextUpdatedAt`,
> `versionableUpdate`, …) on the model. It is deliberately **stateless**: the
> append-only history itself lives in infrastructure, not here.

`Versionable` is the capacity `Post` (and any event-sourced entity) composes to
get append-only history semantics with zero per-model boilerplate. It is built
on top of the `Immutable` marker, and it cooperates tightly with `Hashable`
(content re-hash on every version) and `Validatable` (on-update assertion).

---

## 1. What it is / is not

**It IS**
- A set of pure helpers for reasoning about versions: total order by
  `updated_at`, "pick the newest from a history array", "compute the next
  version timestamp", "apply a patch as a new version".
- A `CapacityComposer` mixin that lifts those helpers onto the model as
  **statics** (`Post.latestOf`, `Post.compareVersions`, …) and onto each
  **instance** (`post.isNewerThan(other)`, `post.nextUpdatedAt()`), and that
  **owns the entity's `update`** so every change mints a new version.
- The owner of the construction-time default: the first version's
  `updated_at` equals `created_at` (or `now` when the model carries no
  `created_at`), so the version field is always populated the moment an
  instance exists.

**It is NOT**
- A store. It holds **no history**. The append-only log for an entity's `id`
  lives in infrastructure — referenced in-source as
  `src/services/version-history-store.ts` / a `PostRepo` with `historyOf` and
  `append`/`create` operations. **As of this writing those files are not
  present in the tree** (the repo/store layer is described in comments and
  `meterable.ts` but not yet implemented). `Versionable` is therefore
  self-contained for the rules; wiring the actual history persistence is a
  separate, outstanding task.
- A wire-format or storage capacity. It defines neither SQL columns nor a
  serialiser. `SqlSerialisable` derives the `updated_at` column from the schema
  the same way it derives any `date-time` field; `Queriable`/`Servable` then
  let you filter on `?updated_at=[...]` exactly as documented in
  [`capacity-queriable.md`](./capacity-queriable.md) — `Versionable` just gives
  that column its *meaning* (the version pointer).

---

## 2. The schema marker — `VersionableSchema`

```ts
export interface VersionableSchema extends ImmutableSchema {
  /** Version timestamp — strictly increases on every update; equals `created_at`
   *  on the first version. This field IS the version. */
  readonly updated_at: string & tags.Format<"date-time">;
}
```

- It **extends `ImmutableSchema`** (`Record<never, never>` — a pure type-level
  marker, see [`capacity-immutable.md`](./capacity-immutable.md)). So wearing
  `Versionable` *implies* the immutability contract: instances are never
  mutated in place; the version rotates by reconstructing.
- The single structural requirement is a **readonly `updated_at` (`date-time`)**.
  This timestamp *is* the version: there is no separate `version` integer. A
  newer version is simply one with a greater `updated_at`.
- No runtime behaviour lives in the marker itself — it is a no-op in an
  intersection. All behaviour is in the mixin below.

---

## 3. Stateless design: rules vs. store

The capacity's first sentence in-source is explicit: *"The capacity is
deliberately STATELESS."* The split is:

| Concern | Owned by | Where |
|---|---|---|
| Monotonic-timestamp rule | `Versionable` | `nextUpdatedAt` |
| Immutability rule (new version per change) | `Versionable` + `Immutable` | `update` override |
| "id stable, version rotates" rule | `Versionable` | `versionableUpdate` drops `updated_at`, keeps `id` |
| The append-only history (the log of versions) | **infrastructure** | `version-history-store` / `PostRepo` (not yet in tree) |
| Reconstructing a version through lifecycle hooks | base `defineModel` | `Ctor.from` |

This is the same "rules in the capacity, state in infrastructure" boundary the
`Servable` capacity keeps for CRUD, and it is what lets `Versionable` stay a
tiny, dependency-free mixin. The model carries **only its current version**;
to get the full history you hand a `history` array (from the store) to
`latestOf(history)`.

---

## 4. The version toolkit

### 4.1 Statics (pure helpers, safe to call directly)

| Helper | Signature | What it does |
|---|---|---|
| `nextUpdatedAt(data)` | `(data) => number` (epoch-ms) | Next version timestamp. Strictly `>` the existing `updated_at` (or `created_at` when no version yet), and never in the past — guards against clock skew and equal-ms collisions across isolated runtimes. |
| `latestOf(history)` | `(history: T[]) => T` | Newest version by max `updated_at`. **Throws on empty input** — callers must guard. Order-independent. |
| `isNewerThan(a, b)` | `(a, b) => boolean` | `a.updated_at > b.updated_at`. |
| `compareVersions(a, b)` | `(a, b) => -1\|0\|1` | Total order by `updated_at`. |
| `withVersionBump(updater)` | `(updater) => (entity, patch) => T` | Wraps an immutable `updater` so the result gets a strictly-later `updated_at`. This is how `Hashable.updateHash` / `Post.update` gets its version bump for free. |
| `versionableUpdate(reconstruct, idAccessor)` | `(reconstruct, idAccessor) => (entity, patch) => T` | Merges `patch` over everything **except** `id`/`updated_at` (their patch values are ignored), then delegates to `reconstruct` to mint the new version. |
| `createVersionableUpdate(reconstructor)` | `(reconstructor) => (entity, patch) => T` | Convenience = `withVersionBump(versionableUpdate(reconstructor, e => e.id))`. The default `update` path. |

### 4.2 Instance methods (reason about THIS version, or a history)

| Method | Meaning |
|---|---|
| `post.latestOf(history)` | Delegate to static `latestOf` — newest of a history array owned by the store. |
| `post.nextUpdatedAt()` | The timestamp the *next* `update` would stamp (strictly later than `this.updated_at`). |
| `post.isNewerThan(other)` | `this.updated_at > other.updated_at`. |
| `post.compareVersions(other)` | Total order by `updated_at`. |
| `post.update(patch)` | **Owned by the capacity** — see §5. |

> Note the two `latestOf` call sites look the same but differ in receiver:
> `Post.latestOf(history)` is the static (takes the array first); `post.latestOf(history)`
> is the instance delegate (same array, `this` is unused). Both exist so you can
> reason about a version from the class *or* from a concrete instance.

---

## 5. `update` — the owned immutable + versionable update

`Versionable` overrides the base model's mutable `update` (which `Object.assign`s
in place) with one that **reconstructs**:

```ts
MixedClass.prototype.update = function (this, patch) {
  const Ctor = this.constructor;
  return createVersionableUpdate((d) => Ctor.from(d))(this, patch);
};
```

Trace of `post.update({ title: "v2" })`:

1. `versionableUpdate` spreads `{ ...rest, ...patch, id }`, **deliberately
   dropping `updated_at`** so the patch can't fake a version. `rest` is the
   entity minus `id`/`updated_at`.
2. `reconstruct` = `Ctor.from(d)` runs the **unified constructor**: re-classify
   the merged candidate, run the `onUpdate` lifecycle hooks. For a `Validatable`
   model this *asserts* the patch (invalid patch throws before any object
   escapes). For a `Hashable` model (`Post`) the `onUpdate`/`onConstruct` path
   **re-derives `contentHash`** from `body` — so the hash can never drift from
   the content.
3. `withVersionBump` then stamps `next.updated_at = new Date(nextUpdatedAt(this)).toISOString()`,
   where `nextUpdatedAt` reads the **original** instance's `updated_at` — so the
   new version is strictly later than the old, regardless of what the
   reconstruction defaulted `updated_at` to.
4. The current instance is **never mutated**. You get a brand-new object sharing
   the same `id`, with a greater `updated_at`.

```ts
const v1 = Post.from(valid);
const v2 = v1.update({ title: "v2" });
v1 === v2;        // false — v1 is untouched
v1.id === v2.id;  // true  — identity preserved
v2.updated_at > v1.updated_at; // true — version rotated
```

This is why the append-only invariant holds: the store appends `v2` under the
same `id`; `v1` remains in the log. The capacity guarantees the *shape* of each
step; the store guarantees the *retention*.

---

## 6. Composition

`Post` composes it directly (no `options` bag — the signature is
`Versionable` / `(Base) => Base`):

```ts
const PostBase = defineModel<PostData>({
  schemaName: "PostData",
  schemaModule: PostSchemaModule,
  capacities: [
    Identifiable,      // uuid `id` — the stable identity across versions
    Timestamped,       // `created_at` — the first version's `updated_at`
    // … other capacities …
    Versionable,       // owns `updated_at` default + the version toolkit + `update`
    Validatable,       // on-update assertion runs inside `update`'s reconstruct
    { capacity: Hashable, options: { key: "body" } }, // re-hash on each version
    Queriable,         // `?updated_at=[...]` filters on the version field
    // …
  ],
});
```

Order matters only in that `Versionable` (and `Immutable`) must sit where the
mixin can wrap `update`. It is independent of `SqlSerialisable`,
`JsonSerialisable`, and `Servable` — those consume the *schema field*
`updated_at`, not this capacity.

---

## 7. Sibling capacities

| Capacity | Relationship to `Versionable` |
|---|---|
| [`Immutable`](./capacity-immutable.md) | `VersionableSchema extends ImmutableSchema`. Wearing `Versionable` *implies* the immutability contract; the `update` override is the concrete machinery. |
| [`Hashable`](./capacity-hashable.md) | `Post` is both. `Versionable.update` reconstructs through `Ctor.from`, whose `onUpdate` path re-derives `contentHash` — so every version is content-addressed and the hash never drifts. |
| [`Validatable`](./capacity-validatable.md) | `update`'s reconstruct runs the `onUpdate` hooks; a `Validatable` model's assert rejects an invalid patch *before* a new version escapes. |
| [`Identifiable`](./capacity-identifiable.md) | Supplies the stable `id` that `versionableUpdate` preserves across versions (only `updated_at` rotates). |
| [`Timestamped`](./capacity-timestamped.md) | Supplies `created_at`, which seeds the *first* version's `updated_at`. |
| [`Queriable`](./capacity-queriable.md) / [`Servable`](./capacity-servable.md) | These operate on the `updated_at` **column** (a `date-time` field). `Versionable` gives that column its meaning; `?updated_at=[...]` filters by version window (bare = exact day, `[min,max]` = range). |

---

## 8. Gotchas

- **`latestOf` throws on an empty history.** It is a pure selector, not a
  safe-navigation helper. Guard with `history.length > 0` before calling, or
  wrap it.
- **`updated_at` is the version — there is no separate `version` counter.** If
  you need integer versions, derive them by sorting a history array; don't add
  a field the capacity doesn't own.
- **The patch can't set `updated_at` or `id`.** `versionableUpdate` strips both
  before reconstructing, so a malicious/accidental `patch.updated_at` is
  silently ignored and the real bump wins.
- **The history store is not yet implemented.** The `*historyOf` / `append`
  operations named in `post.ts` comments and referenced from this capacity live
  in infrastructure (`src/services/version-history-store.ts`, a `PostRepo`) that
  is **absent from the current tree**. Until that lands, `Versionable` gives you
  the per-instance version toolkit and the correct `update` semantics, but
  retaining the full append-only log is on you (e.g. persist each reconstructed
  version under its `id`).
- **Clock-skew safe, not wall-clock-authoritative.** `nextUpdatedAt` guarantees
  strict monotonicity *within a runtime* (and `base + 1` when a later call would
  otherwise not advance the clock), but two isolated runtimes writing the same
  `id` could in principle produce non-deterministic ordering if their clocks
  diverge. That is a store-level concern (last-writer timestamp resolution).

---

## 9. See also

- [`capacity-immutable.md`](./capacity-immutable.md) — the marker `Versionable`
  extends; the immutability contract and the shared update vocabulary.
- [`capacity-hashable.md`](./capacity-hashable.md) — how a `Versionable` +
  `Hashable` model re-hashes content on every version.
- [`capacity-validatable.md`](./capacity-validatable.md) — the on-update
  assertion that runs inside `Versionable.update`'s reconstruct.
- [`capacity-identifiable.md`](./capacity-identifiable.md) / [`capacity-timestamped.md`](./capacity-timestamped.md) —
  the stable `id` and the `created_at` seed the versioning rests on.
- [`capacity-queriable.md`](./capacity-queriable.md) / [`capacity-servable.md`](./capacity-servable.md) —
  the `?updated_at=[...]` filter surface that reads the version field.
- `src/capacities/versionable.ts` — the toolkit + mixin (source of truth).
- `src/models/post.ts` — the worked composition (`Post` wears `Versionable` +
  `Hashable` + `Validatable`).
- `src/models/post.test.ts` — `latestOf` / `isNewerThan` / `compareVersions` /
  `nextUpdatedAt` usage (the `chain()` version-history fixture).
