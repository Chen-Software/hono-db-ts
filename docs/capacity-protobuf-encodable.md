# Capacity: `ProtobufEncodable`

> The **protobuf (de)serialisation** capacity — it equips a model class with
> `encode` / `decode` / `message`, all pulled from the model's bound
> `SchemaModule` (`typia.protobuf.createAssertEncode` / `createAssertDecode` /
> `message`). It is the **binary wire-format** counterpart of
> [`JsonSerialisable`](./capacity-json-serialisable.md) and the **`"protobuf"`
> option** that [`Persistable`](./capacity-persistable.md) (storage) reuses.
>
> **Distinctive trait:** unlike `JsonSerialisable`, `Immutable`, and
> [`Triggerable`](./capacity-triggerable.md) (which each return a *new subclass*), `ProtobufEncodable`
> **mutates `Base` in place and returns the same constructor** — a deliberate
> choice that lets it decorate a standalone class without forcing it into a
> `class X extends Mixin(...)` chain.

## 1. What it is (and is not)

`ProtobufEncodable` adds, to the adorned class:

- `static encode(data)` → `Uint8Array` (assert + encode).
- `static decode(bytes)` → a typed object (assert + decode).
- `static message` → the proto3 schema **string** (`typia.protobuf.message`).
- an instance `encode()` that encodes `this`.
- an instance `decode()` — a **round-trip self-check**: `decode(encode(this))`
  (see §5).

It is **not** a transport, a storage engine, or a validator. It owns zero I/O.
It is the narrow "object ⇄ `Uint8Array`" adapter; `Persistable` layers storage
on top, `Connectable`/HTTP layers transport.

Like every capacity, it **binds no typia at runtime** — typia rejects a generic
type argument inside a mixin. It pulls `encode` / `decode` / `message` out of
the [`SchemaModule`](./capacity-schema-module.md) the model handed to
`defineModel`. The model bound those functions *concretely* at its own site
(where `UserSchema` is real); `ProtobufEncodable` just consumes them.

```ts
// in user.ts — the model binds the functions; the capacity only reads them:
const UserSchemaModule: SqlSchemaModule<UserSchema> = {
  // …
  message: typia.protobuf.message<UserSchema>(),          // → static message
  encode: typia.protobuf.createAssertEncode<UserSchema>(), // → static encode
  decode: typia.protobuf.createAssertDecode<UserSchema>(), // → static decode
  // …
};
```

## 2. The `ProtobufEncodableSchema` marker

```ts
type ProtobufEncodableSchema = Record<never, never>;
```

A pure **type-level marker** (mirrors `JsonSerialisableSchema` and
`ImmutableSchema`). The empty object at both runtime and the type level — it
adds nothing, but reads as a deliberate contract when a schema `extends` it. The
runtime behaviour lives entirely in the mixin below.

## 3. Composition — mutates in place (the key difference)

`User` composes it alongside `JsonSerialisable`:

```ts
const UserModel = defineModel<UserSchema>({
  schemaName: "UserSchema",
  schemaModule: UserSchemaModule,
  capacities: [
    Identifiable,
    Timestamped,
    JsonSerialisable,
    ProtobufEncodable,        // ← mutates in place, no subclass created
    { capacity: SqlSerialisable, options: { name: "users", dialect: "sqlite" } },
    { capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
    // …
  ],
});
```

**Why in-place mutation matters:**

- `ProtobufEncodable` has **no constructor override** — protobuf is a pure
  codec. There is nothing that *requires* wrapping `Base` in a fresh subclass.
- So it can **decorate an existing standalone class** (e.g. a model that carries
  its own hand-written constructor and methods) without forcing it into a
  `class X extends Mixin(...)` chain.
- It still composes cleanly *after* other layered mixins:
  `composeCapabilities(PostBase, [JsonSerialisable, ProtobufEncodable], mod)`.

By contrast, `JsonSerialisable`, `Immutable`, and [`Triggerable`](./capacity-triggerable.md) **do** return a
new subclass (they need a constructor override or a paved registry). `compose.ts`
notes this split explicitly:

> some capacities return a NEW subclass (`JsonSerialisable`, `Immutable`,
> `Triggerable`); others mutate `Base` **in place** and return the same
> constructor (`ProtobufEncodable`).

- **[`Triggerable`](./capacity-triggerable.md) is auto-prepended** by `composeCapabilities`, so the capacity
  registry `ProtobufEncodable` registers into (§7) always exists. Never list
  `Triggerable` yourself.
- **The "use them or ignore them" split** — if a model omits `ProtobufEncodable`
  from its `capacities`, `encode`/`decode`/`message` simply never get lifted
  onto the class; the bound module functions stay unused. Adding the capacity is
  what activates them.

## 4. The API surface

| Member | Kind | Returns | Backed by |
|---|---|---|---|
| `Model.encode(data)` | static | `Uint8Array` | `module.encode` (`createAssertEncode`) |
| `Model.decode(bytes)` | static | typed object | `module.decode` (`createAssertDecode`) |
| `Model.message` | static | proto3 schema **string** | `module.message` |
| `instance.encode()` | instance | `Uint8Array` | `encode(this)` |
| `instance.decode()` | instance | typed object | `decode(encode(this))` (self-check, §5) |

```ts
User.encode(validUser);                       // → Uint8Array
User.decode(bytes);                           // → typed UserData
User.message;                                 // → 'syntax = "proto3";\nmessage User { … }'
const u = new User(validUser);
u.encode();                                   // → Uint8Array
```

## 5. The instance `decode()` is a round-trip self-check

`Base.prototype.decode` is set to `decode(encode(this))` — it **re-encodes the
instance, then decodes the result**, returning the decoded data. It is a
**self-check**, not an in-place mutation of `this`:

```ts
(Base.prototype as any).decode = function (this: any) {
  return decode(encode(this));   // round-trip self-check
};
```

So `instance.decode()` verifies the instance survives a full encode→decode
round-trip (catches schema drift, missing `oneOf` tags, etc.) and returns the
regenerated object. It does **not** overwrite `this` with the decoded copy. If
you want the decoded value, capture the return: `const copy = u.decode();`.

This differs from `JsonSerialisable`'s instance `toJSON()`, which returns `this`
so `JSON.stringify` works. Here the instance method returns *new* data by
design.

## 6. Encode/decode validate (assert variant) — no `parse` option

`ProtobufEncodable` lifts **only** `encode` / `decode` / `message` — and it
binds the **assert** variants from the module (`createAssertEncode` /
`createAssertDecode`). So:

- `encode` **throws on invalid input** (the assert encode).
- `decode` **throws on malformed / mistyped bytes** (the assert decode).

There is **no `options` bag** for this capacity (its signature is `(Base, mod)`
— no third `options` parameter), so there is no `parse`-style override like
`JsonSerialisable` exposes. If you need non-throwing variants, call the module's
`isEncode` / `validateEncode` / `isDecode` / `validateDecode` directly (they are
bound in the `SchemaModule` but not lifted onto the class).

Because encoding/decoding already assert structurally, `ProtobufEncodable` does
not depend on `Validatable` for correctness the way `JsonSerialisable`'s lenient
fallback does — the protobuf assert path validates regardless.

## 7. Registration guarding (Triggerable gatekeeper)

Like every other capacity, `ProtobufEncodable` registers itself in the capacity
registry only when `Triggerable` has already paved it:

```ts
Base.prototype.capacities && Base.prototype.addCapacity("ProtobufEncodable");
```

**Important nuance (and a point of difference from `JsonSerialisable`):** the
guard only gates *registration*. The **codec attachment is unconditional** —
even if `Triggerable` is absent (so the registry is never created and the
capacity does not register), `encode` / `decode` / `message` are still attached
to the class (`protobuf-encodable.test.ts` asserts this explicitly: "still
attaches the codec even without Triggerable"). So the class is usable as a
protobuf codec; it just isn't listed in its own capability introspection set.

## 8. Sibling capacities

| Capacity | Relationship to `ProtobufEncodable` |
|---|---|
| `JsonSerialisable` | The **text** counterpart — `toJSON`/`fromJSON` from the same module. Pick JSON or protobuf as the wire format. |
| `Validatable` | Not required for correctness — `encode`/`decode` already assert. `Validatable` governs *construction/update* strictness; protobuf validation is independent. |
| `Persistable` | Reuses `encode`/`decode` as its **`"protobuf"` wire format** — `Persistable.serialise = (i) => Ctor.encode(i)`, `deserialise = (b) => Ctor.decode(b)`. Falls back to JSON if `ProtobufEncodable` is absent. `Persistable` throws only if **neither** `JsonSerialisable` nor `ProtobufEncodable` is composed. |
| `Connectable` | The HTTP transport layer — a `Content-Type: application/x-protobuf` request body is exactly `encode(entity)`; a protobuf response is `decode(bytes)`. |
| `Immutable` | Reconstruction-based updates still round-trip through `encode`/`decode` when persisted/sent. |

## 9. Runtime is typia-free

The capacity binds **no** typia at runtime. All the `createAssertEncode` /
`createAssertDecode` / `message` code is emitted by the typia transformer at the
**model site** (compile time) into `UserSchemaModule`. The mixin only reads
`mod.encode` / `mod.decode` / `mod.message` from the hand-in module object. That
keeps the runtime path Cloudflare-safe (no transformer, no build step at
execution).

## 10. See also

- [`capacity-json-serialisable.md`](./capacity-json-serialisable.md) — the **text**
  wire-format counterpart (`toJSON`/`fromJSON`), which *does* return a new
  subclass and *does* track `Validatable`.
- [`capacity-identifiable.md`](./capacity-identifiable.md) — `encode`/`decode` carry
  `id` (the 36-char uuid) as an ordinary serialised field.
- [`capacity-hashable.md`](./capacity-hashable.md) — `encode`/`decode` carry the
  `contentHash` (the content-address) as a plain 64-hex string.
- [`capacity-persistable.md`](./capacity-persistable.md) — storage; reuses
  `encode`/`decode` as its `"protobuf"` format (falls back to JSON).
- [`capacity-schema-module.md`](./capacity-schema-module.md) — the fixed bundle
  of typia bindings every capacity consumes a slice of.
- `src/capacities/protobuf-encodable.ts` — the mixin (in-place mutation, codec
  attachment, round-trip self-check).
- `src/capacities/protobuf-encodable.test.ts` — registration guarding, codec
  attachment *without* Triggerable, `encode → decode` round-trip, the instance
  self-check, and composition after `JsonSerialisable`.
- `src/capacities/compose.ts` — the in-place-vs-new-subclass split documented in
  its header, and the `Triggerable` auto-prepend + `ComposeContext`.
