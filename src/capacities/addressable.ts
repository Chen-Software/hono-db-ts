import type { tags } from "typia";
import type { CapacityComposer } from "./compose";

interface AddressableSchema<T extends "url"> {
	url: (string | T) & tags.Format<"url">;
}

/**
 * Addressable
 *
 * @param FORMAT the format of the address.
 */
function Addressable<FORMAT extends "url", TBase extends CapacityComposer>(
	Base: TBase,
) {
	Base.prototype.capacities && Base.prototype.addCapacity("Addressable");

	return class extends Base implements AddressableSchema<FORMAT> {
		readonly url: string;

		constructor(...args: any[]) {
			const url = args.pop();
			super(...args);
			this.url = url;
		}
	};
}

export { Addressable, type AddressableSchema };
