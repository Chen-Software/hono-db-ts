import { type tags } from "typia";
import type { CapacityConstructor } from "./capable";

/**
 * Identifiable
 *
 * @param ID_TYPE the type of the id.
 */
function Identifiable<TID, TBase extends CapacityConstructor>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Identifiable");

	return class extends Base implements IdentifiableState<TID> {
		readonly id: TID;

		constructor(...args: any[]) {
			super(...args);
			const states = args[0];
			const { id } = states;
			this.id = id;
		}
	};
}

interface IdentifiableState<ID_TYPE = string & tags.Format<"uuid">> {
	readonly id: ID_TYPE;
}

export { Identifiable, type IdentifiableState};
