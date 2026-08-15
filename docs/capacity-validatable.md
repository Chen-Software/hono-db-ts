# Capacity: `Validatable`

> The **validation** capacity. It equips a model with typia validation driven
> entirely by the `SchemaModule` the model handed to `defineModel` — surfacing
> `validate` / `assert` / `assertGuard` (statics + instance mirrors), overriding
> the model's construction-time `classify` to validate, and registering
> **lifecycle validation hooks** (`onNew` on construction, `onUpdate` on
> update). It is the single source of truth for "is this data a legal instance
> of the schema?"

`Validatable` is the capacity that makes the *other* capacities' "schema-safe"
promises real: `Identifiable`'s `uuid` format check, `JsonSerialisable`'s strict
`fromJSON`, [`Clonable`](./capacity-clonable.md)'s default `assertClone`, `Comparable`'s "validated" `equals`
— all route through validators this capacity binds. Without it, `assertClassify`
silently degrades to the plain unvalidated `classify`.

---

## 1. What it is / is not

| | |
|---|---|
| **Is** | a mixin that binds `mod.validate`/`assert`/`assertGuard` (+ `-equals` variants) as statics/instance methods, **overrides `classify`** with the assert variant by default, and registers `onConstruct`/`onUpdate` lifecycle validation hooks. |
| **Is not** | a validator itself. It owns **no validation logic** — it consumes the typia functions the model bound concrete in its `SchemaModule`. typia cannot be invoked generically inside a mixin (proven empirically), so the model does the binding. |

It is **declarative, not behavioural**: `Validatable` decides *which* validator
runs and *when*, via options + lifecycle hooks, never *how* validation works.

---

## 2. The validator vocabulary

`Validatable` looks up one of these keys on the `SchemaModule` (see
`capacity-schema-module.md`). A direct function may also be passed as an override.

```ts
type ValidatorKey =
  | "validate"            // createValidate        — non-throwing, returns IValidation
  | "assert"              // createAssert          — THROWS on invalid
  | "assertGuard"         // createAssertGuard     — asserts (AssertionGuard<T>)
  | "validateEquals"      // createValidateEquals  — strict deep-equal validate
  | "assertEquals"        // createAssertEquals    — strict deep-equal assert
  | "assertGuardEquals"   // createAssertGuardEquals
  | "assertGuardValidate" // structural assertion guard (same as assertGuard)
  | ((input: unknown) => any);  // direct function override
```

```ts
type ValidationHookMode = "assert" | "validate" | "assertGuard";
type ClassifyStrategy   = "classify" | "assertClassify" | "validateClassify";
```

- The `-equals` variants are **strict deep equality** (typia's `equals`/`assertEquals`):
  they reject structurally-valid-but-`===`-distinct values. Use them when you need
  to prove two instances are *byte-identical* (e.g. audit diffs), not just both valid.
- `assertGuard` is an `AssertionGuard<T>` (asserts rather than returning a boolean);
  its static mirror (`Model.assertGuard`) **wraps it into a boolean** so you can call
  it ergonomically (`true`/`false`), but the *lifecycle* `enforce` uses the raw
  function so it still **throws** on invalid data.

---

## 3. What the mixin adds

```ts
function Validatable<TBase extends CapacityComposer>(Base, mod, options = {}) {
  // resolve each validator: function override → module key → default module key
  const validateFn     = resolveValidator(options.validate,     "validate");
  const assertFn       = resolveValidator(options.assert,       "assert");
  const assertGuardFn  = resolveValidator(options.assertGuard,   "assertGuard");

  // construction-time classify: DEFAULTS to "assertClassify" when Validatable
  // is on (so `new X(data)` validates). Unwraps the IValidation if the variant
  // returns one (throws on failure, returns the data on success).
  const classifyKey = (options.classify ?? "assertClassify");
  const classifyFn  = (input) => { /* unwrap {success,data,errors} or pass through */ };

  Base.prototype.capacities && Base.prototype.addCapacity("Validatable");

  // lifecycle hooks — Validatable does NOT own the constructor/update; it
  // registers MIDDLEWARE the unified constructor/update invoke.
  addLifecycleHook(Base, "onConstruct", (inst) => enforce(onNew, inst));
  if (onUpdate) addLifecycleHook(Base, "onUpdate", (inst) => enforce(onUpdate, inst));

  const MixedClass = class extends Base {
    static classify      = classifyFn;     // override base plain classify
    static validate      = validateFn;
    static assert        = assertFn;
    static assertGuard   = (input) => { try { assertGuardFn(input); return true; } catch { return false; } };
    static validateUpdate = (d) => enforce(onUpdate, d);
    static assertUpdate   = (d) => enforce(onUpdate, d);
    static assertGuardUpdate = (d) => enforce(onUpdate, d);
    validate()    { return this.constructor.validate(this); }
    assert(): this { this.constructor.assert(this); return this; }
    assertGuard() { return this.constructor.assertGuard(this); }
  };
  return MixedClass;
}
```

### `classify` override — the load-bearing default

When `Validatable` is on, it **replaces the base model's plain `classify`** with
the configured variant, **defaulting to `"assertClassify"`**. Because
`defineModel`'s unified constructor classifies through `Ctor.classify`
(dynamically, not the captured `schemaModule.classify`), every `new X(data)` /
`from(data)` now **validates at construction**. Opt out with `classify: "classify"`
(explicitly unvalidated) or collect errors with `classify: "validateClassify"`.

This is why the *absence* of `Validatable` silently degrades validation: the base
`classify` is `typia.plain.createClassify` — **no validation at all**. The capacity
is what upgrades it.

### Lifecycle middleware (not construction ownership)

`Validatable` does **not** wrap the constructor or implement `update`. It registers
`onConstruct` (from `onNew`) and `onUpdate` (from `onUpdate`) hooks — middleware the
unified constructor/`update` in `defineModel` invoke automatically. This is what
stops the validator from fighting `Immutable`'s constructor transform or
`Versionable`'s update override: there is **one** constructor and **one** `update`,
and each capacity only contributes a hook. (`triggerable.ts` owns the hook
registry via `addLifecycleHook`.)

---

## 4. Options reference

| Option | Type | Default | Meaning |
|---|---|---|---|
| `validate` | `ValidatorKey` | `"validate"` | which module validator backs `Model.validate` / `instance.validate()`. |
| `assert` | `ValidatorKey` | `"assert"` | backs `Model.assert` / `instance.assert()`. |
| `assertGuard` | `ValidatorKey` | `"assertGuard"` | backs `Model.assertGuard` / `instance.assertGuard()`. |
| `classify` | `ClassifyStrategy` | `"assertClassify"` | variant the constructor uses; overrides base plain `classify`. |
| `onNew` | `ValidationHookMode` | unset | validator run on **construction** (via `onConstruct` hook). |
| `onUpdate` | `ValidationHookMode` | unset | validator run on **update** (via `onUpdate` hook). **See §7 gotcha.** |

A `*-equals` key or a direct function overrides the default structural validator,
e.g. `{ validate: validateEquals, assert: assertEquals }` swaps in strict
deep-equal checks. The `SchemaModule` must carry those keys (it does).

---

## 5. Composition

`Validatable` is the only capacity whose mixin signature is `(Base, mod, options)`
— it consumes the **`SchemaModule`** directly (the others read it off the
prototype paved by `Triggerable`). Required: the model's `schemaModule` must bind
the validator keys it references. `Triggerable` gates registration (same idiom as
every capacity).

```ts
const UserModel = defineModel<UserSchema>({
  schemaName: "UserSchema",
  schemaModule: UserSchemaModule,
  capacities: [
    JsonSerialisable, ProtobufEncodable,
    { capacity: Validatable, options: {
        validate: "validateEquals",  // strict-equal validate
        onNew: "assert",             // assert on construction
        onUpdate: "validate",        // collect errors on update
      } },
    Clonable, Comparable, Referencible, /* … */ Immutable,
  ],
});
```

`User.validate(valid)` → `IValidation`; `User.assert(bad)` → throws;
`User.validateUpdate(patch)` → throws if the patch fails `validate`.

> **Stale comment to confirm.** `src/models/post.ts:103` says *"Post keeps the
> validating `assertClassify` as its construction classify (it has no `Validatable`
> capacity to upgrade it)"* — but `post.ts:224` lists `Validatable` in the
> `capacities` array (with no options, so it defaults `classify` to
> `assertClassify`). The comment predates that addition (or is poorly worded: the
> base `classify` is *already* `assertClassify`, so `Validatable`'s default is a
> no-op *for the classify field* — but `Validatable` is still composed). Worth a
> one-line fix so the comment matches the code.

---

## 6. API surface

| Member | Kind | Backed by | Notes |
|---|---|---|---|
| `Model.validate(input)` | static | `mod[options.validate]` | non-throwing → `IValidation`. |
| `Model.assert(input)` | static | `mod[options.assert]` | throws on invalid, returns data. |
| `Model.assertGuard(input)` | static | `mod[options.assertGuard]` | **boolean** (`true`/`false`); wraps the raw AssertionGuard. |
| `Model.classify(input)` | static | `options.classify` | **overrides base**; default `assertClassify`. |
| `Model.validateUpdate/assertUpdate/assertGuardUpdate(data)` | static | `onUpdate` | run the `onUpdate` validator (no-op if unset). |
| `inst.validate()` / `assert()` / `assertGuard()` | instance | the statics | `assert()` returns `this`. |
| `onConstruct` hook | lifecycle | `onNew` | validation ran on `new X(data)` / `from(data)`. |
| `onUpdate` hook | lifecycle | `onUpdate` | validation ran on `update()` (reconstruction path). |

---

## 7. Gotchas

1. **`onUpdate` is bypassed on `Versionable` models.** `Versionable.update`
   reconstructs via `Ctor.from(d)` — a **fresh construction** (no `UPDATE_PHASE`
   marker) — so the unified constructor runs the **`onConstruct`** hook (`onNew`),
   *not* `onUpdate`. The `onUpdate` hook only fires on the `Immutable`/`base`
   reconstruction path (`new Ctor({ …patch, [UPDATE_PHASE]: true })`). Practical
   consequence: for a Versionable entity (`Post`), configure **`onNew`** to cover
   both construction and update; `onUpdate` is effectively dormant on its `update()`.
   (Construction-time validation still happens — via `classify`/`onConstruct` — so
   the data is validated; it just uses the `onNew` validator, not `onUpdate`.)
2. **`classify` is a *static* the capacity overwrites.** The base model sets
   `classify = schemaModule.classify` (plain). `Validatable` replaces it with
   `assertClassify`. Remove `Validatable` (or set `classify: "classify"`) and the
   constructor stops validating — silently.
3. **`Model.assertGuard` returns a boolean; the lifecycle `enforce` throws.** The
   ergonomic boolean wrapper is only for the static/instance surface. A failing
   `onNew`/`onUpdate` validator throws an aggregated `Error`, never returns
   `false`.
4. **The `uuid`/`email`/format checks you rely on live here.** `Post.is({ …id:
   "not-a-uuid" })` is `false` *because* `assert`/`assertGuard` (bound by
   `Validatable`) enforce `tags.Format<"uuid">`. `Identifiable` mints the id;
   `Validatable` proves its shape.
5. **`-equals` variants are stricter than they look.** `assertEquals` rejects two
   valid-but-distinct instances. Don't reach for them unless you mean "byte-identical."
6. **Triggerable ordering.** Compose `Triggerable` first (innermost); `Validatable`
   only registers when the foundation is present.

---

## 8. Sibling capacities

| Capacity | Relationship to `Validatable` |
|---|---|
| `SchemaModule` (`capacity-schema-module.md`) | the **source** — `Validatable` binds its `validate`/`assert`/`classify`/`*-equals` keys. |
| `JsonSerialisable` | `fromJSON` uses the strict `assertParse` *when `Validatable` is also declared* (else lenient `JSON.parse`) — same `ctx.has("Validatable")` idiom as `Clonable`/`Comparable`. |
| [`Clonable`](./capacity-clonable.md) | defaults to `assertClone` (**validated**) when `Validatable` is present; opt out with `{ clone: "clone" }`. |
| `Comparable` | `equals` defaults to the **validated** mode when `Validatable` is present (rejects invalid operands). |
| `Identifiable` | format (`uuid`) enforcement happens *through* `Validatable`'s assert (`Post.is({id:"not-a-uuid"}) === false`). |
| `Immutable` | `Validatable` registers an `onConstruct`/`onUpdate` hook; neither capacity owns the constructor — they compose as middleware. |
| `Versionable` | reconstructs via `Ctor.from` (fresh construct) → `onNew` runs, `onUpdate` does not (see §7.1). |
| `Hashable` | `post.hash()`/`verify()` are independent of `Validatable`, but the *construction* stamp + `onNew` both run. |
| `Randomisable` | `Model.random()` routes through the constructor → `Validatable`'s `classify`/`onNew` apply, so a random instance is schema-valid (frozen if `Immutable`). |
| `Persistable` | (future) persistence writes are expected to assert via `Validatable` before commit. |
| `Triggerable` | registration gate + owns the lifecycle hook registry `Validatable` pushes into. |

---

## 9. See also

- [`capacity-schema-module.md`](./capacity-schema-module.md) — the fixed typia
  binding bundle `Validatable` consumes (validator keys + `classify` variants).
- [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) — the
  `Validatable`-gated `fromJSON` (strict `assertParse` vs lenient parse).
- [`capacity-immutable.md`](./capacity-immutable.md) — the reconstruction path that
  fires `Validatable`'s `onUpdate` hook.
- [`capacity-versionable.md`](./capacity-versionable.md) — the `update()` path that
  bypasses `onUpdate` (uses `onNew` via `Ctor.from`).
- [`capacity-identifiable.md`](./capacity-identifiable.md) — `uuid` format enforced
  by `Validatable`'s assert.
- [`capacity-clonable.md`](./capacity-clonable.md) / [`capacity-comparable.md`](./capacity-comparable.md) —
  both default to their validated variant when `Validatable` is present.
- [`compose.ts`](./../src/capacities/compose.ts) — `Triggerable` auto-prepend +
  `ComposeContext`.
- [`src/capacities/validatable.ts`](./../src/capacities/validatable.ts) — the mixin,
  `ValidatorKey`/`ClassifyStrategy`, the `classify` override, and the hook wiring.
- [`src/capacities/triggerable.ts`](./../src/capacities/triggerable.ts) —
  `addLifecycleHook` and the `onConstruct`/`onUpdate` phases.
