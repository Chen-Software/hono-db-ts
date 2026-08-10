/**
 * Capable
 * - has capacities.
 *
 * This must be the before any other capacity you want to track
 * in the chain, ideally the first one after your model class.
 * 
 * @alis Constructable
 */
function Capable<TBase extends CapacityConstructor>(Base: TBase) {
	const capacities = new Set<string>(["Capable"]);
	Base.prototype.capacities = capacities;
	Base.prototype.addCapacity = (capacity: string) => {
		capacities.add(capacity);
	}
	return Base;
}

type CapacityConstructor<T = {}> = new (...args: any[]) => T;

export { Capable, type CapacityConstructor };
