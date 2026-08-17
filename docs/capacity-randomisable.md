# Randomisable

`Randomisable` adds `static random()` to a model — a factory that materialises a
**random, schema-valid instance** by drawing typia's `createRandom` payload and
piping it through `new Ctor(...)`. Unlike `Clonable`'s `clone` (which copies
existing data) or `Comparable`'s predicates, `Randomisable` *generates* fresh
data.

> ⚠️ **The source docstring advertises more than the code implements.**
> `randomisable.ts` is documented to also expose `randomSeed()` and to honour a
> `seedField` option for reproducible seeds. **Neither exists in the
> implementation** — the function signature is `(Base)` only, and the class body
> adds a single `static random`. This doc describes the *actual* behaviour and
> flags the missing pieces in §7.

## 1. What it is — and isn't

| | |
|---|---|
| **Is** | A capacity adding `static random()` that returns a random, schema-valid **instance** (`new Ctor(schemaModule.random())`). |
| **Is not** | `randomSeed()` — documented in source, **not implemented**. |
| | A seeded / reproducible generator — typia `createRandom` is not seedable; `random()` is non-deterministic. |
| | An option-aware capacity — the signature takes no `options`, so `RandomisableOptions.seedField` is **unread**. |

## 2. The capacity marker (`RandomisableSchema`)

Unlike `Comparable`, `Randomisable` **does** have a type marker:

```ts
type RandomisableSchema = Record<never, never>;   // pure marker, like ImmutableSchema
```

It's `implements RandomisableSchema` on the generated subclass and exists for
intersection typing (`Foo = … & RandomisableSchema`) and symmetry with the other
marker capacities. Because the capacity's surface is purely **static**
(`Model.random()`), the marker carries no instance members.

## 3. The mixin — `Model.random()`

```ts
function Randomisable<TBase extends CapacityComposer>(Base: TBase): TBase {
  Base.prototype.capacities && Base.prototype.addCapacity("Randomisable");
  const RandomisableClass = class RandomisableClass extends Base implements RandomisableSchema {
    static random = function (this: any) {
      const Ctor = (this as any) ?? RandomisableClass;
      const data = Ctor.prototype.schemaModule.random();
      return new Ctor(data);
    };
  };
  return RandomisableClass;
}
```

Key points:

- **Signature is `(Base)` only** — no `schemaModule`, `options`, or `ctx`
  parameters. It reads `Ctor.prototype.schemaModule.random` at *call time* (paved
  by the auto-prepended `Triggerable`).
- **Returns a new subclass** (`class extends Base implements RandomisableSchema`)
  — same new-subclass style as `JsonSerialisable` / `Immutable` / `Triggerable`,
  not an in-place mutation.
- **Adds exactly one static:** `random`. No `randomSeed`.

### API

| Surface | Signature | Notes |
|---|---|---|
| `M.random()` | `() => InstanceType<M>` | Draws `schemaModule.random()`, constructs via `new Ctor`, returns the **instance**. |

(Per the source docstring, `M.randomSeed()` is *intended* to exist — it does
**not**.)

## 4. How `random()` builds the instance

`random()` is deliberately a thin wrapper that routes through the **fully
composed** constructor, so every construction-time capacity applies to the random
payload:

1. `Ctor.prototype.schemaModule.random()` — typia's `createRandom` payload (raw
   data).
2. `new Ctor(data)` — constructed via **`this`** (the final composed class), *not*
   the `RandomisableClass` closure. `Randomisable` is composed *before* e.g.
   `Immutable`, so the closure class would not wear the outer capacities;
   `new this(...)` ensures `Validatable` (assert), `Immutable` (freeze → the
   returned instance is **already frozen**), `Versionable`, `Identifiable` (uuid
   if absent), etc. all run.
3. Callers that need the raw mutable shape unwrap with `.toValueObject()` (or
   `Clonable`'s `M.clone` / `inst.clone`).

### Determinism caveat

typia's `createRandom` is **not seedable**, so `random()`'s payload is **never
reproducible** — two calls diverge. If you need determinism, bind a seeded
generator in your `SchemaModule` (`random: () => seededFoo(seed)`); `random()`
will then consume it, because the seam is `mod.random`. `Randomisable` itself
offers no seed plumbing (and `RandomisableOptions.seedField` is unread).

## 5. Type-level vs runtime

- **Runtime:** `static random` is typed via the class body (not an interface
  intersection). `Model.random()` returns the composed instance type.
- There is **no `RandomisableStatic` interface** — the marker (`RandomisableSchema`)
  is the only type artifact. `compose.ts` maps `typeof Randomisable` in its
  `CapacityT` union; the surface is the single static.

## 6. Composition & registration

- Registered in the `REGISTRY` as `["Randomisable", Randomisable]`
  (`compose.ts:202`) and in the `CapacityT` union (`:134`).
- **Not** auto-prepended — only `Triggerable` is. Wherever you place it in the
  capacity array, it folds left-to-right.
- New-subclass style; registration-gated via the prototype `capacities` Set.
- Worn pervasively across the current models: `User` (`src/models/user.ts`),
  `Repository` (`src/models/repository.ts`). Primary consumer call sites:
  `Repository.random()` / `User.random()` in `queriable.test.ts`, and `db:seed`
  in `cli/main.ts`.

## 7. Sibling capacities

| Capacity | Relationship |
|---|---|
| [`Validatable`](./capacity-validatable.md) | `random()` routes through `new Ctor` → `assert` / `onNew` apply, so the random instance is schema-valid (or throws). |
| [`Immutable`](./capacity-immutable.md) | If worn, the returned instance is **already frozen** (documented claim that *is* accurate). |
| [`Identifiable`](./capacity-identifiable.md) | `random()` routes through the `Identifiable` constructor → a real `uuid` is assigned when the payload omits `id`. |
| [`Clonable`](./capacity-clonable.md) | Clone a random instance (`M.clone(inst)` / `inst.clone()`) to get an independent copy. |
| [`JsonSerialisable`](./capacity-json-serialisable.md) | `.toValueObject()` / `toJSON()` to unwrap the random instance to data. |
| [`Triggerable`](./capacity-triggerable.md) | Paves `schemaModule` (with the `random` slice) onto the prototype so `random()` can read it. |
| [`SchemaModule`](./capacity-schema-module.md) | Owns the `random` (typia `createRandom`) slice that `random()` consumes. |

## 8. Gotchas / gaps

1. **⚠️ Under-implemented vs its own docstring.** `randomSeed()` and the
   `seedField` option are described in `randomisable.ts` but **missing from the
   code**. Do not call `Model.randomSeed()` (it's undefined), and do not pass
   `options: { seedField }` (silently ignored). This is a code gap, not a usage
   error on your side.
2. **No dedicated test file.** `randomisable.ts` has no `*.test.ts`; its
   behaviour is only exercised *indirectly* (`Post.random()` / `User.random()` in
   `queriable.test.ts`; `db:seed` in `cli`). A focused test (returns an instance;
   is frozen when `Immutable`; throws when `Validatable` rejects the random
   payload) would close this gap.
3. **Non-deterministic.** `createRandom` is unseeded; sequences are not
   reproducible.
4. **Format-bound fields can break `random()`.** `post.ts` notes `contentHash`
   (`Format<"sha256">`) emitted by typia's `createRandom` may be format-invalid,
   so `Post.random()` can throw during `classify` / assert unless the
   `SchemaModule` overrides `random` to emit valid formats. The seeder generator
   is the right place to fix this.
5. **`random()` returns an instance, not data.** To get a plain object, unwrap
   (`toValueObject()` / `Clonable`), or override `schemaModule.random` to return
   your own shape.

## 9. See also

- [`capacity-validatable.md`](./capacity-validatable.md) — why `random()` yields valid (or throws).
- [`capacity-immutable.md`](./capacity-immutable.md) — frozen random instances.
- [`capacity-identifiable.md`](./capacity-identifiable.md) — uuid assignment on random.
- [`capacity-clonable.md`](./capacity-clonable.md) — copying a random instance.
- [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) — unwrapping to data.
- [`capacity-triggerable.md`](./capacity-triggerable.md) — `schemaModule` paving.
- [`capacity-schema-module.md`](./capacity-schema-module.md) — the `random` slice.
- [`capacity-introduction.md`](./capacity-introduction.md) — catalog entry.
- [`cli.md`](./cli.md) — `db:seed` consumes `Randomisable.random()`.
