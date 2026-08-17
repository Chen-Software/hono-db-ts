# Capacity: `Immutable`

> Instances are **never mutated in place**. Every change — a `patch` through
> `update`, or even a direct `inst.field = x` assignment — produces a
> brand-new frozen instance that preserves the entity's `id` while advancing
> its version. The previous instance is left untouched, which keeps entities
> event-sourced, safe for audit / time-travel, and trivially shareable without
> defensive copies.

`Immutable` is the capacity the current models — `User` and `Repository` — wear
to guarantee that identity is stable but state can only move forward by
reconstruction. It is a **type-level marker** (`ImmutableSchema`) that
`Versionable` and `Hashable` extend for their own contracts, *and* a runtime
mixin that actually `Object.freeze`s instances and rewrites every property
setter into a "return a new object" operation.

---

## 1. What it is / is not

**It IS**
- A runtime guarantee: instances are `Object.freeze`d, and every own enumerable
  property is turned into an accessor whose **setter returns a new instance**
  instead of writing through. So `inst.name = x` cannot mutate the current
  object.
- The owner of the shared immutable-update vocabulary — `createUpdate`,
  `createAssertUpdate`, `createValidateUpdate` and their `…ImmutableUpdate`
  aliases. Every generator returns `(entity, patch) => newInstance`; the entity
  is never touched in place.
- A type-level marker (`ImmutableSchema`) that expresses the "every member is
  `readonly`" contract and that `Versionable` / `Hashable` extend.
- A set of introspection helpers: the type-level `IsImmutable` / `AssertImmutable`
  and the runtime `isImmutable` / `assertImmutable` guards.

**It is NOT**
- A versioning capacity. `Immutable` only says *how* a change happens (new
  object); it does not own a version field or the append-only rules — that is
  [`Versionable`](./capacity-versionable.md), which is built on this marker.
- A wire / SQL / storage capacity. It defines no column and no serialiser.
  `SqlSerialisable` / `JsonSerialisable` / `ProtobufEncodable` derive the fields
  as usual; `Immutable` only constrains how those fields are reassigned.
- Applied to every model by default. The base `defineModel` is **mutable**;
  `Immutable` is opted into (see §7). Notably `Post` wears `Versionable` +
  `Hashable` (which extend the `ImmutableSchema` *type* marker) but does **not**
  apply the `Immutable` runtime mixin — so `Post` reconstructs on `update` but
  is **not** `Object.freeze`d at runtime.

---

## 2. The schema marker — `ImmutableSchema`

```ts
type ImmutableSchema = Record<never, never>;
```

- It is the **empty object** — a no-op in an intersection at both runtime and
  the type level. Its only job is to *read* as a deliberate contract in
  `VersionableSchema extends ImmutableSchema` and
  `Hashable<K> = ImmutableSchema & …`.
- Declared as a `type` (not an `interface`) so it stays a pure marker and does
  not trip empty-interface lint.
- The runtime behaviour (freezing + setter rewrite + `update` override) lives in
  the [`Immutable`](./capacity-immutable.md) **mixin function** below, not in the
  marker. Wearing a capacity that *extends* `ImmutableSchema` (e.g. `Versionable`)
  gives you the type-level immutability contract; the runtime freeze requires the
  mixin itself to be in the `capacities` array.

---

## 3. The runtime mixin — constructor: accessor rewrite + freeze

When `Immutable` is the (typically outermost) mixin, its constructor runs **after**
every inner capacity populated the fields, then:

1. **Rewrites every own enumerable property into an accessor.** The getter
   returns the captured value; the setter rebuilds through `new Ctor({ ...this, [k]: v })`
   and returns the new frozen instance — it never writes to `this`.
2. **`Object.freeze(this)`** so the object is observably immutable
   (`Object.isFrozen`) and no stray assignment can add or reconfigure a property.

```ts
const keys = Object.keys(this);
for (const k of keys) {
  const value = (this as any)[k];
  Object.defineProperty(this, k, {
    enumerable: true, configurable: true,
    get() { return value; },
    set(v) { const Ctor = this.constructor; return new Ctor({ ...this, [k]: v }); },
  });
}
Object.freeze(this);
```

**Why own-enumerable accessors (not prototype getters, not a WeakMap).** The rest
of the system — `JsonSerialisable`'s `instance.toJSON()` returning `this`,
`Clonable`'s `clone(this)`, content-addressing `this.body`, `{...this}` spreads,
and `typia`'s (de)serialisers — all rely on the instance being a plain-enough
object whose fields are **own + enumerable**. Inherited getters are NOT
serialised by `JSON.stringify`, so the accessors MUST live on the instance.
Capturing the value in a closure keeps the getter allocation-free and
freeze-safe.

```ts
const u = User.from(valid);
const next = (u.name = "Zoe");   // setter → new instance
u.name === "Zoe";                // false — original untouched
next.name === "Zoe";             // true  — new instance carries the value
Object.isFrozen(next);           // true
```

---

## 4. `update` — the owned immutable reconstruction

`Immutable` overrides the base model's *mutable* `update` (which `Object.assign`s
in place) with one that **reconstructs** a brand-new frozen instance:

```ts
update(patch: Record<string, unknown>): any {
  const Ctor = this.constructor as any;
  return new Ctor({ ...this, ...patch, [UPDATE_PHASE]: true });
}
```

`[UPDATE_PHASE]: true` is a marker (from `triggerable.ts`) that the base
constructor recognises: it strips the marker, classifies the merged candidate,
and runs the **`onUpdate`** lifecycle hooks (instead of `onConstruct`) — so a
`Validatable` model's assertion rejects an invalid patch *before* a new object
escapes. This is the key difference from `Versionable.update`, which mints the
new version via `Ctor.from` **without** the marker and therefore runs
`onConstruct` (see §9).

```ts
const u = User.from(valid);
const next = u.update({ name: "Zoe" });
u === next;          // false — u is untouched
u.id === next.id;    // true  — identity preserved
Object.isFrozen(next); // true
```

The base model stays mutable-by-default; `Immutable` is the ONLY thing that flips
`update` to "produce a new object" and freezes the result.

---

## 5. The shared update vocabulary (generators)

Every generator returns `(entity, patch) => newInstance`. The entity is NEVER
mutated in place — that is the entire contract. Model-specific policy (version
bump, hash re-derivation, assertion) lives inside the `reconstruct` / `assert` /
`validate` callbacks, so the primitives stay dead simple and reusable for *any*
immutable shape.

| Helper | Signature | Behaviour |
|---|---|---|
| `createUpdate(reconstruct)` | `(reconstruct) => (entity, patch) => T` | Merges `patch` over `entity` (shallow spread) and rebuilds via `reconstruct`. The base combinator every other helper is built on. |
| `createImmutableUpdate` | alias of `createUpdate` | Documenting alias (canonical "Immutable" naming). |
| `createAssertUpdate(assert)` | `(assert) => (entity, patch) => T` | Twin of `createUpdate` whose callback already *validates* (e.g. a model's `from`, which runs `typia.plain.assertClassify`) and throws on invalid input. Behaviourally identical — the name is the signal. |
| `createAssertImmutableUpdate` | alias of `createAssertUpdate` | Documenting alias. |
| `createValidateUpdate(validate, reconstruct)` | `(validate, reconstruct) => (entity, patch) => T` | Runs a `validate` callback over the merged data and only calls `reconstruct` when it passes; otherwise throws with the error paths. Use when an invalid patch must be rejected with structured diagnostics. |
| `createValidateImmutableUpdate` | alias of `createValidateUpdate` | Documenting alias. |

```ts
const rebuild = (d: UserData) => User.from(d);          // re-runs classify + hooks
const updateUser = createUpdate(rebuild);
const next = updateUser(existing, { name: "Alicia" });   // new instance, never mutates
```

---

## 6. Type-level readonly introspection + runtime guard

`readonly` is a compile-time-only modifier — there is no runtime reflection for
it (short of `Object.freeze`). So the contract that an *entity type* is fully
immutable is checked at the type level, and the practical runtime guarantee is
freezing.

**Type-level** (in `immutable.ts`):

| Helper | Meaning |
|---|---|
| `Writable<T>` | Strips `readonly` from every property (the writable view). |
| `ReadonlyKeys<T>` / `MutableKeys<T>` | The set of keys whose property is / isn't declared `readonly`. |
| `IsImmutable<T>` | `true` iff **every** property of `T` is declared `readonly`. |
| `AssertImmutable<T>` | Constraint helper: yields `T` when fully readonly, else `never` (so a non-immutable `T` fails to bind at the call site). |

**Runtime** (the analogue of `IsImmutable`):

| Helper | Behaviour |
|---|---|
| `isImmutable(value)` | `true` iff `value` is an object that has been `Object.freeze`d. Reports `false` for plain objects until frozen. |
| `assertImmutable(value)` | Throws unless `value` is a frozen object. |

```ts
isImmutable({ x: 1 });                 // false
isImmutable(Object.freeze({ x: 1 }));  // true
```

---

## 7. Composition

The BBS models apply `Immutable` as the **last (outermost)** mixin so its
constructor runs after every inner capacity populated the fields, and its
setter-rewrite / freeze wrap the finished object:

```ts
const UserBase = defineModel<UserData>({
  schemaName: "UserSchema",
  schemaModule: UserSchemaModule,
  capacities: [
    Identifiable,        // uuid `id`
    Timestamped,         // created_at / updated_at
    Validatable,         // on-update assertion runs inside Immutable.update's reconstruct
    Queriable,
    Servable,
    // … other capacities …
    Immutable,           // LAST — update() reconstructs + freezes; wrappers run last
  ],
});
```

`User` and `Repository` both follow this pattern.

---

## 8. Sibling capacities

| Capacity | Relationship to `Immutable` |
|---|---|
| [`Versionable`](./capacity-versionable.md) | `VersionableSchema extends ImmutableSchema`. Wearing `Versionable` *implies* the immutability contract; its `update` reconstructs a new version. Nuance: `Versionable.update` runs `onConstruct`, while `Immutable.update` runs `onUpdate` (see §9). |
| [`Hashable`](./capacity-hashable.md) | `Hashable<K> = ImmutableSchema & …`. Content addressing *requires* immutability — a mutable payload could let `contentHash` silently drift from the content. |
| [`Identifiable`](./capacity-identifiable.md) | Supplies the stable `id` that every reconstructed instance preserves across a change (only the version/content rotates). |
| [`Validatable`](./capacity-validatable.md) | The `onUpdate` assertion runs inside `Immutable.update`'s reconstruct (`UPDATE_PHASE`); an invalid patch is rejected before a new object escapes. `Immutable` + `Validatable` cooperate (see `immutable-validatable.test.ts`). |
| [`JsonSerialisable`](./capacity-json-serialisable.md) / [`Clonable`](./capacity-clonable.md) | Rely on own-enumerable accessors for serialisation / `clone(this)`; the `Immutable` constructor deliberately uses instance-level (not prototype) getters so these keep working. |
| `Triggerable` (`src/capacities/triggerable.ts`, [doc](./capacity-triggerable.md)) | The `UPDATE_PHASE` marker `Immutable.update` smuggles through originates in `triggerable.ts`; `Triggerable`'s registration gate is the same idiom used for capacity registration. |

---

## 9. Gotchas

- **A model can be reconstruction-only without the freeze.** A model that wears
  `Versionable` + `Hashable` (which extend the type-only `ImmutableSchema`) but
  omits the `Immutable` *mixin* reconstructs on `update` without being
  `Object.freeze`d at runtime, and a direct field assignment would attempt an
  in-place write. Put `Immutable` in the model's `capacities` if you need the
  runtime guarantee.
- **`Immutable.update` fires `onUpdate`; `Versionable.update` fires
  `onConstruct`.** `Immutable.update` passes the `UPDATE_PHASE` marker, which the
  base constructor reads as "this is a reconstruction → run `onUpdate` hooks".
  `Versionable.update` delegates to `Ctor.from(...)` *without* the marker, so the
  constructor treats it as a fresh construct and runs `onConstruct` (`onNew`)
  hooks instead. Consequence: for a `Versionable` model, `onUpdate` is **not**
  invoked on `update` — only `onNew` validation runs. For a plain `Immutable`
  model (no `Versionable`), `onUpdate` **does** fire.
- **Direct property assignment runs `onConstruct`, not `onUpdate`.** The setter
  rewrite does `new Ctor({ ...this, [k]: v })` with no `UPDATE_PHASE` marker, so
  the base constructor classifies and runs the `onNew`/construct hooks. For a
  `Validatable` model that means a direct assignment still re-validates — but via
  the construct path, not the update path.
- **Freeze is shallow on nested objects.** `Object.freeze` freezes the instance
  itself; nested objects/arrays inside a field are not recursively frozen. A
  field holding a mutable nested object can still have its contents changed —
  the guarantee is "you cannot reassign or reconfigure `this`'s own props,"
  not "the whole graph is deep-frozen."
- **`isImmutable` is opt-in.** For non-`Immutable` objects it reports `false`
  until something explicitly `Object.freeze`s them. Use it as a guard, not a
  universal detector of "should not be mutated."
- **Aliases are documenting-only.** `createImmutableUpdate`,
  `createAssertImmutableUpdate`, `createValidateImmutableUpdate` are exact aliases
  of their non-`Immutable` twins. They exist to make the immutability contract
  read at the call site; they add no behaviour.
- **Identity survives reconstruction.** `update`/`patch` preserve `id` and every
  unchanged field; only the patched field differs on the new instance. Don't read
  the *reference* of the old instance after a change — always capture the return
  value: `const next = entity.update(patch)`.

---

## 10. See also

- [`capacity-versionable.md`](./capacity-versionable.md) — the capacity built on
  this marker; `update` reconstructs a new version.
- [`capacity-hashable.md`](./capacity-hashable.md) — why content addressing
  requires immutability; `Hashable extends ImmutableSchema`.
- [`capacity-validatable.md`](./capacity-validatable.md) — the `onUpdate` /
  `onNew` assertion that runs inside `Immutable.update`'s reconstruct (and the
  `UPDATE_PHASE`/`onConstruct` nuance).
- [`capacity-identifiable.md`](./capacity-identifiable.md) — the stable `id`
  preserved across every reconstruction.
- `src/capacities/immutable.ts` — the marker, mixin, generators, and introspection
  helpers (source of truth).
- `src/capacities/immutable.test.ts` — `createUpdate` / `createAssertUpdate` /
  `createValidateUpdate`, `IsImmutable`, `isImmutable` / `assertImmutable`.
- `src/capacities/immutable-setter.test.ts` — setter-rewrite-to-new-object,
  JSON serialisation through own-enumerable getters.
- `src/capacities/immutable-validatable.test.ts` — `Immutable` + `Validatable`
  cooperation (valid update → new frozen object; invalid update → no object).
- `src/models/base.ts` — the `UPDATE_PHASE` handling in the base constructor
  (reconstruction vs. fresh construct → `onUpdate` vs `onConstruct`).
- `src/models/user.ts` / `src/models/repository.ts` — the current models
  that apply `Immutable` as the outermost mixin.
