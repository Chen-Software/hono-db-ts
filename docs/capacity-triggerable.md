# Capacity: `Triggerable`

> **Foundation capacity — applied automatically, first, and exactly once.**
> `Triggerable` is not something you opt into. `composeCapabilities` prepends it
> to every model so the capacity registry *and* the lifecycle/event surface
> exist before any other capacity is folded on.

---

## 1. What `Triggerable` is (and is not)

`Triggerable` is the **single foundation capacity**. It owns *both*:

1. **The capability registry** — the `capacities` `Set` + `addCapacity` method
   (the job formerly done by a separate `Capable` capacity). Every other
   capacity *gates its self-registration* on this Set existing.
2. **The lifecycle + event surface** — the `hooks` (middleware) and `listeners`
   (signals) registries plus the public `addHook` / `on` / `before` / `after` /
   `emit` API.

It is **not**:

- a *schema marker*. Unlike `Immutable` / `Versionable` / `Hashable`, there is
  **no `TriggerableSchema` type** — it contributes nothing to a model's type
  shape. It is purely behavioural/infrastructural.
- an *opt-in* capacity. You never list it; `composeCapabilities` injects it.
- an *in-place mutator*. Like `JsonSerialisable` and `Immutable`, it returns a
  **new subclass**; only `ProtobufEncodable` mutates `Base` in place.
- a *data* capacity. It stores no fields, validates nothing, serialises nothing.

**Source:** `src/capacities/triggerable.ts`. **Tests:** `triggerable.test.ts`
(16 tests, all passing).

---

## 2. The marker

There is **no marker**. `Triggerable` is the substrate other capacities sit on;
it does not declare a `Record<never, never>` (or any) type contract of its own.

If you want to *detect* at runtime whether a class carries the foundation, read
the prototype Set:

```ts
const hasFoundation = !!(MyModel.prototype as any).capacities;
```

---

## 3. The mixin — what it adds

`Triggerable(Base)` returns `class extends Base` and paves four things onto the
class (idempotently, so re-composition is safe):

| Member | Kind | Purpose |
| --- | --- | --- |
| `prototype.capacities` | `Set<string>` | Registry of applied capacity names; seeded with `"Triggerable"`. |
| `prototype.addCapacity(name)` | method | Register a capacity name into the shared Set. |
| `static hooks` | `LifecycleHooks` | Middleware registry (`onInit`/`onConstruct`/`onUpdate`/`onDelete`). Paved, empty. |
| `static listeners` | `EventListeners` | Event subscriber registry (`{ [event]: EventListener[] }`). Paved, empty. |
| `static addHook(phase, fn)` | method | Register a lifecycle middleware (runs *during* an operation). |
| `static on(event, fn)` | method | Subscribe to an event. **Returns an unsubscribe function.** |
| `static before(stem, fn)` | method | `on(\`before${stem}\`)` — `stem` ∈ `Update \| Delete \| Persist`. Returns unsubscribe. |
| `static after(stem, fn)` | method | `on(\`after${stem}\`)`. Returns unsubscribe. |
| `static emit(event, payload)` | method | Dispatch to subscribers; returns `Promise<void>`. |

Two supporting exports live in the module (not on the class):

- **`LifecyclePhase`** / **`LifecycleHook`** — the phase names and middleware
  signature `(target: any) => any`.
- **`UPDATE_PHASE`** — a `Symbol` marker smuggled *through the constructor
  argument* by `Immutable.update` so the unified `base.ts` constructor can tell
  a *reconstruction* (update) apart from a *fresh* construct. See §4.

> **`declare static hooks/listeners`** — the runtime paves these onto `Base`
> (for re-composition safety). The `declare` keyword tells TS they exist on the
> static side **without emitting a field**; a real field would be clobbered by
> `useDefineForClassFields` and shadow the paved runtime value.

---

## 4. Two distinct mechanisms: lifecycle hooks vs events

This is the single most important thing to understand about `Triggerable` — it
provides **two different extension points with opposite contracts**.

### 4.1 Lifecycle hooks — middleware (synchronous, can reject)

```ts
type LifecyclePhase = "onInit" | "onConstruct" | "onUpdate" | "onDelete";
type LifecycleHook  = (target: any) => any;
```

- Run **during** an operation. May **transform** `target` and **return** a new
  value, or **throw to REJECT** the operation.
- Synchronous by contract.
- The unified `base.ts` constructor fires `onConstruct` (fresh) or `onUpdate`
  (reconstruction — detected via `UPDATE_PHASE`). `onDelete` is driven by the
  delete path (e.g. `Referencible`'s cascade). `onInit` is reserved.
- `Validatable` is the canonical consumer: it pushes its `onNew`/`onUpdate`
  enforcement in as `onConstruct`/`onUpdate` hooks.

### 4.2 Events — signals (async, never abort)

```ts
type ModelEvent =
  | "beforeUpdate" | "afterUpdate"
  | "beforeDelete" | "afterDelete"
  | "beforePersist" | "afterPersist";
```

- **Notification only.** Subscribers *cannot* abort the operation.
- May be async; the emitter does **not** await them inline (`emit` returns a
  `Promise` you *may* await if you need ordering).
- `emit` fans out via `Promise.all(subs.map(f => f(payload)))`.

### 4.3 The split, in one line

> **Hooks validate and reject; events notify and never block.** Put validation
> in a hook, not in an event subscriber.

### 4.4 Emission reality check (important)

Not every declared event is actually *fired*:

| Event | Emitted by core? |
| --- | --- |
| `beforePersist` / `afterPersist` | **Yes** — `Persistable.save()` fires both. |
| `beforeUpdate` / `afterUpdate` | **No.** No core mutation path (`base.update`, `Immutable.update`, `Versionable.update`) emits them. |
| `beforeDelete` / `afterDelete` | **No.** Same — the delete path does not emit them. |

`Persistable` *subscribes* to `after("Update")` (for `autoSave`) and
`after("Delete")` (for `autoDelete`), but those subscriptions only fire **once
an emitter is wired into the mutation path**. The seam exists by design; the
emitter side is intentionally left to the layers that own the mutation (the
HTTP `Servable`, the store wrapper, or the caller). Treat `autoSave` /
`autoDelete` as *ready but currently dormant* until that emitter lands.

---

## 5. `UPDATE_PHASE` — the reconstruction marker

`Immutable.update` does **not** mutate the instance. It builds `{ ...entity,
...patch, [UPDATE_PHASE]: true }` and constructs a brand-new object. The
`base.ts` constructor sees the marker, strips it, classifies the merged
candidate, and runs the `onUpdate` hooks (instead of `onConstruct`) so an
invalid patch is rejected *before* a new object escapes.

```
Immutable.update(patch)
   └─ new Ctor({ ...this, ...patch, [UPDATE_PHASE]: true })
         └─ base.ts constructor: isReconstruction ? runHooks(onUpdate)
                                         : runHooks(onConstruct)
```

The marker is the reason `Immutable` (and `Validatable`'s `onUpdate`) can reject
a bad patch through the same unified constructor — no second code path, no
public `isUpdate` flag. `Versionable.update` deliberately routes through
`Ctor.from` *without* this marker, so it runs `onConstruct` instead (the
`onUpdate`-stays-dormant` quirk documented in `capacity-versionable.md`).

---

## 6. The registration gate idiom

Every other capacity self-registers like this:

```ts
Base.prototype.capacities && Base.prototype.addCapacity("X");
```

If the `capacities` Set does not exist, the expression short-circuits and
registration is a **silent no-op**. That silence is exactly the guard
`Triggerable` is responsible for: a capacity composed *before* `Triggerable`
sits on a class with no Set, so it quietly fails to register.

`composeCapabilities` guarantees `Triggerable` is **always first and
de-duplicated**, so in normal usage the gate always passes. Manual composition
outside `composeCapabilities` does not get that guarantee.

---

## 7. Type-level vs runtime introspection

- **Runtime:** `instance.capacities` (a `Set<string>`) is the source of truth
  for "what is this model wearing." It is populated at *composition time*, not
  at instantiation — by the time you `new` an instance, every capacity name is
  already on the shared prototype Set.
- **Type-level:** `Triggerable` adds **no** instance/static types of its own.
  Introspection of the *mixed-in* APIs (`addHook`, `on`, `emit`, …) comes from
  the `declare static` statements and the `Composed` / `CapacityInstance` type
  fold in `compose.ts`. There is no `TriggerableInstance<T>` type to reach for.

---

## 8. Sibling capacities

| Capacity | How it leans on `Triggerable` |
| --- | --- |
| `Validatable` | Pushes its `onNew`/`onUpdate` enforcement into the `hooks` registry via `addLifecycleHook`. |
| `Identifiable` / `Immutable` / `Hashable` | Register their name via the `capacities` gate idiom. |
| `JsonSerialisable` / `Clonable` / `Comparable` / `Randomisable` | Pull their slice from `Base.prototype.schemaModule` (paved by `Triggerable`); gate registration on the Set. |
| `Persistable` | Consumes the **event** seam: `save()` emits `beforePersist`/`afterPersist`; subscribes `after("Update")` / `after("Delete")` for autoSave/autoDelete. |
| `Referencible` | Uses the synchronous `onDelete` **hook** to cascade-delete children (hook, not event — so it can run before commit). |
| `Derivable` | Uses the `onUpdate` **hook** to recompute derived attributes during update. |
| `Reactive` | Wraps `Triggerable.after("Update", fn)` — the emitter-centric alternative to owning the mutation. |

---

## 9. Gotchas

1. **Ordering is load-bearing.** A capacity applied *before* `Triggerable`
   never registers (tested: `Immutable(Triggerable(Identifiable(...)))` drops
   `Identifiable`). `composeCapabilities` saves you; manual composition does
   not. *(verified by `triggerable.test.ts`)*
2. **One Set per class, shared by all instances.** `addCapacity` from any
   instance writes into the *same* prototype Set. There is no per-instance
   registry — don't expect `a.capacities` to differ from `b.capacities`.
3. **Hooks reject; events don't.** Validation in an `on(...)` subscriber will
   *not* stop a `save()`. Put it in an `addHook("onUpdate", …)` (or let
   `Validatable` do it).
4. **`before/after Update`/`Delete` have no core emitter yet.** `autoSave` /
   `autoDelete` subscribe to events nothing currently fires — they are dormant
   until the mutation path emits them. `beforePersist`/`afterPersist` *do* fire.
5. **`emit` is fire-and-forget.** Core operations don't `await` it. If you need
   ordering/durability (e.g. `await persist`), `await` the `Promise` yourself.
6. **`before` / `after` return the unsubscribe closure.** Capture it if you need
   to detach a listener; `on` does too.
7. **`onInit` / `onDelete` are reserved/partial.** Core wires `onConstruct` /
   `onUpdate`; `onDelete` is driven by the delete path (e.g. `Referencible`);
   `onInit` is currently unused.

---

## 10. See also

- [`compose.ts`](./../src/capacities/compose.ts) — `Triggerable` auto-prepend +
  de-dupe, the `Composed` / `CapacityInstance` type fold.
- [`base.ts`](./../src/models/base.ts) — the unified constructor that consumes
  `hooks` and `UPDATE_PHASE`; `toValueObject`.
- [`persistable.ts`](./../src/capacities/persistable.ts) — the real consumer of
  the event seam (`beforePersist`/`afterPersist`, `after("Update")`/`after("Delete")`).
- [`validatable.md`](./capacity-validatable.md) — the canonical `hooks` consumer.
- [`immutable.md`](./capacity-immutable.md) — origin of the `UPDATE_PHASE` marker.
- [`introduction.md`](./capacity-introduction.md) — where `Triggerable` sits in
  the full capacity catalog and composition rules.
