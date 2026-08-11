import type { tags } from "typia";
import type { CapacityConstructor } from "./capable";

/**
 * Identifiable
 *
 * @param ID_TYPE the type of the id.
 */
function Identifiable<TID = "uuid", TBase extends CapacityConstructor>(
	Base: TBase,
) {
	Base.prototype.capacities && Base.prototype.addCapacity("Identifiable");

	return class extends Base implements IdentifiableSchema<TID> {
		readonly id: TID;

		constructor(...args: any[]) {
			const id = args.pop();
			super(...args);
			this.id = id || crypto.randomUUID();
		}
	};
}

interface IdentifiableSchema<TID> {
	readonly id: TID | (string & tags.Format<"uuid">);
}

export { Identifiable, type IdentifiableSchema };
