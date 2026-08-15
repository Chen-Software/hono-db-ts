# Capacities — Introduction

> A *capacity* is a tiny mixin that owns **one** cross-cutting concern and
> contributes a slice of a model's API. Models are built by folding a flat list
> of capacities onto a schema-backed base class — so a model is just *intent*
> ("I want this entity to be identifiable, versionable, queryable…") and every
> capacity is reusable across models.

This is the entry point to the capacity documentation. It explains **how the
system fits together** (the `compose.ts` engine) and then links out to a
per-capacity doc for each concern. If you want the narrative "what is a model?"
view, start from [`data-models-storage.md`](./data-models-storage.md); this doc
focuses on the *capacity mechanism itself*.

---

## 1. What is a capacity?

A model (`User`, `Post`, `Board`, …) is produced by `defineModel`
(`src/models/base.ts`), which takes three things:

1. A **reflected typia schema** (`schemaName`) — the shape of the entity.
2. A **fixed `SchemaModule`** — the bundle of typia functions (validate, clone,
   serialise, …) the model bound concretely at *its own* site, where the schema
   type is real.
3. A **list of capacities** — the cross-cutting behaviours to fold on.

A capacity is the third piece. It is a function of the uniform shape:

```ts
type AnyCapacity = (base, schemaModule?, options?, ctx?) => adornedClass;
```

Each capacity *pulls only the slice it needs* out of the `SchemaModule` and
ignores the rest. `JsonSerialisable` reads `toJSON`/`fromJSON`; `Clonable` reads
the `clone` slice; `SqlSerialisable` reads `schema`. Nothing else in the module
is touched. That is the whole design: **one schema, many single-purpose slices.**

---

## 2. How composition works (`compose.ts`)

`composeCapabilities(base, specs, schemaModule)` is the declarative chaining
helper. It **folds the capacity list left-to-right** onto the base and returns
the processed class; the model then `extends` that result. No hand-written
`Fn(G(H(base, …)))` nesting.

### 2.1 `Triggerable` is always first

`Triggerable` is the single foundation: it paves **both** the capacity registry
and the lifecycle/event registries that every other capacity pushes into. So it
is **always prepended (and de-duplicated)** at compose time — regardless of what
the model declared. A model can never forget to put it first, and never double-apply
it. From the call site it is effectively invisible.

### 2.2 Two equivalent declarative forms

```ts
// ARRAY form — capacity refs (functions) or { capacity, options } objects:
capacities: [
  Identifiable,
  { capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
  { capacity: SqlSerialisable, options: { name: "users", dialect: "sqlite" } },
  Clonable,
]

// OBJECT form — capacity by exported NAME (presence only):
capacities: { Identifiable: true, Validatable: true, SqlSerialisable: true, Clonable: true }
```

The object form resolves names through a `REGISTRY` (`registerCapacity(name, fn)`),
so you don't import the function. An **unknown name throws** at compose time —
the error lists the known capacities. The array form passes functions directly
and needs no registry.

### 2.3 New subclass vs. in-place mutation

Capacities fold identically under left-to-right reduction, but they differ in
what they return:

| Style | Capacities | Behaviour |
|---|---|---|
| **Returns a NEW subclass** | `JsonSerialisable`, `Immutable`, `Triggerable` | Wraps `Base` in a fresh class; clean layering. |
| **Mutates `Base` in place** | `ProtobufEncodable` | Decorates the same constructor (pure codec, no ctor override). |

Both reduce the same way because every capacity has the uniform shape. You don't
need to know which a capacity is when you declare it — but it matters if you ever
*author* one (see §4).

### 2.4 Cross-capacity awareness via `ctx.has`

`composeCapabilities` builds **one `ComposeContext`** for the whole declaration
and passes it to every capacity. `ctx.has("Validatable")` reports whether
`Validatable` is part of the model — letting one capacity adapt to another
**without a hard dependency**. The canonical examples:

- `Clonable` defaults its clone to the **validated** `assertClone` when
  `Validatable` is present (else plain `clone`).
- `JsonSerialisable.fromJSON` uses the strict `assertParse` when `Validatable`
  is present (else lenient `JSON.parse`).
- `Comparable.equals` defaults to the validator-aware ("validated") mode.

This is the "decide whether to use them, or ignore them" split: a capacity reads
only its slice and adapts to neighbours it finds in `ctx`.

### 2.5 Marker capacities vs. behavioural capacities

Some capacities are **type-level markers** (an empty `interface`/`type` that
reads as a deliberate contract in an intersection) with the runtime behaviour
living in a *separate* mixin:

| Marker | Extended by | Runtime mixin |
|---|---|---|
| `ImmutableSchema` (`Record<never, never>`) | `VersionableSchema`, `Hashable<K>` | `Immutable` (freeze + setter-rewrite) |
| `VersionableSchema` | — | `Versionable` (version toolkit + `update`) |
| `Hashable<K>` | — | `Hashable` (content hash) |

`Clonable`, `JsonSerialisable`, `SqlSerialisable`, `Queriable`, `Servable`, etc.
have **no marker** — they are purely behavioural. Wearing a marker-only capacity
(like `VersionableSchema`) gives you the *type contract*; the runtime guarantee
requires the corresponding mixin to be in the `capacities` array. (See the
`Immutable` doc's note that `Post` wears `Versionable`/`Hashable` but not the
`Immutable` runtime mixin, so it is not frozen at runtime.)

### 2.6 The type-level fold surfaces the API automatically

`compose.ts` also folds the capacity list at the **type level** (`Composed<B, S>`
+ `CapacityInstance<C>`). Each capacity function maps to the instance/static API
it contributes — so the composed model *inherits* `validate`/`assert`/`assertGuard`
(`Validatable`), `hash`/`verify`/`address` (`Hashable`), `clone` (`Clonable`),
`equals`/`less`/`more` (`Comparable`), `serve`/`routeSpec` (`Servable`), etc. —
**with no manual `declare` in the model class**. The fold is total: capacities
that add no extra surface resolve to `unknown` (a no-op intersection).

---

## 3. Composition rules of thumb

- **`Triggerable` is automatic** — never list it, never worry about order.
- **Order matters only for outermost wrapping.** The *last* capacity in the array
  is the outermost class, so its constructor/overrides win. `Immutable` is
  therefore placed **last** so its freeze + setter-rewrite wrap the finished
  object; `Validatable`'s overrides (it returns a new subclass) must sit where
  they can replace `classify`. SQL/JSON/Protobuf are independent of order (they
  consume the *schema field*, not a neighbour's runtime state).
- **Declare each capacity once.** Duplicates beyond `Triggerable` are not
  de-duplicated — list a capacity a single time. Use `{ capacity, options }` when
  it needs configuration (`Validatable`, `SqlSerialisable`, `Hashable`,
  `Queriable`, `Servable`, `Referencible`, `Meterable`, `Aggregable`).
- **Capabilities are opt-in, not mandatory.** The base `defineModel` is mutable
  and schema-only. A model can omit `Immutable`, `Servable`, `Queriable`, etc.
  freely — each is a choice, not a requirement.
- **SchemaModule is the single source of truth.** If a capacity's behaviour seems
  missing, it usually means the corresponding typia binding wasn't exported from
  the model's `SchemaModule` (e.g. `Clonable` silently degrades to plain `clone`
  if only `clone` was bound).

---

## 4. Authoring a capacity (the contract)

If you add a capacity, follow the uniform shape and the registry convention:

1. Implement `function MyCapacity<TBase extends CapacityComposer>(Base, schemaModule, options?, ctx?): TBase & …`.
2. Inside, register it with `Base.prototype.capacities && Base.prototype.addCapacity("MyCapacity")`
   (the `Triggerable` gate — gated so capacities don't stamp the registry when
   `Triggerable` wasn't applied).
3. Read only your slice from `schemaModule`; adapt to neighbours via `ctx.has(...)`.
4. Decide: return a **new subclass** (preferred for anything that overrides a
   constructor/`update`) or **mutate `Base` in place** (only for pure codecs like
   `ProtobufEncodable`).
5. For object-form availability, add it to the `REGISTRY` loop in `compose.ts`
   (or call `registerCapacity`).
6. Extend the type-level `CapacityFn` union and `CapacityInstance<C>` map so the
   composed model inherits your API without manual `declare`.

---

## 5. The capacity catalog

Grouped by concern. **Linked** entries have a dedicated doc; the rest are
documented in-source (file noted).

### Identity & provenance
| Capacity | Doc | What it owns |
|---|---|---|
| `Identifiable` | [capacity-identifiable.md](./capacity-identifiable.md) | The `id` field + provenance (`crypto.randomUUID` when absent). |
| `Timestamped` | [capacity-timestamped.md](./capacity-timestamped.md) *(pending)* | `created_at` / `updated_at` timestamps. |
| [`Referencible`](./capacity-referencible.md) | `src/capacities/referencible.ts` | In-memory FK accessors (`user.getPosts()`) resolved through the identity map; owner side derived from `Reference<>` tags. *(Not in the `REGISTRY` — array form only.)* |

### Validation & schema
| Capacity | Doc | What it owns |
|---|---|---|
| `Validatable` | [capacity-validatable.md](./capacity-validatable.md) | Validator resolution + `onNew`/`onUpdate` lifecycle hooks; gates strictness of `Clonable`/`Json`/`Comparable`. |
| `SchemaModule` | [capacity-schema-module.md](./capacity-schema-module.md) *(pending)* | The fixed typia-binding bundle every capacity consumes a slice of. |

### Storage & wire format
| Capacity | Doc | What it owns |
|---|---|---|
| `SqlSerialisable` | [capacity-sql-serialisable.md](./capacity-sql-serialisable.md) | Drizzle table + row mappers + FK/CHECK from schema. |
| `JsonSerialisable` | [capacity-json-serialisable.md](./capacity-json-serialisable.md) | `toJSON` / `fromJSON` + JSON-override constructor. |
| `ProtobufEncodable` | [capacity-protobuf-encodable.md](./capacity-protobuf-encodable.md) | `encode` / `decode` / `message` (binary wire format; mutates in place). |
| `Persistable` | `src/capacities/persistable.ts` | Reuses `Json`/`Protobuf` as its serialise format; metrics-friendly persistence. |

### Versioning & immutability
| Capacity | Doc | What it owns |
|---|---|---|
| `Versionable` | [capacity-versionable.md](./capacity-versionable.md) | Append-only version rules (`updated_at` = version), `update`, history toolkit. |
| `Immutable` | [capacity-immutable.md](./capacity-immutable.md) | `Object.freeze` + setter-rewrite → `update` reconstructs a new frozen instance. |
| `Hashable` | [capacity-hashable.md](./capacity-hashable.md) | `contentHash` (SHA-256) of a named content field; `hash`/`verify`/`address`. |

### Query & serve
| Capacity | Doc | What it owns |
|---|---|---|
| `Queriable` | [capacity-queriable.md](./capacity-queriable.md) | In-memory `filter(items, query)` — schema-inferred row-level matchers. |
| `Siftable` | `src/capacities/siftable.ts` | `Queriable` + keyset pagination. |
| `Servable` | [capacity-servable.md](./capacity-servable.md) | Generated Hono/SQL CRUD routes + `?param=` filters + `routeSpec()`. |
| `Aggregable` | [capacity-aggregable.md](./capacity-aggregable.md) | `aggregate(items, …)` + `GET /…/aggregate` (GROUP BY + COUNT/SUM/AVG/MIN/MAX ranking). |

### Behaviour & utilities
| Capacity | Doc | What it owns |
|---|---|---|
| `Clonable` | [capacity-clonable.md](./capacity-clonable.md) | Deep copy (`clone`); variant-driven by `Validatable`. |
| [`Comparable`](./capacity-comparable.md) | `src/capacities/comparable.ts` | `equals` / `less` / `more` (validator-aware by default). |
| [`Randomisable`](./capacity-randomisable.md) | `src/capacities/randomisable.ts` | `Model.random()` (typia `createRandom`; `randomSeed()` / `seedField` **not yet implemented**). |
| `Derivable` | `src/capacities/derivable.ts` ([doc](./capacity-derivable.md)) | Derived/computed fields recomputed on construct/update (eager `onUpdate` + lazy `bus` paths; see doc §10 gotchas). |
| `Reactive` | `src/capacities/reactive.ts` ([doc](./capacity-reactive.md)) | Subscriber-centric bus-topic reactions (the inversion of `Triggerable.after`). |
| `Meterable` | `src/capacities/meterable.ts` ([doc](./capacity-meterable.md)) | Marker that opts a model's repository ops into metrics (consumer not yet wired — see doc §6). |

### Foundation
| Capacity | Doc | What it owns |
|---|---|---|
| `Triggerable` | `src/capacities/triggerable.ts` ([doc](./capacity-triggerable.md)) | The registry foundation; always applied first. Paves `schemaModule`, the lifecycle (`hooks`) and event (`listeners`) registries onto the prototype so every downstream capacity can pull its slice / register hooks. |

---

## 6. Where to start

- **"I want to understand models in general"** →
  [`data-models-storage.md`](./data-models-storage.md) (the narrative overview).
- **"I want to make a model queryable / servable"** →
  [capacity-queriable.md](./capacity-queriable.md) →
  [capacity-servable.md](./capacity-servable.md).
- **"I want to aggregate / rank (who posted the most?)"** →
  [capacity-aggregable.md](./capacity-aggregable.md).
- **"I want versioning / content addressing"** →
  [capacity-versionable.md](./capacity-versionable.md) →
  [capacity-immutable.md](./capacity-immutable.md) →
  [capacity-hashable.md](./capacity-hashable.md).
- **"I want to persist / serialise"** →
  [capacity-sql-serialisable.md](./capacity-sql-serialisable.md) →
  [capacity-json-serialisable.md](./capacity-protobuf-encodable.md).
- **"I want validation"** → [capacity-validatable.md](./capacity-validatable.md).
- **Source of truth for the engine** → `src/capacities/compose.ts`.

---

## 7. See also

- [`data-models-storage.md`](./data-models-storage.md) — the "what is a model?"
  narrative that this doc complements.
- Individual capacity docs (linked throughout §5).
- `src/capacities/compose.ts` — `composeCapabilities`, the `REGISTRY`, the
  `Composed` / `CapacityInstance` type-level fold (source of truth for this doc).
- `src/models/base.ts` — `defineModel`, which calls `composeCapabilities` and
  wires the `UPDATE_PHASE` reconstruction marker.
- `src/capacities/triggerable.ts` — the foundation capacity always applied first.
