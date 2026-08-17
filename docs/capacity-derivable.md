# Capacity: `Derivable`

> Computed / cached attributes that **re-materialise** when their dependencies
> change — in-process (eager) or via a bus topic (lazy, cross-process, scheduled).
> The capacity for "edit `name.en` → regenerate `name.de` (or mark it dirty for the
> next scheduled job)", which is a *derivation*, not a `Referencible` FK.

---

## 1. What it is / is not

`Derivable` maintains **derived attributes** — values computed from other fields
(`from`) via a `recompute(self, deps)` function. It is the explicit home for
"computed column" logic that should stay consistent as the model changes.

What it is **not**:

- It is **not** `Referencible`. An FK (`user.getPosts()`) navigates to *another
  entity*; a derived attr (`name.de`) is a *value computed from this entity's own
  fields*. Different problem, different capacity.
- It is **not** a schema marker. There is no `DerivableSchema` type — purely
  behavioural, like `Clonable` / `Comparable` / `Reactive`.
- It does **not** add a SQL-level computed column. All derivation is in-process (or
  bus-driven); `SqlSerialisable` knows nothing about it. If you want the derived value
  persisted, you must write it back yourself (the eager path does this into the live
  instance; the lazy path leaves it to a later re-materialisation).
- No model in this repo currently declares it (the old BBS `User.all_activities`
  example was removed with the forum counters). The capacity remains fully
  available — `src/models/user-derivable.test.ts` exercises it with a neutral
  inline `Quote` model (`total = rate × days`, see §4).

---

## 2. The marker

No schema marker type. `Derivable` **is** registered in `compose.ts`'s `REGISTRY`
(`["Derivable", Derivable]` at `compose.ts:198`), so both declarative forms work:

- ARRAY: `{ capacity: Derivable, options: { derived: [...] } }` (always needs
  `options.derived`, so the object form is unusual but valid).
- OBJECT: `{ Derivable: { derived: [...] } }` (resolved via `REGISTRY`).

It guards on `Triggerable` having paved `capacities` (`Base.prototype.capacities &&
Base.prototype.addCapacity?.("Derivable")`), so it must compose *after* `Triggerable`
— which `composeCapabilities` guarantees (it always prepends `Triggerable` first).

---

## 3. The runtime mixin (hybrid mutation)

`Derivable` is unusual: it is **sometimes in-place, sometimes a new subclass**.

```ts
let Out: any = Base;
if (bus) {
	const reactiveOpts = { bus, reactions: /* one per topic */ };
	Out = Reactive(Base, _mod, reactiveOpts, _ctx);   // ← new subclass
}
return Out;   // no bus → returns the SAME (mutated) Base
```

- **No `bus`** → it mutates `Base` in place: decorates `Base.prototype.recompute`,
  stamps `Base.recomputeFor` (static), and registers `onConstruct` / `onUpdate`
  lifecycle hooks. Same in-place style as `Referencible` / `ProtobufEncodable`.
- **With `bus`** → it internally folds `Reactive` (which returns a *new* subclass), so
  the returned class is a `Reactive` subclass with class-level topic subscriptions.

Either way, the instance/static surface it adds:

| Member                       | Kind     | Purpose                                                                 |
| ---------------------------- | -------- | ----------------------------------------------------------------------- |
| `inst.recompute(attr?)`      | instance | Force re-materialise one (or all) derived attrs on this instance.       |
| `Model.recomputeFor(id, attr?, event?)` | static | Re-materialise a (possibly persisted) instance **by id**, looked up via the identity map. |
| `inst.__dirty`               | instance | Per-instance map `{ [attr]: boolean }` — `true` while a lazy attr awaits a scheduled re-materialisation. |

`recomputeFor` resolves the target through `defaultIdentityMap.get(schemaName(),
String(id))`. **If the instance isn't loaded in the identity map, it returns
`undefined`** — by design (that's exactly what `lazy` + a `bus.drain` is for). It
cannot reach a row that's only in the database.

---

## 4. Composition

```ts
import { Derivable } from "@/capacities/derivable";

defineModel(UserSchema, (t) => [
	Identifiable,
	Validatable,
	{ capacity: Derivable, options: {
		bus: "translations",                 // optional; enables the reactive path
		derived: [
			{
				attr: "name.de",
				from: "name.en",
				recompute: (self, deps) => translate(deps["name.en"], "de"),
				// lazy: true,        // mark dirty + publish instead of computing now
				// topic: "user.name",// bus topic for cross-process recompute
				// reactive: true,    // (default) also wire a local Reaction
			},
		],
	}},
]);
```

`DerivedSpec` fields:

| Field       | Meaning |
| ----------- | ------- |
| `attr`      | The derived attribute to write, e.g. `"name.de"`. |
| `from`      | Dependency attr(s) it's computed from; a single string or an array. |
| `recompute` | `(self, deps) => value`. `deps` is `{ [from]: value }`. |
| `lazy?`     | If true, a dep change marks `attr` **dirty + publishes** instead of computing in-process. The real re-materialisation happens when a `Reactive` reaction (or a scheduled `bus.drain`) delivers the event. |
| `topic?`    | Bus topic published to on a dep change **and** subscribed from for re-materialisation. Omit for purely in-process derived state. |
| `reactive?` | When `false`, the topic is published but **no immediate `Reactive` reaction is wired here** — only a scheduled `bus.drain` / external subscriber picks it up. Defaults to `true`. |

### Example — derivation reads *local* fields, not `Referencible` navigation

The capacity's reference spec (in `src/models/user-derivable.test.ts`) derives
`total` from two stored fields, `rate` and `days`
(`from: ["rate", "days"]`). It does **not** read `Referencible`'s inverse accessors
(e.g. `user.getRepositories().length`). This is a deliberate boundary, for three
reasons:

1. **Derivable's model is local.** `compute(self, deps)` reads `inst[dep]` — instance
   fields on *this* entity. `getRepositories()` is an *identity-map scan across other
   instances*, not a field on `self`. Feeding a navigation method into a derivation
   would require `Derivable` to understand cross-instance methods, which it
   deliberately does not.
2. **`.length` is non-authoritative.** `getRepositories()` returns a plain **array**
   whose `.length` only counts instances *currently registered in the identity map
   this session*. Across processes, after a restart, or on a partially-loaded server
   it returns `[]` or an under-count. A derived attr exists to be a **persisted,
   sortable** column — a session-local count would defeat that.
3. **The stored fields are the source of truth.** `rate` / `days` are maintained by
   the write path and persisted as columns. `total` is a cheap product over them —
   never an expensive relation walk.

If you ever want a *session-local* "how many repositories are loaded for this user
right now" number, that is a **navigation convenience**, not a derived property — add
a separate runtime method (`User.prototype.activeRepoCount = function () { return
this.getRepositories().length; }`). Authoritative totals come from SQL (an
`Aggregable` `count` by `ownerId`, or `/repositories/aggregate?groupBy=ownerId`).

**Current usage:** no model in this repo declares `Derivable` (the old
`User.all_activities` spec was removed with the BBS counters); the `Quote` model in
`src/models/user-derivable.test.ts` is the reference example. The `Hashable`
`contentHash` recompute is a conceptual cousin but uses its own machinery, not
`Derivable`.

---

## 5. The two trigger paths

`Derivable` composes two trigger mechanisms from the event seam:

### (A) In-process — `onUpdate` lifecycle hook (synchronous, eager)

Registered as `addLifecycleHook(Base, "onUpdate", (inst, patch) => onChanged(inst,
patch))`. When a dependency appears in `patch`, `materialise` runs and (by default)
computes the new value into the live instance immediately, so it commits atomically
with the update. This is the same thing you could hand-roll with `Triggerable`'s
`onUpdate` today — sufficient when everything is same-process and the entity is live.

### (B) Reactive — `lazy` + `topic` via a bus

If `bus` is supplied, `Derivable` folds `Reactive` so each `topic` becomes a
**class-level subscription** that calls `recomputeFor(id, attr)` when *any* producer
publishes. The trigger source is opaque — an in-process update, a remote translation
service, a webhook, or a `bus.drain` on a schedule all look identical to the model.
This is what `Triggerable`'s emitter-centric `after("Update", …)` **cannot** do: reach
a persisted-but-unloaded entity or a remote one.

The `bus` is resolved through `BusRegistry` (name or instance), exactly like
`Reactive` / `Persistable`'s `StoreRegistry`.

---

## 6. `materialise` / `compute` semantics + `__dirty`

`materialise(inst, spec)` decides what happens when a dependency changes:

1. Read the current dep values from `inst`.
2. If `spec.lazy`, set `inst.__dirty[spec.attr] = true` (awaiting later re-materialisation).
3. If `bus && spec.topic`, **publish** `{ id, attr, deps }` — shipping the *new* dep
   values so any subscriber re-materialises from the post-update state.
4. If `!spec.lazy || spec.reactive !== false`, **compute** in-process (so the local
   replica is consistent immediately), which in turn clears `__dirty[attr]`.

So the effective modes:

| `lazy` | `reactive` | `topic` | On dep change                              |
| ------ | ---------- | ------- | ------------------------------------------ |
| false  | –          | –       | compute now (eager, in-process).           |
| true   | true (def) | set     | mark dirty + publish + compute now (local consistent, remote converges). |
| true   | false      | set     | mark dirty + publish only (eventual — a `bus.drain` / external subscriber re-materialises later). |

`compute` prefers values carried in the event payload (`event.deps`) over reading the
live instance, so a reactive re-materialisation triggered during an update hook still
uses the **new** deps, not the not-yet-committed live ones.

---

## 7. Type-level vs runtime

- **Runtime:** the `recompute` / `recomputeFor` methods and the `__dirty` map are added
  at compose time. `recomputeFor` is a `static` (visible without an instance);
  `recompute` is on the prototype.
- **Type-level:** `compose.ts`'s fold does **not** declare `recompute` / `recomputeFor`
  / `__dirty` in the `CapacityInstance` shape (there's no `DerivableStatic` interface in
  the type-fold). So, like `Referencible`'s `getX()` accessors, the derived API is
  **runtime-valid only** — TypeScript won't see `inst.recompute()` unless you `declare`
  it on the model.

---

## 8. Composition with other capacities

| Capacity | Interaction |
| -------- | ----------- |
| `Triggerable` | `Derivable` is a **hook consumer**: it registers `onConstruct` / `onUpdate` via `addLifecycleHook` (paved by `Triggerable`). |
| `Reactive` | With a `bus`, `Derivable` **folds `Reactive`** internally — returns a `Reactive` subclass with class-level topic subscriptions. `Reactive` is the inversion of `Triggerable` that makes cross-process re-materialisation possible. |
| `Immutable` | ⚠️ **Two frictions** (see §10): (1) the `onUpdate` reconstruction path doesn't forward `patch`, so eager recompute is skipped on `Immutable.update`; (2) `compute` writes `inst[attr]` in place, which **throws on a frozen instance** reached via the reactive path. |
| `Versionable` | ⚠️ `Versionable.update` reconstructs via `Ctor.from` **without** the `UPDATE_PHASE` marker, so `onUpdate` never fires — eager recompute is entirely dormant on `Versionable` models. |
| `Validatable` | `Derivable`'s `onUpdate` runs in the same hook chain; if `Validatable` is also set to `onUpdate: "assert"`, an invalid patch is rejected before `Derivable` recomputes (hooks run in registration order). |
| `Hashable` | Conceptual cousin: `Hashable` also recomputes a derived value (`contentHash`) on content change — but it does so with its own mutation-half machinery, not via `Derivable`. |

---

## 9. Sibling capacities

| Capacity | Relationship |
| -------- | ------------ |
| `Reactive` | The subscriber-centric engine `Derivable` reuses for the `lazy`/`topic` path. (Doc: [capacity-reactive.md](./capacity-reactive.md).) |
| `Triggerable` | Provides the `onUpdate` / `onConstruct` hook seam `Derivable` plugs into. (Doc: [capacity-triggerable.md](./capacity-triggerable.md).) |
| `Referencible` | *Navigational* relations (FKs); `Derivable` is *computed* values. Often confused — deliberately kept separate. |
| `Hashable` | Also maintains a derived value, but via `Sha256` content addressing, not a `DerivedSpec`. |
| `Meterable` | Marker only; orthogonal — would time the `recomputeFor` call if its (unwired) consumer existed. |

---

## 10. Gotchas

1. **Automatic recompute only fires through the base *mutable* `update()`.** `runHooks`
   (in `base.ts`) forwards `patch` to `onUpdate` **only** on the mutable path
   (`runHooks(onUpdate, candidate, patch)`). The reconstruction path used by
   `Immutable.update` calls `runHooks(onUpdate, this)` with **no patch**, so
   `Derivable`'s `onChanged` sees an empty patch and skips. And `Versionable.update`
   reconstructs via `Ctor.from` **without** the `UPDATE_PHASE` marker, so `onUpdate`
   doesn't fire *at all*. Net: on `Immutable` and `Versionable` models (exactly the BBS
   models), a dependency edit does **not** auto-recompute the derived attr. You must
   call `inst.recompute()` manually, or drive it through a `bus` topic that an external
   producer publishes to.
2. **`compute` mutates `inst[attr]` in place → throws on a frozen `Immutable`
   instance.** The reactive path resolves the target from the identity map and calls
   `inst.recompute()` → `compute` → `inst[attr] = …`. If that resident instance is
   `Immutable`-frozen, that assignment throws. The reactive re-materialisation is only
   safe for **non-frozen** instances. (The construct-time compute is fine, because it
   runs inside the constructor *before* `Object.freeze`.)
3. **`recomputeFor` only reaches identity-map-resident instances.** If the target isn't
   loaded in `defaultIdentityMap`, it returns `undefined` and does nothing. That's the
   intended hook for `lazy` + scheduled `bus.drain`, but it means a persisted-but-uncached
   entity won't re-materialise until something reloads it into the map first.
4. **`__dirty` is only meaningful for the `lazy` + `reactive:false` (scheduled) path.**
   For eager (`lazy:false`) and `lazy`+`reactive` specs, `compute` clears the flag right
   after setting it, so `__dirty` is effectively always `false` for those.
5. **Has a focused test file.** `src/models/user-derivable.test.ts` exercises
   the `Derivable` capacity with an inline `Quote` model (construct-time compute;
   dep-change → recompute via `update`). The `Derivable`-folds-`Reactive` mechanics
   are still only covered indirectly. Additional focused tests — `bus` topic →
   `recomputeFor`; frozen-instance throw; unloaded `recomputeFor` → `undefined` —
   would further harden it.
6. **Hybrid return value.** Returning `Base` (in-place) without a `bus` but a new
   `Reactive` subclass with one means callers can't assume a stable class identity the
   way they can for purely in-place or purely new-subclass capacities.

---

## 11. See also

- [Capacity introduction](./capacity-introduction.md) — `Derivable` in the full catalog.
- [Capacity reactive](./capacity-reactive.md) — the bus engine `Derivable` folds for
  the `lazy`/`topic` path (and the `__reactiveWired` de-dupe detail).
- [Capacity triggerable](./capacity-triggerable.md) — the `onUpdate` / `onConstruct`
  hook seam and the `UPDATE_PHASE` marker that governs whether `Derivable`'s hook fires.
- [Capacity immutable](./capacity-immutable.md) — the `UPDATE_PHASE` reconstruction path
  (no patch forwarded → see Gotcha 1) and the freeze that breaks in-place `compute`.
- [Capacity versionable](./capacity-versionable.md) — `update` suppresses `onUpdate`
  (Gotcha 1) and `PostRepo`/history store that would be a `Derivable` consumer are
  unimplemented.
- [Capacity referencible](./capacity-referencible.md) — the FK-navigation sibling,
  deliberately separate from derivation.
- [Capacity hashable](./capacity-hashable.md) — another "recompute a derived value on
  change" pattern, done with `Sha256` content addressing.
