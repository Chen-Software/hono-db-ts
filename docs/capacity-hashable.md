# Capacity: `Hashable`

> Entities that carry a content-derived **SHA-256 digest** (`contentHash`) of a
> named payload field. The capacity owns the *hash concern* — the
> `contentHash` field type, the hashing primitives, and the integrity
> validators — and the mixin **stamps** the correct hash on every instance at
> construction. Re-hashing on update is composed by the model via the
> `createContentAddressing` enabler (with an optional version bump for
> versioned entities).

`Hashable` is what makes `Post` content-addressed: equal `body` ⇒ equal
`contentHash`, and `post.verify()` proves the body hasn't been tampered with.
It is built on the `Immutable` marker — content addressing *requires*
immutability — and composes with `Versionable` for versioned + addressed
entities.

---

## 1. What it is / is not

**It IS**
- The owner of the **`contentHash` field** type: `string & Sha256` (lowercase
  64-hex). See the `Sha256` tag note in §6 for why a *custom* tag (not
  `Format<"sha256">`) is required for real validation.
- A set of pure hashing helpers: `hashContent`, `verifyContentAddress`,
  `withContentHash`, `createAssertHash`, `updateHash`, `createContentAddressing`.
- A `CapacityComposer` mixin that (a) registers `Hashable`, (b) gives the model
  the instance API `post.hash()` / `post.verify()` / `post.address()`, (c)
  exposes the primitives as statics, and (d) **stamps `contentHash` from the
  content field at construction** — overwriting any caller-supplied hash.

**It is NOT**
- A versioning capacity. `Hashable` and `Versionable` are *independent* — a
  `Hashable`-only entity is content-addressed but need not be versioned (the
  `updateFor` hook requires only `Identifiable & ImmutableSchema`).
- Aware of where the content lives semantically. It only knows a *field name*
  (`key`, default `"content"`; `"body"` for `Post`) and that it is `string`.
- A wire/SQL/storage capacity. It defines no column and no serialiser.
  `SqlSerialisable` derives the `contentHash` column like any other `string`;
  `JsonSerialisable`/`ProtobufEncodable` serialise it as a plain field.

---

## 2. The schema marker — `Hashable<K>`

```ts
export type Hashable<K extends string = "content"> = ImmutableSchema &
  { readonly [P in K]: string } & {
    /** SHA-256 content hash (lowercase 64-hex) of the content field. */
    readonly contentHash: string & Sha256;
  };
```

- Extends `ImmutableSchema` (a pure type-level marker) — wearing `Hashable`
  *implies* the immutability contract, because a mutable content field would let
  the hash silently drift from the content.
- The content field is **`readonly string`** keyed by `K`. Naming it (e.g.
  `body`) is the model's single configuration point.
- Adds `readonly contentHash: string & Sha256`. The digest IS the *address* of
  the content: equal content ⇒ equal hash (and equal address).

---

## 3. The hashing primitives (pure, safe to call directly)

| Helper | Signature | What it does |
|---|---|---|
| `hashContent(content)` | `(content: string) => string` | Canonical SHA-256 (`node:crypto`), utf8, hex lowercase 64-char. The *address* of the content. |
| `verifyContentAddress(entity, key)` | `(entity, key) => boolean` | `entity.contentHash === hashContent(entity[key])`. `false` if tampered, stale, or the field is missing. The integrity guarantee. |
| `withContentHash(payload, key)` | `(payload, key) => payload & {contentHash}` | Recomputes the hash from `key` and **overwrites** any incoming `contentHash`. The primitive behind `createAssertHash`/`updateHash`. |
| `createAssertHash(key)` | `(key) => (payload) => addressed` | Binds a field name; returns a stamping fn for construction (`from`). |
| `updateHash(key, ctor)` | `(key, {from}) => (entity, patch) => T` | Immutable update that bumps the version (via `Versionable`) **and** re-derives the hash. For `Hashable & Versionable` models. |
| `createContentAddressing(key)` | `(key) => { assertHash, updateFor, updateForVersionable }` | The one-mention enabler — see §5. |

> **`hash()` vs `address()` vs `verify()`.** `hash()` *recomputes* the digest
> from the current content (never stale, even if the entity were somehow
> mutated). `address()` returns the *stored* `contentHash`. `verify()` checks
> `stored === sha256(content)`. Use `verify()` (or `hash()`) for integrity,
> `address()` as the canonical key/identifier.

---

## 4. The mixin: what it attaches

For every adorned model the mixin adds:

- **Construction-time stamping** — in the constructor, if the content field is
  a `string`, it overwrites `contentHash` with `hashContent(content)`. Because
  the entity is immutable, the constructor is the *only* place the hash must be
  set; once stamped it can never drift. (For `Post`, `Post.random()` also stamps
  it, because typia's `createRandom` emits a non-format `contentHash` that the
  base constructor would classify before the mixin re-stamps — so the factory
  must stamp first.)
- **Instance API** (typed via `HashableInstance`, so models don't re-declare):
  - `post.hash()` → recomputed digest from `key`.
  - `post.verify()` → `verifyContentAddress(this, key)`.
  - `post.address()` → the stored `contentHash`.
- **Statics** (typed via `HashableStatic`): `hashContent`, `verifyContentAddress`,
  plus `withContentHash`, `createAssertHash`, `updateHash`, `createContentAddressing`
  hung on the class for convenience.

Registration is `Triggerable`-gated (`Base.prototype.capacities && addCapacity("Hashable")`), the same idiom as every other capacity.

---

## 5. `createContentAddressing` — the one-mention enabler

A model names its content key **once**; this returns the two wiring hooks it
needs to bind the capacity into `from` (construction) and `update` (mutation):

```ts
const CA = createContentAddressing("body"); // Post's key
// inside Post.from:  return new Post(CA.assertHash(data)); // stamp at construction
// Post.update:       return CA.updateForVersionable(Post)(this, patch);
```

| Hook | Reqs | Behaviour |
|---|---|---|
| `assertHash` | — | Stamps the correct hash from `key`; use inside `from`. |
| `updateFor(ctor)` | `Identifiable & ImmutableSchema` | Re-derives the hash on every content set, **no** version bump. The path for content-addressable-but-NOT-versioned entities. Built on `Immutable`'s `createUpdate`. |
| `updateForVersionable(ctor)` | `Identifiable & Versionable` | Re-derives the hash **and** bumps the version. For `Hashable & Versionable` (e.g. `Post`). Delegates to `updateHash`. |

This is the deliberate split: `Hashable` keeps its `updateHash` separate from
the mixin, mirroring how `Versionable` keeps `versionableUpdate` separate — so
the hash concern never entangles with the versioning concern, and the two can
be worn independently.

> **`Post` doesn't call `updateForVersionable` directly.** `Post.update` is
> owned by the `Versionable` capacity, whose reconstruct runs `Ctor.from` → the
> `Hashable` constructor re-stamps `contentHash`. So `Post` gets the re-hash for
> free through construction-time stamping; `updateForVersionable` is the
> equivalent for models that *own* their own `update` instead of inheriting
> `Versionable`'s. Both paths converge on the same stamp.

---

## 6. The `Sha256` tag — syntactic, not semantic

`contentHash` is typed `string & Sha256`, where `Sha256` is a **custom typia
tag** (`tags.TagBase`) whose `validate` is:

```ts
$input.length === 64 && /^[a-f0-9]{64}$/.test($input)
```

This catches *malformed* hashes (wrong length, uppercase, non-hex) — but it is
**syntactic only**. As `hashable.test.ts` proves explicitly, a valid-format hash
that is *not* `sha256(content)` still passes the tag validator
(`validateFormatOnly({ contentHash: EMPTY_SHA256 }).success === true` even though
`EMPTY_SHA256 !== sha256("x")`). Real content-integrity comes from
`verify()`/`verifyContentAddress`, never from the tag alone.

> **Why a custom tag instead of `Format<"sha256">`?** `tags.Format<T>` is a
> closed set; an *unknown* format string (`"sha256"`) is **silently ignored** by
> typia's transformer — `string & Format<"sha256">` compiles but the runtime
> check is a no-op that accepts `"not-a-hash!!!"`. A custom `TagBase` is the
> only way to get *real* (syntactic) validation. So `Sha256` is functionally
> ergonomic like `Format<"sha256">` would be, but actually enforced.

---

## 7. Composition

`Post` composes it with a single `options.key`:

```ts
const PostBase = defineModel<PostData>({
  schemaName: "PostData",
  schemaModule: PostSchemaModule,
  capacities: [
    Identifiable,
    Timestamped,
    Versionable,        // owns the version; Hashable re-stamps under it
    Validatable,        // on-update assertion runs inside update's reconstruct
    { capacity: Hashable, options: { key: "body" } }, // content-addressing on `body`
    // …
  ],
});
```

`key` is the *only* option (`HashableOptions<K>` — `{ key?: K }`). It is
orthogonal to `SqlSerialisable`/`JsonSerialisable`/`Servable`; those consume the
`contentHash` **column/field**, not this capacity, and there is no filter param
for it (it's a derived value, not a query key).

---

## 8. Sibling capacities

| Capacity | Relationship to `Hashable` |
|---|---|
| [`Immutable`](./capacity-immutable.md) | `Hashable extends ImmutableSchema`. Immutability is *why* content addressing works — a mutable payload could drift the hash. |
| [`Versionable`](./capacity-versionable.md) | `updateForVersionable` / `updateHash` composes the version bump with the re-hash. `Post` (both) gets re-addressing via construction-time stamping during `Versionable.update`'s reconstruct. |
| [`Identifiable`](./capacity-identifiable.md) | Supplies the `id` the update helpers preserve across re-hash. |
| [`Validatable`](./capacity-validatable.md) | `update`'s reconstruct runs the `onUpdate` assertion; an invalid patch is rejected before a new addressed version escapes. |
| [`SqlSerialisable`](./capacity-sql-serialisable.md) / [`JsonSerialisable`](./capacity-json-serialisable.md) / [`ProtobufEncodable`](./capacity-protobuf-encodable.md) | These derive the `contentHash` **column/field** from the schema; `Hashable` defines its *meaning* (the content address). `ProtobufEncodable` serialises it as a plain 64-hex string. |

---

## 9. Gotchas

- **The `Sha256` tag is syntactic only.** A format-valid hash that doesn't match
  the content passes the tag validator. Always use `verify()`/`hash()` for
  integrity; treat the tag as "looks like a hash," not "is the right hash."
- **`key` is erased at runtime.** `verifyContentAddress(entity, key)` and the
  mixin's `hash()` need the field name; it is *not* recoverable from the type.
  Always pass the same `key` you composed with (`"body"` for `Post`).
- **The constructor stamps; the patch can't fake it.** Any `contentHash` in the
  input is overwritten by `hashContent(content)` at construction — callers never
  control the stored hash. (That's the integrity guarantee.)
- **`Hashable` without `Versionable` is fine.** Use `updateFor` (no version
  bump) for content-addressed-but-not-versioned entities; reserve
  `updateForVersionable`/`Post.update` for the versioned case.
- **Random factories must stamp before classify.** typia's `createRandom`
  emits a non-format `contentHash`; a model that uses it must stamp via
  `hashContent` in its `random` generator (as `Post` does), because the base
  constructor classifies the payload *before* the `Hashable` mixin re-stamps.
- **`hash()` recomputes; `address()` reads.** Don't use `address()` where you
  mean "prove integrity" — `address()` returns whatever is stored, even if stale.

---

## 10. See also

- [`capacity-immutable.md`](./capacity-immutable.md) — the marker `Hashable`
  extends; why immutability is a prerequisite for content addressing.
- [`capacity-versionable.md`](./capacity-versionable.md) — the version bump
  that `updateHash` composes with the re-hash; `Post` wears both.
- [`capacity-identifiable.md`](./capacity-identifiable.md) / [`capacity-validatable.md`](./capacity-validatable.md) —
  the stable `id` and the on-update assertion the hash helpers preserve/run under.
- [`capacity-sql-serialisable.md`](./capacity-sql-serialisable.md) / [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) / [`capacity-protobuf-encodable.md`](./capacity-protobuf-encodable.md) —
  where the `contentHash` column/field is derived and serialised.
- `src/tags/format-string-sha256.ts` — the `Sha256` custom tag (syntactic-only
  validation; why not `Format<"sha256">`).
- `src/capacities/hashable.ts` — the helpers + mixin (source of truth).
- `src/capacities/hashable.test.ts` — verified behaviours (Sha256 format
  checks, `withContentHash`/`createAssertHash` round-trips, `updateHash`
  re-hash + version bump, `createContentAddressing`).
- `src/models/post.ts` — the worked composition (`Hashable<"body">` + `Versionable`).
- `src/models/post.test.ts` — "Post content addressing" block (constructor
  stamping, update re-hash, `verify()`, `address()`).
