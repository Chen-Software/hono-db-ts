# Capacities

This directory holds the **capacity** system: a set of small, single-purpose
mixins that each own one cross-cutting concern and contribute a slice of a
model's API. A model (`User`, `Repository`, …) is *only* intent — it names
the capacities it wants — and every capacity is reusable across models.

> **Start here first:** [`docs/capacity-introduction.md`](../docs/capacity-introduction.md)
> is the narrative overview of how composition works (the `composeCapabilities`
> engine, the `REGISTRY`, the type-level fold). [`docs/data-models-storage.md`](../docs/data-models-storage.md)
> explains "what is a model?" from the data/storage angle. **This file is a
> directory map** — it points you at the right file, it does not replace those
> docs or the per-capacity docs in `docs/`.

---

## 1. The mental model (30-second version)

A model is produced by `defineModel` (`src/models/base.ts`), which folds a flat
**capacity list** onto a schema-backed base class:

```ts
const UserModel = defineModel<UserSchema>({
  schemaName: "UserSchema",
  schemaModule: UserSchemaModule,        // typia bindings bound ONCE, concretely
  capacities: [ Identifiable, { capacity: SqlSerialisable, options: { name: "users" } }, … ],
});
```

Each capacity is a function of the uniform shape:

```ts
type AnyCapacity = (base, schemaModule?, options?, ctx?) => adornedClass;
```

- It pulls **only its slice** from the shared `SchemaModule` (e.g.
  `JsonSerialisable` reads `toJSON`/`fromJSON`; `SqlSerialisable` reads
  `schema`). Nothing else is touched.
- `Triggerable` is **always prepended + de-duplicated** by the engine, so it is
  never listed and never double-applied.
- `ctx.has("Validatable")` lets a capacity adapt to another (e.g. `Clonable`
  defaults to the validated `assertClone` when `Validatable` is present) with no
  hard dependency.
- Capacities are **opt-in** — the base model is mutable and schema-only without
  them.

See `docs/capacity-introduction.md` §2–§4 for the full contract.

---

## 2. File inventory

### Engine & foundation (read these first)

| File | Role |
|---|---|
| `compose.ts` | `composeCapabilities()` — the declarative chaining helper, the `REGISTRY` (object-form name → function resolution), and the `Composed` / `CapacityInstance` **type-level fold** that surfaces each capacity's API on the composed model automatically. Source of truth for the whole system. |
| `triggerable.ts` | The **always-first** foundation. Paves `schemaModule`, the lifecycle (`hooks`) and event (`listeners`) registries onto the prototype so every downstream capacity can register hooks / listen. Not in the `REGISTRY` (array form only). |
| `schema-module.ts` | The `SchemaModule<T>` type — the fixed bundle of typia bindings every capacity consumes a slice of. The concrete bundle is bound in each model file (e.g. `UserSchemaModule`). |
| `identifiable.ts` | `IdentifiableSchema<UUID>` (the `uuid` `id` type marker) + the `id`/provenance mixin (`crypto.randomUUID` when absent). |
| `timestamped.ts` | `TimestampedSchema` (`created_at`) + the timestamp mixin. |

### Behavioural capacities (each has a `docs/capacity-*.md`)

| Capacity | Source | Owns | Doc |
|---|---|---|---|
| `Validatable` | `validatable.ts` | Validator resolution + `onNew`/`onUpdate` lifecycle hooks; gates strictness of `Clonable`/`Json`/`Comparable`. | [`docs/capacity-validatable.md`](../docs/capacity-validatable.md) |
| `SqlSerialisable` | `sql-serialisable.ts` | Drizzle table + `toRow`/`fromRow` mappers + FK/CHECK from the reflected schema. | [`docs/capacity-sql-serialisable.md`](../docs/capacity-sql-serialisable.md) |
| `JsonSerialisable` | `json-serialisable.ts` | `toJSON` / `fromJSON` + JSON-override constructor. | [`docs/capacity-json-serialisable.md`](../docs/capacity-json-serialisable.md) |
| `ProtobufEncodable` | `protobuf-encodable.ts` | `encode` / `decode` / `message` (binary wire format; **mutates in place** — the one in-place-only codec). | [`docs/capacity-protobuf-encodable.md`](../docs/capacity-protobuf-encodable.md) |
| `Referencible` | `referencible.ts` | In-memory FK accessors (`user.getRepositories()`) through the identity map; owner side from `Reference<>` tags, inverse side auto-derived by `wireInverseRelations()`. `onDelete` (restrict/cascade/setNull) is **executed** by `ModelBase.delete()`. Not in `REGISTRY` (array form only). | [`docs/capacity-referencible.md`](../docs/capacity-referencible.md) |
| `Versionable` | `versionable.ts` | Append-only version rules (`updated_at` = version), `update`, history toolkit. Plays with `Immutable`. | [`docs/capacity-versionable.md`](../docs/capacity-versionable.md) |
| `Immutable` | `immutable.ts` + `immutable-setter.ts` + `immutable-validatable.ts` | `Object.freeze` + setter-rewrite; `update` reconstructs a **new frozen** instance. Declared **last** so freeze wraps the finished object. | [`docs/capacity-immutable.md`](../docs/capacity-immutable.md) |
| `Hashable` | `hashable.ts` | `contentHash` (SHA-256) of a named content field; `hash`/`verify`/`address`. | [`docs/capacity-hashable.md`](../docs/capacity-hashable.md) |
| `Queriable` | `queriable.ts` | In-memory `filter(items, query)` — schema-inferred row-level matchers. | [`docs/capacity-queriable.md`](../docs/capacity-queriable.md) |
| `Siftable` | `siftable.ts` | `Queriable` + keyset pagination. | (in-source) |
| `Servable` | `servable.ts` | Generated Hono/SQL CRUD routes + `?param=` filters + `routeSpec()`. | [`docs/capacity-servable.md`](../docs/capacity-servable.md) |
| `Aggregable` | `aggregable.ts` | `aggregate(items, …)` + `GET /…/aggregate` (GROUP BY + COUNT/SUM/AVG/MIN/MAX). | [`docs/capacity-aggregable.md`](../docs/capacity-aggregable.md) |
| `Clonable` | `clonable.ts` | Deep copy (`clone`); variant-driven by `Validatable`. | [`docs/capacity-clonable.md`](../docs/capacity-clonable.md) |
| `Comparable` | `comparable.ts` | `equals` / `less` / `more` (validator-aware by default). | [`docs/capacity-comparable.md`](../docs/capacity-comparable.md) |
| `Randomisable` | `randomisable.ts` | `Model.random()` (typia `createRandom`). | [`docs/capacity-randomisable.md`](../docs/capacity-randomisable.md) |
| `Derivable` | `derivable.ts` | Derived/computed fields recomputed on construct/update. | [`docs/capacity-derivable.md`](../docs/capacity-derivable.md) |
| `Reactive` | `reactive.ts` | Subscriber-centric bus-topic reactions (inversion of `Triggerable.after`). | [`docs/capacity-reactive.md`](../docs/capacity-reactive.md) |
| `Meterable` | `meterable.ts` | Marker that opts a model's repository ops into metrics. | [`docs/capacity-meterable.md`](../docs/capacity-meterable.md) |
| `Persistable` | `persistable.ts` | Reuses `Json`/`Protobuf` as its serialise format; metrics-friendly persistence. | (in-source) |
| `Addressable` | `addressable.ts` | Content-addressing helper. **Not yet wired into the `REGISTRY`** — array form only. | (in-source) |

### Relationship between capacities and tests

Every behavioural capacity ships a sibling `*.test.ts` (e.g. `referencible.test.ts`,
`sql-serialisable.test.ts`, `servable.test.ts`). The suite is the authoritative
behavioural contract — when in doubt about a capacity's exact semantics, read its
test, not just its doc.

---

## 3. How to add a capacity

`docs/capacity-introduction.md` §4 is the contract. In short:

1. Implement `function MyCapacity<TBase>(Base, schemaModule, options?, ctx?): TBase & …`.
2. Register it into the prototype via `Triggerable`'s gate (`addCapacity`).
3. Read only your slice from `schemaModule`; adapt to neighbours via `ctx.has(...)`.
4. Decide: **new subclass** (preferred for anything overriding a constructor/`update`) or **mutate in place** (only pure codecs like `ProtobufEncodable`).
5. For object-form availability, add it to the `REGISTRY` loop in `compose.ts`.
6. Extend the `CapacityFn` union and `CapacityInstance<C>` map so the composed model inherits your API without manual `declare`.

---

## 4. Where to go next

- **Understand composition mechanics** → `compose.ts`, then `docs/capacity-introduction.md`.
- **Understand a model end-to-end** → `../models/ReadMe.md` + `docs/data-models-storage.md`.
- **A specific concern** → the matching `docs/capacity-*.md` (linked in §2).
- **The `Reference` tag** (drives both `Referencible` and `SqlSerialisable`) → `../tags/reference.ts`.
