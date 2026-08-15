# Comparable

`Comparable` makes a model *orderable* — it surfaces the typia `compare` family
(`equals` / `less` / `more`) as first-class methods, both **statically**
(`M.equals(x, y)`) and on **instances** (`inst.equals(other)`), so the same
equality/ordering semantics are available from either side of the model
boundary.

It is one of the "slice-only" capacities: it reads exactly one slice
(`equals` / `less` / `more`) from the model's `SchemaModule` and touches nothing
else.

## 1. What it is — and isn't

| | |
|---|---|
| **Is** | A behavioural mixin exposing structural `equals` / `less` / `more`, statically and per-instance, pulled from `schemaModule.equals` / `.less` / `.more`. |
| **Is not** | A sort routine. It gives you the three predicates; ordering a collection (e.g. in `Queriable` / `Siftable`) is a separate concern. |
| | Validator-aware **by default** — when `Validatable` is also declared, an invalid operand makes the comparison `false`. |
| | A marker capacity. There is **no** `ComparableSchema` type (unlike `Immutable` / `Versionable` / `Hashable` / `Randomisable`). |

## 2. The capacity marker (none)

`Comparable` has **no** type marker. It is purely behavioural, exactly like
`Clonable`. The type-fold in `compose.ts`
(`C extends typeof Comparable ? ComparableStatic & ComparableInstance`) is what
surfaces `.equals` / `.less` / `.more` with proper types — no `ComparableSchema`
intersection is needed. A model can wear or drop `Comparable` with zero
type-level footprint.

## 3. The mixin

```ts
function Comparable<TBase extends CapacityComposer>(
  Base: TBase,
  schemaModule: SchemaModule<any>,
  options?: CapacityOptions,
  ctx?: ComposeContext,
): TBase & ComparableStatic & ComparableInstance
```

- **Options:** `ComparableOptions = { validated?: boolean }`. Default is *auto*.
- Reads `equals` / `less` / `more` from `schemaModule` (bound from
  `typia.compare.createEquals` / `createLess` / `createMore`).
- **Returns a new subclass** (`class extends Base`) — like `JsonSerialisable` /
  `Immutable` / `Triggerable`, *not* the in-place mutation of `ProtobufEncodable`.
- Registers itself via `Base.prototype.addCapacity("Comparable")`
  (registration-gated, like every capacity).

### API

| Surface | Signature | Notes |
|---|---|---|
| `M.equals(x, y)` | `(x, y) => boolean` | Structural deep-equality. |
| `M.less(x, y)` | `(x, y) => boolean` | Strict-less, type-directed lexicographic (typia). |
| `M.more(x, y)` | `(x, y) => boolean` | Strict-greater = inverse of `less`. |
| `inst.equals(other)` | `=> boolean` | Delegates to `M.equals(this, other)`. |
| `inst.less(other)` | `=> boolean` | Delegates to `M.less(this, other)`. |
| `inst.more(other)` | `=> boolean` | Delegates to `M.more(this, other)`. |

The instance methods route through `this.constructor`, so there is a **single
source of truth** in the statics — the validator gate and slice binding are
defined once.

## 4. The validator gate (`ctx.has("Validatable")`)

The mode is decided at compose time (`comparable.ts:65-68`):

```ts
const hasValidatable = ctx?.has("Validatable") ?? false;
const wantValidate    = (options?.["validated"] as boolean | undefined) ?? true;
const validated       = wantValidate && hasValidatable;
const guard           = (x: any) => !validated || schemaModule.is(x);

static equals = (x, y) => guard(x) && guard(y) ? schemaModule.equals(x, y) : false;
// … same guard for less / more
```

So three cases:

| `Validatable` present? | `options.validated` | Effective mode | Invalid operand → |
|---|---|---|---|
| no | (any) | structural | compared anyway |
| yes | unset | **validated** | `false` |
| yes | `false` | structural | compared anyway |

Validated mode means *both* operands are run through `schemaModule.is`; a single
malformed operand makes the whole comparison `false` — even `equals` of two
structurally-identical-but-invalid objects returns `false`. This is deliberate:
you cannot meaningfully compare malformed data. `comparable.test.ts` pins this
down (invalid `n: "x"` operands make `equals` / `less` / `more` all `false`).

### Gotcha: `{ validated: true }` is not a force switch

`validated = (options.validated ?? true) && hasValidatable`. Passing
`{ validated: true }` **without** `Validatable` yields `true && false === false`
— it silently degrades to structural. To get validation you must *also* declare
`Validatable`; the option alone does not enable it.

## 5. Type-level vs runtime

- **Runtime:** the statics/instance methods live on the composed subclass;
  behaviour is the guarded typia calls above.
- **Type:** `ComparableStatic` / `ComparableInstance` interfaces (in
  `comparable.ts`) describe the surface; `compose.ts` folds them onto the model
  type when `Comparable` is in the capacity list, so `.equals` etc. are typed
  without a manual `declare`. No `ComparableSchema` exists — the marker is
  intentionally absent.

## 6. Composition & registration

- Registered in the `REGISTRY` as `["Comparable", Comparable]`
  (`compose.ts:195`) and in the `CapacityT` type union (`:127`).
- **Not** auto-prepended — only `Triggerable` is. `Comparable` folds
  left-to-right wherever you place it in the capacity array.
- New-subclass style; registration-gated through the prototype `capacities` Set.
- It pulls its slice from `Base.prototype.schemaModule`, which `Triggerable`
  (always prepended) paves — so `Comparable` always has its `equals` / `less` /
  `more` available even though it's declared after `Triggerable`.
- Worn by `User`, `Board`, `Thread`, `Reply`, and `Post`
  (`user.ts:162`, `board.ts:120`, `thread.ts:112`, `reply.ts:110`, `post.ts:202`).

## 7. Sibling capacities

| Capacity | Relationship |
|---|---|
| [`Validatable`](./capacity-validatable.md) | Drives the default validated mode via `ctx.has("Validatable")`; an invalid operand → `false`. |
| [`Clonable`](./capacity-clonable.md) | Shares the exact same `ctx.has("Validatable")` defaulting idiom (its `assertClone` defaults on when `Validatable` is present). |
| [`JsonSerialisable`](./capacity-json-serialisable.md) | `fromJSON` uses the same `ctx.has("Validatable")` idiom (strict `assertParse` when `Validatable` present). |
| [`SchemaModule`](./capacity-schema-module.md) | Owns the `equals` / `less` / `more` (typia `compare.*`) slice that `Comparable` consumes. |
| [`Immutable`](./capacity-immutable.md) | Comparisons run on frozen instances transparently — `equals` / `less` / `more` don't mutate, so immutability is preserved. |
| [`Triggerable`](./capacity-triggerable.md) | Paves `schemaModule` onto the prototype so `Comparable` can pull its slice; gates registration. |

## 8. Gotchas

1. **No marker.** No `ComparableSchema`. Wear/drop it freely; no type-level trace.
2. **`{ validated: true }` without `Validatable` silently degrades to structural**
   (see §4). The option is not an on-switch by itself.
3. **Validated `equals` ≠ structural identity.** Once `Validatable` is present,
   `m.equals(a, a)` is `false` if `a` fails validation — it's a *validity-gated*
   equality, not a deep-equal.
4. **`more` is whatever the schema module binds.** In `post.ts` / `user.ts` /
   `board.ts` etc., `more` is typically `less` inverted
   (`more: (x, y) => less(y, x)`). If a `SchemaModule` doesn't bind `more`,
   `schemaModule.more` is `undefined` and `M.more` throws — make sure your module
   wires all three.
5. **Predicate, not sort.** `Comparable` gives you `less` / `more`; it does not
   sort. Use them inside `Array.prototype.sort` or a queriable ordering layer.
6. **Instance methods do a `this.constructor` lookup per call** — negligible, but
   know it's an indirection, not a direct closure.

## 9. See also

- [`capacity-validatable.md`](./capacity-validatable.md) — the default validated gate.
- [`capacity-clonable.md`](./capacity-clonable.md) — same `ctx.has("Validatable")` defaulting.
- [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) — same idiom for `fromJSON`.
- [`capacity-schema-module.md`](./capacity-schema-module.md) — the `compare.*` slice source.
- [`capacity-immutable.md`](./capacity-immutable.md) — comparing frozen instances.
- [`capacity-introduction.md`](./capacity-introduction.md) — where `Comparable` sits in the catalog.
