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
 * factory pair that materialises a random, *shape-valid* payload for the model.
 *
 * Adds to the adorned class:
 *   - `static random()`        — a raw, schema-shaped random payload.
 *   - `static randomSeed()`     — draw a fresh, well-distributed 32-bit seed.
 *
 * `random()`:
 *   Returns **raw data**, NOT a validated instance. typia's `createRandom`
 *   (`SchemaModule.random`) honours the *shape* of the schema but does **not**
 *   honour format constraints (`uuid`, `email`, `Format<"blake3">`, …). Piping
 *   that payload straight through `from()`/`new Ctor()` (which `classify`)
 *   therefore throws on the first format field — and, worse, on *nested* ones
 *   (`author.id`, `author.email`) that a generic capacity cannot patch. So the
 *   contract here is: give the caller a correct-shaped base, and let them stamp
 *   the few format-bound fields before classifying. This is exactly how typia's
 *   `createRandom` is meant to be consumed (tests, seed scripts, fixtures).
 *
 * Typical usage (see `scripts/seed.ts`):
 *   const data = Post.random();
 *   data.id = crypto.randomUUID();           // fix uuid
 *   data.authorId = user.id; data.author = user;
 *   data = withContentHash(data, "body");    // fix blake3 contentHash
 *   const post = Post.from(data);            // now validates
 *
 * **Determinism caveat.** `SchemaModule.random` is typia's `createRandom`, which
 * is *not* seedable — so `random(seed)`'s payload is never reproducible. If you
 * need determinism, bind a seeded generator in your schema module
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
			// Return RAW, unvalidated random schema data. typia's `createRandom`
			// honours the *shape* of the schema but NOT format constraints
			// (uuid, email, …), so funneling this through `from`/`classify` would
			// throw on the first format field. Returning the raw payload lets the
			// caller (seed scripts, tests) use it as a base and override only the
			// few constrained fields before classifying.
			return Base.prototype.schemaModule.random();
		};
	};

	return RandomisableClass;
}

export { Randomisable, type RandomisableSchema };
