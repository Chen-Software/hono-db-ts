# Capacity: `Clonable`

> A model that can produce a **deep copy** of itself — both as a static
> (`M.clone(data)`) and on an instance (`inst.clone()`). The same deep-copy
> semantics are available from either side of the model boundary, and the
> *strictness* of the copy is driven by whether `Validatable` is also declared.

`Clonable` is the capacity `User`, `Board`, `Thread`, `Reply`, and `Post` compose
to get a typia-backed deep copy. It is a small, behavioural mixin — there is no
`ClonableSchema` type marker — that consumes **only the clone slice**
(`clone` / `assertClone` / `isClone` / `validateClone`) from the model's
`SchemaModule` and exposes it as a single `clone` entry point.

---

## 1. What it is / is not

**It IS**
- A deep-copy capacity. `M.clone(data)` returns a detached, recursively-copied
  plain value object; `inst.clone()` returns a brand-new model instance built
  from a deep-copied snapshot of `this`.
- A thin facade over typia's four `clone` *variants*. It picks one variant per
  model and surfaces it under one name (`clone`), statically and per-instance.
- Cross-capacity aware: it reads the presence of `Validatable` from the
  composition `ctx` and upgrades the default variant to the *validated*
  `assertClone` so a clone of invalid data throws rather than propagating garbage.
- Typia-free at runtime. The clone function is a **pre-bound** entry in the
  `SchemaModule` (compiled by the typia transformer at model-definition time),
  exactly like `JsonSerialisable` / `ProtobufEncodable` — so the mixin just calls
  it. Cloudflare-safe.

**It is NOT**
- A schema marker. Unlike `ImmutableSchema` / `VersionableSchema` /
  `Hashable`, `Clonable` has **no type-level marker** — it adds no field, no
  `readonly`, nothing to the shape. It is purely behavioural, and a model can
  wear it or omit it with zero type-level footprint.
- A "copy constructor" / `update` path. `clone` is a *snapshot*, not a patch. For
  "copy then change", clone and then `update` (or assign through `Immutable`'s
  setter). It does not participate in versioning.
- A validator. Validation is **opt-in by defaulting**: the plain `clone` variant
  does no validation; only `assertClone` / `isClone` / `validateClone` (or the
  `Validatable`-driven default) validate. `Clonable` never owns the validation
  rules — those live in `Validatable` / the `SchemaModule`.

---

## 2. The clone variants (the slice it consumes)

| Variant | Source | Behaviour |
|---|---|---|
| `clone` | `typia.plain.createClone<T>()` | Deep copy, **no validation**. |
| `assertClone` | `typia.plain.createAssertClone<T>()` | Deep copy + **assert** — throws on invalid data. |
| `isClone` | `typia.plain.createIsClone<T>()` | Deep copy, or **`null`** if invalid. |
| `validateClone` | `typia.plain.createValidateClone<T>()` | **Non-throwing**; returns `IValidation<T>` (`{ success, data/errors }`). |

`Clonable` selects exactly one of these and binds it as `static clone`.

---

## 3. Variant selection (options + `Validatable`)

```ts
const hasValidatable = ctx?.has("Validatable") ?? false;
const variant =
  options?.["clone"] ?? (hasValidatable ? "assertClone" : "clone");
const cloneFn = schemaModule[variant] ?? schemaModule.clone;
```

Priority:

1. **Explicit `options.clone` wins** — `{ capacity: Clonable, options: { clone: "validateClone" } }`. Even overrides the `Validatable` upgrade (you can opt *out* of validation by naming `"clone"`).
2. **`Validatable` present → default `assertClone`.** So a model that also wears
   `Validatable` clones *validated by construction* — an invalid snapshot throws
   rather than silently copying garbage.
3. **Otherwise → plain `clone`** (deep copy, no validation).

> The `?? schemaModule.clone` fallback means: if you request a variant that was
> **not bound** in the `SchemaModule` (e.g. `validateClone` but only `clone` was
> exported), it silently degrades to the plain `clone`. See §9.

---

## 4. The mixin: what it attaches

```ts
return class extends (Base as any) {
  static clone = cloneFn;                 // the selected variant (data → data)

  clone() {                               // per-instance: data → NEW instance
    const cloned = (this.constructor as ClonableStatic).clone(this);
    if (variant === "validateClone") return cloned;  // raw IValidation, no rebuild
    if (cloned == null) return cloned;               // isClone → null on invalid
    return new (this.constructor as any)(cloned);    // rebuild a model instance
  }
};
```

- **`static clone(data)` → deep-copied plain data.** Returns the clone variant's
  result directly: a plain value object (`clone`/`assertClone`), `null`
  (`isClone` on invalid), or an `IValidation<T>` (`validateClone`). It does
  **not** return a model instance.
- **`instance.clone()` → a new model instance.** Runs the static clone on `this`
  to get a deep-copied data snapshot, then reconstructs `new Ctor(cloned)`. That
  reconstruction re-runs the unified constructor — so lifecycle hooks fire and,
  for an `Immutable` model, the clone is **re-frozen** (the copy is itself
  immutable). For `validateClone` the instance method returns the raw
  `IValidation` (it does not try to rebuild from the envelope); for `isClone` it
  returns `null` when the snapshot is invalid.

```ts
const u = User.from(valid);
const cp = u.clone();
cp === u;            // false — distinct instance
cp.name === "ada";   // true  — value copied
// static form returns PLAIN DATA, not an instance:
const dataCopy = User.clone(valid);   // deep plain object, not a User
```

---

## 5. The `Validatable` coupling (same idiom as Json / Comparable)

`Clonable` is one of three capacities that use the cross-capacity
`ctx.has("Validatable")` idiom to decide their *default* strictness:

| Capacity | Default-when-Validatable-present |
|---|---|
| `Clonable` | `assertClone` (clone validates) |
| `JsonSerialisable` (`fromJSON`) | `assertParse` (strict) |
| `Comparable` (`equals`) | validator-aware ("validated") mode |

Each falls back to a lenient form when `Validatable` is **not** declared. This is
the "decide whether to use them, or ignore them" split: `Clonable` reads only its
slice and adapts to `Validatable` without a hard dependency.

---

## 6. Composition

No `options` are needed for the common case — the variant auto-selects. `User`
just lists it:

```ts
const UserBase = defineModel<UserData>({
  schemaName: "UserSchema",
  schemaModule: UserSchemaModule,
  capacities: [
    Identifiable, Timestamped,
    { capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
    Clonable,          // defaults to assertClone because Validatable is present
    Comparable,
    Queriable, Servable,
    Immutable,         // LAST — clone() rebuilds via new Ctor → re-frozen
  ],
});
```

`Board`, `Thread`, `Reply`, and `Post` all compose `Clonable` the same way (Post
wears it between `ProtobufEncodable` and `Comparable`). To opt out of validation:

```ts
{ capacity: Clonable, options: { clone: "clone" } }
```

---

## 7. Sibling capacities

| Capacity | Relationship to `Clonable` |
|---|---|
| [`Validatable`](./capacity-validatable.md) | Gates the default variant via `ctx.has("Validatable")` — `assertClone` when present, plain `clone` otherwise. Opt out with `{ clone: "clone" }`. |
| [`Immutable`](./capacity-immutable.md) | `inst.clone()` rebuilds via `new Ctor`, so an `Immutable` model's clone is **re-frozen** — the copy is itself immutable. The `Immutable` constructor uses own-enumerable accessors so `clone(this)` reads the values correctly. |
| [`JsonSerialisable`](./capacity-json-serialisable.md) / [`ProtobufEncodable`](./capacity-protobuf-encodable.md) | The other two "consume a `SchemaModule` slice" capacities. `Clonable` is the *in-memory* deep copy; `Json`/`Protobuf` are the *wire-format* (de)serialisers. All three share the `ctx.has("Validatable")` defaulting idiom. |
| [`Comparable`](./capacity-validatable.md) | Shares the validate-only-when-`Validatable`-present defaulting pattern (its `equals` defaults to the validator-aware mode). |
| [`Identifiable`](./capacity-identifiable.md) | A clone preserves `id` (deep copy includes it); `inst.clone()` yields a new instance with the *same* `id` — a snapshot, not a new identity. |

---

## 8. Gotchas

- **Static vs instance clone return different *shapes*.** `M.clone(data)`
  returns a deep-copied **plain data object** (or `null` / `IValidation` for the
  `isClone` / `validateClone` variants). `inst.clone()` returns a **model
  instance**. Don't expect `M.clone(data)` to give you a `User` — it gives you a
  value record.
- **`validateClone` returns the validation envelope, not data.** Both
  `M.clone(data)` and `inst.clone()` return the raw `IValidation<T>` for this
  variant — the instance method does **not** reconstruct an instance from it.
  Check `.success` / `.data` at the call site.
- **`isClone` returns `null` on invalid** instead of throwing. If your call site
  assumes a value, guard for `null` (or use `assertClone` when you want a throw).
- **The default is *validated* when `Validatable` is present.** A clone of
  invalid data will **throw** (`assertClone`) unless you opted out with
  `{ clone: "clone" }`. This surprises people who expected a free deep copy.
- **Unbound variant silently degrades to plain `clone`.** If you request
  `validateClone` / `isClone` / `assertClone` but the `SchemaModule` only bound
  the base `clone`, `schemaModule[variant] ?? schemaModule.clone` falls back to
  the *non-validating* `clone`. Make sure the variant you ask for is actually
  exported from the module.
- **`inst.clone()` re-runs the constructor** (classify + lifecycle hooks). For a
  `Validatable` model the clone is re-validated on the way back into an instance;
  for an `Immutable` model the clone is re-frozen. It is a true snapshot *and* a
  fresh construct — never an alias of `this`.
- **Deep, not shallow — but not recursive-freeze.** The copy is recursively
  independent (mutating a nested array in the clone won't touch the original).
  `Object.freeze` is shallow, so a frozen `Immutable` clone protects its own
  props but not nested objects/arrays within them (same caveat as `Immutable`).

---

## 9. See also

- [`capacity-validatable.md`](./capacity-validatable.md) — the `ctx.has("Validatable")`
  idiom that drives `Clonable`'s default variant (and `Comparable`'s `equals`).
- [`capacity-immutable.md`](./capacity-immutable.md) — why `inst.clone()` of an
  `Immutable` model is itself frozen (rebuild via `new Ctor`).
- [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) / [`capacity-protobuf-encodable.md`](./capacity-protobuf-encodable.md) —
  the other two `SchemaModule`-slice capacities (wire-format adapters) that share
  the validate-when-`Validatable`-present defaulting pattern.
- [`capacity-identifiable.md`](./capacity-identifiable.md) — clones preserve `id`.
- `src/capacities/clonable.ts` — the variant selection + mixin (source of truth).
- `src/capacities/clonable.test.ts` — default/plain/assertClone/explicit-variant
  behaviour (deep copy, instance `toBeInstanceOf`, validation gating, `validateClone`
  → `IValidation`, `isClone` → `null`).
- `src/capacities/compose.ts` — the `ComposeContext.has(name)` mechanism `Clonable`
  uses to detect `Validatable` (and how the capacity is registered).
- `src/models/user.ts` / `post.ts` — the worked composition (auto `assertClone`
  because `Validatable` is present).
