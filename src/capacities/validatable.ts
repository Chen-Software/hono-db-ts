import { type AssertionGuard, type IValidation } from "typia";
import type { CapacityConstructor } from "./capable";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Validatable
 * - has constraints, type guards, and validators
 * 
 * @param Schema target type to validate against.
 */
function Validatable<TBase extends CapacityConstructor, Schema>(Base: TBase, validators: {assert?: (input: unknown) => Schema, assertGuard?: AssertionGuard<Schema>, validate?: ((input: unknown) => IValidation) & StandardSchemaV1}) {
	Base.prototype.capacities && Base.prototype.addCapacity("Validatable");
	Base.prototype.validators = validators;

	// Base.prototype.assert = typia.createAssert<Schema>();
	// Base.prototype.validate = typia.createValidate<Schema>();
	// console.log(Schema);
	// console.log(typia.reflect.schema<Schema>());
	return class extends Base {
		// static assert = typia.createAssert<Schema>();
		// static validate = typia.createValidate<Schema>();
		constructor(...args: any[]) {
			super(args);
			return Base.prototype.validators.assertGuard && Base.prototype.validators.assertGuard(args) || Base.prototype.validators.assert && Base.prototype.validators.assert(args) ;
		}
	};
}


export { Validatable };
