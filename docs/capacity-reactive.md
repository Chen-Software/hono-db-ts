# Capacity: `Reactive`

> **Subscriber-centric event wiring.** A *capacity*, not the bus. The model
> names a topic + handler and reacts to a stream it never has to import — the
> trigger source stays opaque (in-process `update`, remote service, webhook, or
> a scheduled `bus.drain` all look identical to the subscriber).

---

## 1. What `Reactive` is (and is not)

`Reactive` declares that **this model reacts to named bus topics**. The wiring
lives on the *subscriber* (this model), so the model never imports its trigger
source — it just names a `topic` and a `handler`. The handler runs with
`(event, Ctor)` and may be async (the bus does not await it).

It is **not**:

- the event bus itself. `Reactive` is a capacity; the bus is an app-service
  (`src/services/event-bus.ts`) injected by name through `BusRegistry`. The
  model never touches a bus directly except via `Reactive`'s instance
  `subscribe`.
- `Triggerable`. `Triggerable.after("Update", fn)` is **emitter-centric** — you
  wire the effect *onto the model that fires `update`* (source-coupled, in
  process). `Reactive({ topic, handler })` is **subscriber-centric** — the model
  reacts to a topic *any* producer may publish (decoupled, possibly remote).
- a schema marker. Like `Triggerable` / `Clonable`, it adds no type contract of
  its own; it is purely behavioural.
- a validator or serializer. It stores nothing on the instance.

**Source:** `src/capacities/reactive.ts`. **Dependency:** `src/services/event-bus.ts`
(`InMemoryBus`, `BusRegistry`). **No dedicated test file** — its behaviour is documented by source + the `event-bus`
tests, and exercised indirectly only when something folds it (e.g. `Derivable`, which
has no test of its own either — see [capacity-derivable.md](./capacity-derivable.md) §10).

---

## 2. The marker

There is **no marker** type (no `ReactiveSchema`). `Reactive` is opted into
declaratively in the capacity list and contributes nothing to a model's type
shape. Introspect at runtime via `instance.capacities.has("Reactive")`.

---

## 3. The mixin — what it adds

`Reactive(Base, _mod, options)` returns `class extends Base` and:

| Member | Kind | Purpose |
| --- | --- | --- |
| `prototype.capacities` | `Set<string>` | Gains the `"Reactive"` name (gated on `Triggerable`'s registry). |
| `static` class-level reactions | wired at compose time | Each `{ topic, handler }` in `options.reactions` is subscribed on the bus **once per composed class** (guarded by `__reactiveWired`). |
| `instance.subscribe(topic, handler)` | method | Per-instance subscription (e.g. a live model listening for remote patches about its own `id`). **Returns an unsubscribe function.** |

### Options

| Option | Type | Meaning |
| --- | --- | --- |
| `bus` | `EventBus \| string` | Bus to subscribe through. An instance, or a name in `BusRegistry`. Omit → `BusRegistry.default()` (an in-memory bus, created on first use). |
| `reactions` | `ReactiveReaction[]` | Class-level `{ topic, handler }` pairs to subscribe at compose time. `handler` is either a **method name** on the model class or a `(event, Ctor) => …` fn. |

### Handler resolution

```ts
const fn =
  typeof r.handler === "string"
    ? (event) => Base[r.handler]?.(event, Base)   // method name → called with (event, Ctor)
    : (event) => r.handler(event, Base);          // fn → called with (event, Ctor)
bus.subscribe(r.topic, fn);
```

So a string handler is looked up as an own method on the composed class; a fn
handler receives both the `event` payload and the `Ctor` (handy for `static`
re-materialisation, as `Derivable` does).

---

## 4. The subscriber-centric model (vs `Triggerable`)

This is the conceptual core of the capacity. Two ways to express "do X when
something changes":

| | `Triggerable.after("Update", fn)` | `Reactive({ topic, handler })` |
| --- | --- | --- |
| Coupling | **Emitter-centric** — effect wired onto the model that fires `update`. | **Subscriber-centric** — the reacting model names a topic. |
| Source | Must be in-process and must call `emit("afterUpdate")`. | Any producer of `topic` — in-process, remote, webhook, scheduled drain. |
| Import | The source and effect are coupled. | The subscriber **never imports its trigger source**. |
| Reach | Only a live, in-memory instance. | Can reach a persisted-but-unloaded or remote entity (via `recomputeFor` / reload). |

> `Reactive` is the *push* analogue of the repo/*pull* pattern: instead of a
> model asking a repository "what changed?", it subscribes to a named stream
> and re-materialises itself when events arrive.

---

## 5. Wiring lifecycle & idempotency

Class-level reactions are subscribed **once per composed class**, guarded by a
`__reactiveWired` flag on `Base`:

```ts
if (!(Base as any).__reactiveWired) {
  (Base as any).__reactiveWired = true;
  for (const r of reactions) bus.subscribe(r.topic, fn);
}
```

Why: `composeCapabilities` can fold the same `Base` multiple times (and
`Derivable` folds `Reactive` internally). Without the guard, reactions would
subscribe repeatedly and fire N times per event. The flag dedupes them.

Per-instance `subscribe(topic, handler)` is **not** guarded — each call returns
its own unsubscribe closure, so callers manage their own lifecycle (e.g. a live
UI component subscribes on mount and unsubscribes on unmount).

---

## 6. Bus dependency & DI seam

`Reactive` resolves its bus through `BusRegistry` (mirrors `StoreRegistry` from
`Persistable`). Swap the implementation per deploy without touching the model:

- omit `bus` → `BusRegistry.default()` (in-process `InMemoryBus`);
- name a registered bus → `BusRegistry.resolve(name)`;
- pass an instance → used directly.

`InMemoryBus` additionally supports **durable topics** (rolling history +
`replay`) and a **scheduled `drain`** — the "re-materialise derived state on the
next scheduled job" pattern. A remote/Redis/NATS bus can be plugged in behind
the same `EventBus` interface.

---

## 7. Type-level vs runtime

- **Runtime:** `instance.capacities.has("Reactive")` and the bus subscriptions
  are the source of truth. Reactions are wired at *composition time*.
- **Type-level:** `Reactive` adds **no** instance/static types — there is no
  `ReactiveInstance<T>`. `instance.subscribe` is reachable only through the
  `declare`/mixin surface; if you need it typed on a model, rely on the
  `Composed` / `CapacityInstance` fold in `compose.ts` (it surfaces the
  `subscribe` method once `Reactive` is in the list).

---

## 8. Sibling capacities

| Capacity | Relationship |
| --- | --- |
| [`Triggerable`](./capacity-triggerable.md) | The emitter-centric counterpart. `Reactive` inverts `Triggerable.after(...)`: the subscriber declares what it reacts to, not the source. Both lean on `Triggerable`'s registry (registration-gated). |
| [`Derivable`](./capacity-derivable.md) | **The primary consumer.** When given a `bus`, `Derivable` *internally folds `Reactive`* so each `topic` becomes a class-level subscription calling `recomputeFor(id, attr)` — i.e. the model reactively receives the stream and re-materialises itself. This is what `Triggerable`'s in-process `onUpdate` hook *cannot* do: reach a persisted-but-unloaded or remote entity. |
| `Persistable` | Pairs naturally: a `Persistable` save (or a remote write) can `publish` to a topic; a `Reactive` model elsewhere re-materialises. The two are decoupled by the bus. |

---

## 9. Gotchas

1. **No dedicated test harness.** `reactive.ts` has no `reactive.test.ts`;
   behaviour is covered indirectly via `Derivable`. If you change `Reactive`,
   add a focused test (subscribe → publish → handler fires, unsubscribe stops
   it, `__reactiveWired` dedupes) rather than relying on `Derivable`.
2. **`__reactiveWired` is a shared, sticky flag.** Once a class is wired, later
   `Reactive` folds on the same `Base` (e.g. `Derivable` re-folding) will *not*
   re-subscribe — reactions from the later fold are silently skipped. Keep all
   class-level `reactions` in the *first* `Reactive` application, or merge them
   upstream before folding.
3. **Handlers are fire-and-forget.** The bus does not await them, and a
   throwing handler does not roll back the publish. Wrap async work in
   try/catch inside the handler.
4. **String handlers are looked up on the composed class at call time**
   (`Base[handler]?.(event, Base)`), so a typo'd method name fails *silently*
   (`?.` guards it) — the reaction subscribes but never does anything.
5. **No `Triggerable` → no registration.** Like every capacity, `Reactive`
   gates on `Base.prototype.capacities`. `composeCapabilities` guarantees
   `Triggerable` is first; manual composition does not.
6. **Per-instance `subscribe` is unguarded and unmanaged.** You must call the
   returned unsubscribe (or risk leaking handlers for the instance's lifetime).
   Don't confuse it with the one-time class-level `reactions`.
7. **Topic collisions are bus-global.** If two models subscribe to the same
   `topic`, both fire on every publish. Namespace topics (e.g.
   `${schemaName}/:id/patched`) to avoid cross-talk.

---

## 10. See also

- [`triggerable.md`](./capacity-triggerable.md) — the emitter-centric counterpart;
  `Reactive` is its inversion.
- [`event-bus.ts`](./../src/services/event-bus.ts) — the `EventBus` interface,
  `InMemoryBus` (durable topics + `drain`), and `BusRegistry` DI seam.
- [`derivable.ts`](./../src/capacities/derivable.ts) — the primary consumer;
  folds `Reactive` to re-materialise derived attributes from bus topics.
- [`compose.ts`](./../src/capacities/compose.ts) — `Reactive` is registered in
  `REGISTRY` (`["Reactive", Reactive]`), so it composes via the capacity list.
- [`introduction.md`](./capacity-introduction.md) — `Reactive` in the full
  capacity catalog.
