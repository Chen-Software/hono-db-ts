# Capacity: `Meterable`

> A declarative **marker** capacity that opts a model's repository operations into
> metrics. It wraps no methods itself — it only stamps two statics (`isMeterable`,
> `meterName`) onto the adorned class for a (future) repository boundary to read.

---

## 1. What it is / is not

`Meterable` is the lightest possible kind of capacity: a **pure marker**. Enabling it
does one thing at compose time — it defines two static fields on the model's class:

| Static          | Type      | Meaning                                                                 |
| --------------- | --------- | ----------------------------------------------------------------------- |
| `isMeterable`   | `boolean` | `true` — signals a repository that this model's ops should be timed.    |
| `meterName`     | `string`  | Display prefix for operation metrics (`User.load`, `Post.create`, …).   |

What it is **not**:

- It is **not** a behaviour capacity. It adds no instance methods, no statics beyond
  the two above, no lifecycle hooks, no events.
- It does **not** itself time anything. The actual timing is supposed to happen at the
  **repository boundary**, which reads `isMeterable` / `meterName` and calls a
  telemetry recorder.
- It is **not** currently wired to any consumer in this codebase (see §6 — this is a
  real gap, not a usage error on your part).

In the capacity taxonomy it sits alongside `Queriable`, `Servable`, `Referencible`,
`Aggregable` as a **marker / opt-in** capacity: declare it, and a downstream layer
*should* react — but in this repo the downstream layer does not exist yet.

---

## 2. The marker

`Meterable` has **no schema marker type** (no `MeterableSchema`, unlike
`ImmutableSchema` / `VersionableSchema` / `Hashable`, and no `RandomisableSchema`). It
is purely infrastructural, like `Clonable` and `Comparable`.

It **is** registered in `compose.ts`'s `REGISTRY` (`["Meterable", Meterable]` at
`compose.ts:206`), so — unlike `Referencible` — it works in **both** declarative forms:

- ARRAY: `{ capacity: Meterable, options: { name: "User" } }` or `[Meterable]`
- OBJECT: `{ Meterable: { name: "User" } }` (resolved via `REGISTRY`)

An unknown object-form name still throws, but `Meterable` is a known name.

---

## 3. The runtime mixin

```ts
export const Meterable = <TBase extends CapacityComposer>(
	Base: TBase,
	_mod?: any,
	options: MeterableOptions = {},
	_ctx?: ComposeContext,
) => {
	const MeterableClass = class extends (Base as any) {
		static isMeterable = true;
		static meterName = options.name ?? (Base as any).schemaName ?? Base.name;
	};
	return MeterableClass as unknown as TBase & MeterableStatic;
};
```

Behaviour notes:

- It returns a **new subclass** (like `JsonSerialisable`, `Immutable`, `Triggerable`,
  `Clonable`, `Comparable`, `Randomisable`), *not* an in-place mutation like
  `ProtobufEncodable` or `Referencible`.
- The two statics are `static`, so they live on the class (not the instance) and are
  visible to `Repository` / `PostRepo` *statically*, without a live instance.
- `isMeterable` is always `true` (it can't be turned off per-model; you opt out by
  simply not declaring the capacity).

---

## 4. Composition

Enable it like any other capacity, with the optional `name` (the metric prefix):

```ts
import { Meterable } from "@/capacities/meterable";

defineModel(UserSchema, (t) => [
	Identifiable,
	Validatable,
	Persistable,          // ← the intended consumer (once it exists)
	{ capacity: Meterable, options: { name: "User" } },
	// or shorthand: [Meterable]  (meterName falls back to schemaName, see §5)
]);
```

In this repo `Meterable` is enabled on all five BBS models:

| Model    | `name`  | Source                                   |
| -------- | ------- | ---------------------------------------- |
| `User`   | `"User"`    | `src/models/user.ts:218`                 |
| `Post`   | `"Post"`    | `src/models/post.ts:258`                 |
| `Board`  | `"Board"`   | `src/models/board.ts:164`                |
| `Thread` | `"Thread"`  | `src/models/thread.ts:159`               |
| `Reply`  | `"Reply"`   | `src/models/reply.ts:159`                |

Each passes `name` explicitly, so the metric prefix matches the model name rather than
the schema name.

---

## 5. `meterName` derivation

```ts
static meterName = options.name ?? (Base as any).schemaName ?? Base.name;
```

Resolution order (left to right):

1. `options.name` — explicit, as in all five BBS models.
2. `Base.schemaName` — e.g. `"UserSchema"`, `"PostData"` — if you omit `name`.
3. `Base.name` — the JS class name, the final fallback.

If you **omit** `name`, the prefix becomes the schema name, which often differs from
the model/table/route name (e.g. `PostData.load` instead of `Post.load`). The
examples always pass `name`, so this fallback is rarely exercised — but it means the
capacity is not guaranteed to produce a "human" model name on its own.

---

## 6. The (missing) consumer — the real story

`meterable.ts`'s docstring claims the timing happens at the repository boundary:

> The actual timing happens at the repository boundary — `Repository.metered` for
> `User`, the equivalent private helper in `PostRepo` — which calls
> `queryTelemetry.recordOperation(...)`. That reuses the SAME in-memory collector +
> OTLP sink the driver-level query metrics use, so operation metrics show up in
> `/debug/operations` (dev) and as `db.client.operations.*` OTEL metrics (prod).

I grepped the entire `src/` tree for every identifier in that claim. **None of them
exist as code** — they appear only inside comments:

| Claimed identifier        | Where it's referenced               | Exists as code? |
| ------------------------- | ----------------------------------- | --------------- |
| `Repository` class        | `meterable.ts:33`, `user.ts:215`    | ❌ no `repository*.ts` |
| `PostRepo`                | `meterable.ts:34`, `post.ts:257`    | ❌ not present (see `versionable.md` — `PostRepo`/version-history store are unimplemented) |
| `Repository.metered`      | `meterable.ts:33`                   | ❌ only in comment |
| `queryTelemetry` module   | `meterable.ts:35-37`                | ❌ no `telemetry*.ts` |
| `recordOperation`         | `meterable.ts:35`                   | ❌ only in comment |
| `/debug/operations` route | `meterable.ts:9,37`                 | ❌ only in comment |
| `db.client.operations.*`  | `meterable.ts:37`                   | ❌ only in comment |

(`src/services/` contains only `event-bus.ts` and `transport.ts`; there is no
repository or telemetry module.)

**Conclusion:** `Meterable` is currently an **inert marker**. It correctly stamps
`isMeterable = true` and `meterName` onto the five models, but nothing reads those
statics. At runtime, enabling it has zero observable effect today.

To make it live, you'd need to:

1. Build the repository boundary (a `Repository` / `PostRepo` or an equivalent wrapper
   around the Drizzle client) that, **before each operation**, checks
   `Model.isMeterable` and, if `true`, starts a timer keyed by
   `Model.meterName + "." + op`.
2. Provide a `queryTelemetry` collector (`recordOperation(name, ms, ok)`) that buffers
   in memory and exports OTLP — and wire a `/debug/operations` dev route to read it.

Until then, treat `Meterable` as **documentation of intent**: "these five models should
be instrumented" — recorded in the capacity list, not yet enforced in code.

---

## 7. Type-level vs runtime

- **Runtime:** two statics on the class. Visible to anything that imports the composed
  model class. No instance-side footprint, so it's irrelevant to `Immutable` freeze,
  `Clonable` deep-copy, `JsonSerialisable` serialisation, and `Hashable`'s content
  address.
- **Type-level:** `compose.ts`'s fold surfaces `MeterableStatic` (`isMeterable`,
  `meterName`) as part of `CapacityInstance`, so a typed `Model.isMeterable` is
  available without `declare`. (The two are `static`, so they're not part of the
  instance shape either way.)

---

## 8. Composition with other capacities

`Meterable` is orthogonal to every other capacity — it touches neither the instance
nor the schema. It composes cleanly with anything, but its value depends on a
repository boundary that, today, does not exist.

- With `Persistable` / `SqlSerialisable`: the intended consumer would be the
  repository that `Persistable` generates — but `Persistable`'s runtime is itself
  partially unwired (see `persistable` / `triggerable` docs). `Meterable` only adds the
  opt-in signal; it does not create the timing.
- With `Servable` / `Queriable` / `Aggregable`: read-model routes could also be timed,
  but the same "no consumer" rule applies.
- With `Triggerable`: there is **no** hook or event that `Meterable` emits or consumes.
  They are unrelated except that both are opt-in markers.

---

## 9. Sibling capacities

| Capacity | Relationship |
| -------- | ------------ |
| `Queriable` / `Servable` / `Aggregable` | Shown alongside `Meterable` in the template examples; the operation timing would naturally attach to the repository/route layer those capacities generate. (Not yet wired.) |
| `Persistable` | The intended — but currently absent — consumer of `isMeterable` (the repository boundary it implies). |
| `Comparable` / `Clonable` / `Randomisable` | Other behaviour capacities that *do* add real runtime surface; `Meterable` adds none. |
| `Immutable` / `Versionable` / `Hashable` | Marker *types* (`…Schema`) that also gate behaviour; `Meterable` has no schema marker and gates nothing yet. |

---

## 10. Gotchas

1. **Inert today.** The single most important thing: `Meterable` has no consumer in
   this codebase. Declaring it sets two statics nobody reads — no metrics are emitted,
   in dev or prod. Don't expect `/debug/operations` or `db.client.operations.*` to
   appear until a repository boundary is built (see §6).
2. **`meterName` fallback mismatch.** Omit `name` and the prefix becomes
   `schemaName` (e.g. `PostData`), which may not match your table/route/model name.
   Always pass `name` explicitly, as the five BBS models do.
3. **No per-op API.** There is no `inst.meter()` / `Model.meter()`. It is a binary
   opt-in flag only. Any granularity (which ops, what dimensions) would live in the
   still-missing repository layer.
4. **Not the same as SQL query metrics.** The docstring describes sharing a sink with
   "driver-level query metrics" — but that telemetry module also doesn't exist yet. The
   two are conceptually distinct (operation-level vs driver-level) and neither is
   implemented.
5. **Opting out = not declaring it.** There's no `{ enabled: false }`. To stop a model
   being metered, remove the capacity (and, once a consumer exists, that consumer will
   then skip it because `isMeterable` will be `undefined`/`false`).

---

## 11. See also

- [Capacity introduction](./capacity-introduction.md) — where `Meterable` sits in the
  full catalog (and the "declare once" rule at §3).
- [Capacity queriable](./capacity-queriable.md) — example wiring (`Post`).
- [Capacity servable](./capacity-servable.md) — example wiring (`Thread`); the route
  layer a future consumer would time.
- [Capacity aggregable](./capacity-aggregable.md) — example wiring (`Thread`).
- [Capacity versionable](./capacity-versionable.md) — notes that `PostRepo` / the
  version-history store (a would-be `Meterable` consumer) are not yet implemented.
- [Data models & storage](./data-models-storage.md) — the canonical capacity lists for
  `User` / `Post` / `Board`.
