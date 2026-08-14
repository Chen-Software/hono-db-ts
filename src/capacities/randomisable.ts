import type { CapacityComposer } from "./compose";

/**
 * RandomisableSchema — the type-level capacity marker. A schema that "is
 * Randomisable" declares it can be materialised as a random, schema-valid
 * instance, with a recorded seed for reproducibility. Pure marker (like
 * `ImmutableSchema`); the runtime behaviour lives in the {@link Randomisable}
 * mixin below. The capacity's surface is STATIC (`Model.random()` /
 * `Model.randomSeed()`), so the marker carries no instance members — it exists
 * for consistency with the other capacity markers and for composition
 * intersections (`Foo = … & RandomisableSchema`).
 */
type RandomisableSchema = Record<never, never>;

/**
 * Options for the {@link Randomisable} capacity.
 *
 * - `seedField` — the instance field that receives the generated seed. Defaults
 *   to `"seed"`. Point it at a field your schema actually declares if you want
 *   the seed persisted on the entity (e.g. a deterministic `id`/nonce). If the
 *   schema has no such field, the seed still flows through construction but is
 *   dropped by `classify` (it stays observable only via lifecycle hooks).
 */
export interface RandomisableOptions {
	seedField?: string;
}

/**
 * Randomisable — equips a class with `random()` / `randomSeed()`, a static
 * factory pair that materialises a random, *validated instance* for the model.
 *
 * Adds to the adorned class:
 *   - `static random()`        — a **validated model instance** (via `new Ctor()`).
 *   - `static randomSeed()`     — draw a fresh, well-distributed 32-bit seed.
 *
 * `random()`:
 *   Returns a fully-constructed **instance**, NOT raw data: it pipes typia's
 *   `createRandom` payload (`SchemaModule.random`) through `new this(...)`, so
 *   every capacity that hooks construction — `Validatable`, `Immutable`
 *   (freeze), `Versionable`, … — applies. When the model wears `Immutable`, the
 *   returned instance is already frozen.
 *
 *   Because it classifies, the payload must satisfy the schema's **format**
 *   constraints (`uuid`, `email`, `Format<"sha256">`, …). For models whose
 *   `createRandom` does not emit format-valid fields (e.g. `Post`'s `contentHash`),
 *   bind a corrected generator in the schema module (`random: () => …`) or supply
 *   the overrides after drawing — the seam (`mod.random`) is the correct place to
 *   fix format-bound values.
 *
 * Typical usage:
 *   const post = Post.random();              // validated instance (frozen if Immutable)
 *   const data = post.toValueObject();       // unwrap to a plain mutable record
 *   const next = Post.from({ ...data, title: "x" });
 *
 * **Determinism caveat.** `SchemaModule.random` is typia's `createRandom`, which
 * is *not* seedable — so `random()`'s payload is never reproducible. If you need
 * determinism, bind a seeded generator in your schema module
 * (`random: () => seededFoo(seed)`) and have `random()` consume it; the seam
 * (`mod.random`) is already here.
 */
function Randomisable<TBase extends CapacityComposer>(Base: TBase): TBase {
	Base.prototype.capacities && Base.prototype.addCapacity("Randomisable");

	const RandomisableClass = class RandomisableClass
		extends Base
		implements RandomisableSchema
	{
		static random = () => {
			// Draw the raw typia payload, then construct a validated instance so
			// ALL construction-time capacities apply — `Validatable` (assert),
			// `Immutable` (freeze → the instance is frozen), `Versionable`, etc.
			// Callers that need the raw shape unwrap with `.toValueObject()`.
			const data = Base.prototype.schemaModule.random();
			return new RandomisableClass(data);
		};
	};

	return RandomisableClass;
}

export { Randomisable, type RandomisableSchema };
