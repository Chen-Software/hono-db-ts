import  typia from "typia";
import type { CapacityConstructor } from "./capable";

/**
 * Validatable
 * - has constraints, type guards, and validators
 * 
 * @param Schema the schema of the model.
 */
function Validatable<TBase extends CapacityConstructor, Schema extends TBase>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Validatable");
	// Base.prototype.assert = typia.createAssert<Schema>();
	// Base.prototype.validate = typia.createValidate<Schema>();
	// console.log(Schema);
	// console.log(typia.reflect.schema<Schema>());
	return class extends Base {
		constructor(...args: any[]) {
			super(...args);
			const states = args[0];
			this.assert(states);
		}
		assert(value: Schema) {
			return Base.prototype.assert(value);
		}
		validate(value: Schema) {
			return Base.prototype.validate(value);
		}
	};
}


export { Validatable };
