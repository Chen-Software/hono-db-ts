import type { tags } from "typia";
import type { CapacityComposer } from "./compose";

interface IdentifiableSchema<TID> {
	readonly id: TID | (string & tags.Format<"uuid">);
}

/**
 * Identifiable
 *
 * @param TID the type of the id.
 */
function Identifiable<TID extends "uuid", TBase extends CapacityComposer>(
	Base: TBase,
) {
	Base.prototype.capacities && Base.prototype.addCapacity("Identifiable");

	return class extends Base implements IdentifiableSchema<TID> {
		// `declare` (type-only) — under useDefineForClassFields a plain
		// `readonly id: TID;` field declaration with no initialiser would
		// RESET `id` to `undefined` after `super()` (Model assigns it from
		// the data). `declare` erases the runtime initialiser so the value
		// set by the base constructor survives.
		declare readonly id: TID;

		constructor(...args: any[]) {
			// Support BOTH the single-arg `new X(data)` form (the model's
			// `from(data)` path, where `id` lives ON the data) and the legacy
			// two-arg `new X(data, id)` override form. Only POP the trailing
			// `id` when a second argument is actually present — otherwise we
			// would strip `data` off `args` and hand `Model` an empty
			// constructor, which fails classification.
			if (args.length >= 2) {
				const id = args.pop();
				super(...args);
				this.id = id;
			} else {
				super(...args);
				if ((this as any).id == null) (this as any).id = crypto.randomUUID();
			}
		}
	};
}

export { Identifiable, type IdentifiableSchema };
