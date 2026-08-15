# Capacity: `JsonSerialisable`

> The **JSON (de)serialisation** capacity — it equips a model class with
> `toJSON` / `fromJSON` plus an instance `toJSON()` and a **JSON-override
> constructor**, all pulled from the model's bound `SchemaModule`
> (`typia.json.createAssertStringify` / `createAssertParse`). It does **not**
> invent a format or bind typia itself — it merely consumes the slice the model
> already prepared. If the model doesn't declare it, those module functions stay
> unused (the "use them, or ignore them" split).

`JsonSerialisable` is the **text wire-format** counterpart of
[`ProtobufEncodable`](./capacity-protobuf-encodable.md) and the **default
serialiser** that [`Persistable`](./capacity-persistable.md) (storage) reuses.

## 1. What it is (and is not)

`JsonSerialisable` adds, to the adorned class:

- `static toJSON(data)` → a JSON **string** (`module.toJSON`, which is
  `typia.json.createAssertStringify`).
- `static fromJSON(json)` → a typed object, parsed (+ validated per §5).
- an instance `toJSON()` that returns `this` (so `JSON.stringify(instance)`
  emits the entity's object — see §7 for the subtlety).
- a **JSON-override constructor**: `new X(jsonString)` parses the string
  through `fromJSON` *before* constructing, so it builds exactly like
  `new X(data)`.

It is **not** a transport, a storage engine, or a validator. It owns zero
I/O. It is the narrow "object ⇄ JSON string" adapter; everything else
(`Persistable` → bytes, `Connectable` → HTTP, `Servable` → SQL rows) is layered
on top.

Crucially, the capacity **cannot bind typia itself** — typia's transformer
rejects a generic type argument inside a mixin (the same constraint that exists
for every capacity). So it pulls `toJSON` / `fromJSON` out of the
[`SchemaModule`](./capacity-schema-module.md) the model handed to `defineModel`.
The model bound those functions *concretely* at its own site (where
`UserSchema` is real); `JsonSerialisable` just consumes them.

```ts
// in user.ts — the model binds the functions; the capacity only reads them:
const UserSchemaModule: SqlSchemaModule<UserSchema> = {
  // …
  toJSON: typia.json.createAssertStringify<UserSchema>(),   // → static toJSON
  fromJSON: typia.json.createAssertParse<UserSchema>(),     // → static fromJSON
  isParse: typia.json.createIsParse<UserSchema>(),          // → options.parse variant
  validateParse: typia.json.createValidateParse<UserSchema>(),
  // …
};
```

## 2. The `JsonSerialisableSchema` marker

```ts
type JsonSerialisableSchema = Record<never, never>;
```

A pure **type-level marker** (mirrors `ImmutableSchema`). It is the empty object
at both runtime and the type level — it adds nothing, but it reads as a
deliberate contract when a schema `extends` it. The *runtime* behaviour lives
entirely in the mixin function below.

## 3. Composition

`User` composes it early in its capacity list:

```ts
const UserModel = defineModel<UserSchema>({
  schemaName: "UserSchema",
  schemaModule: UserSchemaModule,
  capacities: [
    Identifiable,
    Timestamped,
    JsonSerialisable,          // ← pulled first (no ordering constraint vs others)
    ProtobufEncodable,
    { capacity: SqlSerialisable, options: { name: "users", dialect: "sqlite" } },
    { capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
    // …
  ],
});
```

- **[`Triggerable`](./capacity-triggerable.md) is auto-prepended** by `composeCapabilities`, so the capacity
  registry `JsonSerialisable` registers into (§8) always exists. Never list
  `Triggerable` yourself.
- **`defineModel` hands the one shared `SchemaModule`** to every capacity.
  `JsonSerialisable` uses `mod.toJSON` / `mod.fromJSON` etc. and ignores the
  rest (`encode`/`decode`, validators, `clone`…).
- **The "use them or ignore them" split** — if a model omits `JsonSerialisable`
  from its `capacities`, `toJSON`/`fromJSON` simply never get lifted onto the
  class; the bound module functions stay unused. Adding the capacity is what
  activates them.

## 4. The API surface

| Member | Kind | Returns | Backed by |
|---|---|---|---|
| `Model.toJSON(data)` | static | JSON **string** | `module.toJSON` (`createAssertStringify`) |
| `Model.fromJSON(json)` | static | typed object | selected parse (§5) |
| `instance.toJSON()` | instance | `this` | identity (§7) |
| `instance.fromJSON(j)` | instance | typed object | selected parse |
| `new Model(jsonString)` | ctor | instance | `fromJSON` (override) then `classify` |

```ts
User.toJSON(validUser);                 // → '{"id":"…","name":"ada",…}'
User.fromJSON('{"id":"…","name":"ada"}'); // → typed UserData (validated if Validatable)
const u = new User();
JSON.stringify(u);                      // → '{"id":"…","name":"ada",…}'
new User('{"id":"…","name":"ada"}');    // parses the string, then constructs
```

## 5. Validation tracks `Validatable`

`fromJSON` (and the JSON-override constructor) decide how strict to be based on
whether the model **also** declares `Validatable`:

- **`Validatable` present** → `fromJSON` uses the module's **strict** parse
  (`createAssertParse`): deserialisation validates in lock-step with the
  constructor's `classify`. Bad input throws.
- **`Validatable` absent** → `fromJSON` falls back to a **LENIENT** bare
  `JSON.parse` — no validation, illegal values pass through. This mirrors how
  `Clonable` only validates its clone when the validator is on.

The decision is made once at compose time via the cross-capacity `ctx`
(`ctx.has("Validatable")`):

```ts
const validated = ctx?.has?.("Validatable") ?? false;
const parseVariant = options?.parse ?? (validated ? "fromJSON" : "lenient");
```

So you opt **into** validation by declaring `Validatable` — not by declaring
`JsonSerialisable`. That keeps deserialisation strictness coherent with
construction strictness.

## 6. Options reference

| Option | Values | Default | Meaning |
|---|---|---|---|
| `parse` | `"fromJSON"` \| `"validateParse"` \| `"isParse"` \| `"lenient"` | `"fromJSON"` when `Validatable` present, else `"lenient"` | Which module function backs `static fromJSON` and the override ctor. An explicit `parse` always wins over the `Validatable` heuristic. |

- `"fromJSON"` → `module.fromJSON` (`createAssertParse`) — throws on invalid.
- `"validateParse"` → `module.validateParse` — non-throwing `IValidation`.
- `"isParse"` → `module.isParse` — `null` on invalid.
- `"lenient"` → bare `JSON.parse` — never validates.

```ts
{ capacity: JsonSerialisable, options: { parse: "lenient" } }
```

## 7. The instance `toJSON()` subtlety

`Base.prototype.toJSON` is set to **return `this`**, NOT `stringify(this)`.
This is deliberate: `JSON.stringify(x)` calls `x.toJSON(key)` and then
serialises whatever is *returned*. If `toJSON()` returned the serialised
**string**, `JSON.stringify` would re-encode it and emit a double-quoted string
(`"\"{...}\""`) instead of the object. Returning `this` lets `JSON.stringify`
serialise the instance's own data fields:

```ts
JSON.stringify(new User({ name: "y", n: 2 })); // → '{"name":"y","n":2}'
```

The **static** `Model.toJSON(data)` is different — it returns the string
(`module.toJSON`). So: *static* = stringify, *instance* = identity. Don't
confuse the two call sites.

## 8. Registration guarding (Triggerable gatekeeper)

Like every other capacity, `JsonSerialisable` registers itself in the capacity
registry only when `Triggerable` has already paved it:

```ts
Base.prototype.capacities && Base.prototype.addCapacity("JsonSerialisable");
```

If `Triggerable` were not first (it always is — `composeCapabilities` prepends
it), `Base.prototype.capacities` is `undefined` and the `addCapacity` call is
skipped. This is verified by `json-serialisable.test.ts` (the "guarded" test):
with `Triggerable` present the registry contains `"JsonSerialisable"`; without
it, the capacity silently does not register.

## 9. Sibling capacities

| Capacity | Relationship to `JsonSerialisable` |
|---|---|
| `ProtobufEncodable` | The **binary** counterpart — `encode`/`decode`/`message` from the same module. Pick JSON or protobuf as the wire format. |
| `Validatable` | **Gates deserialisation strictness** (§5). Declare it to make `fromJSON`/the override ctor validate. |
| `Persistable` | **Reuses `toJSON`/`fromJSON` as its default `"json"` wire format** — `Persistable.serialise = (i) => Ctor.toJSON(i)`, `deserialise = (b) => Ctor.fromJSON(decode(b))`. `Persistable` throws if neither `JsonSerialisable` nor `ProtobufEncodable` is composed. |
| `Immutable` | Reconstruction-based updates still round-trip through `toJSON`/`fromJSON` when persisted/sent. |
| [`Clonable`](./capacity-clonable.md) | Same "validate only when `Validatable` is present" defaulting idiom — the two capacities share the cross-capacity `ctx.has("Validatable")` pattern. |
| `Connectable` | The HTTP **request-ingest** counterpart (`typia.http.*Query`/`Headers`/`Parameter`) — decodes the *rest* of an HTTP exchange; `fromJSON` decodes the *body*. |

## 10. Runtime is typia-free

The capacity binds **no** typia at runtime. All the heavy `createAssertStringify`
/ `createAssertParse` code is emitted by the typia transformer at the **model
site** (compile time) into `UserSchemaModule`. The mixin only reads
`mod.toJSON` / `mod.fromJSON` from the hand-in module object. That keeps the
runtime path Cloudflare-safe (no transformer, no build step at execution).

## 11. See also

- [`capacity-protobuf-encodable.md`](./capacity-protobuf-encodable.md) — the
  binary wire-format counterpart (`encode`/`decode`/`message`).
- [`capacity-versionable.md`](./capacity-versionable.md) — version semantics;
  `toJSON` serialises the current version (the full history lives in the store).
- [`capacity-hashable.md`](./capacity-hashable.md) — `toJSON`/`fromJSON` carry
  the `contentHash` (the content-address) as a plain field.
- [`capacity-persistable.md`](./capacity-persistable.md) — storage; reuses
  `toJSON`/`fromJSON` as its default `"json"` format.
- [`capacity-validatable.md`](./capacity-validatable.md) — gates `fromJSON`
  strictness via the cross-capacity `ctx`; the same `ctx.has("Validatable")` idiom
  [`Clonable`](./capacity-clonable.md)/[`Comparable`](./capacity-comparable.md) use to default to their validated variants.
- [`capacity-schema-module.md`](./capacity-schema-module.md) — the fixed bundle
  of typia bindings every capacity consumes a slice of.
- `src/capacities/json-serialisable.ts` — the mixin (`toJSON`/`fromJSON`,
  instance `toJSON`, JSON-override ctor, `parse` selection).
- `src/capacities/json-serialisable.test.ts` — registration guarding, lenient
  vs strict parse, round-trip, instance `toJSON`/`JSON.stringify`, override ctor.
- `src/capacities/compose.ts` — `composeCapabilities`, the `Triggerable`
  auto-prepend, and the `ComposeContext` (`has(name)`) cross-capacity signal.
