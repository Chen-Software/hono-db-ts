import type { tags } from "typia";
import type { CapacityComposer } from "./compose";

interface TimestampedSchema {
	/** Timestamp of entity creation. */
	created_at: string & tags.Format<"date-time">;
}

/**
 * Timestamped
 *
 */
function Timestamped<TBase extends CapacityComposer>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Timestamped");

	return class extends Base implements TimestampedSchema {
		// `declare` (type-only) — see Identifiable: a plain `readonly
		// created_at: string;` would reset the value after `super()` under
		// useDefineForClassFields. `declare` keeps the base-assigned value.
		declare readonly created_at: string;

		constructor(...args: any[]) {
			// Same two-arg/single-arg handling as `Identifiable`: only POP the
			// trailing `created_at` when a second argument is present, so the
			// model's `from(data)` (data carries `created_at`) is not stripped.
			if (args.length >= 2) {
				const created_at = args.pop();
				super(...args);
				this.created_at = created_at;
			} else {
				super(...args);
			}
		}
	};
}

export {
	Timestamped,
	type TimestampedSchema,
	type TimestampedSchema as TimeStampedSchema,
};
