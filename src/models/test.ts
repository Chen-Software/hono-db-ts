import typia, { type IMetadataSchemaUnit, type tags } from "typia";
import { Capable } from "@/capacities/capable";
import { Identifiable, type UUID } from "@/capacities/identifiable";
import { Immutable } from "@/capacities/immutable";
import { Validatable } from "@/capacities/validatable";

class Animal implements Schema {
	name: string;
	constructor(public props: Record<string, any>) {
		this.name = props["name"];
	}
}

interface Schema {
	name: string & tags.MinLength<5>;
}

const schema = typia.reflect.schema<Schema>();
console.log(schema);

const capable = Capable(Animal);
console.log(capable);
console.log(capable.prototype.capacities);

const identifiable = Identifiable(capable);
console.log(identifiable);
console.log(identifiable.prototype.capacities);

const immutable = Immutable(identifiable);
console.log(immutable);
console.log(immutable.prototype.capacities);

// const a = Immutable(Identifiable(Capable(Animal)));
// console.log('dddd', a.prototype.capacities, a.prototype.schema);

// // const schem: IMetadataSchemaUnit = typia.reflect.schema();
// // schem(new Animal)
// // console.log(schem);

const validatable = Validatable(immutable, {
	assert: typia.createAssertEquals<Schema>(),
	assertGuard: typia.createAssertGuardEquals<Schema>(),
	validate: typia.createValidateEquals<Schema>(),
});
console.log(validatable.prototype.validators);
class ValidatedModel extends validatable {}
// const a = new ValidatedModel('dsfa');
// const b = new ValidatedModel('dsfa555');
const b = new ValidatedModel({ name: "ddddddd" });
console.log(b);
// console.log(validatable.prototype.capacities);
// // const b = validatable.new({ name: "Donald" });
// // class Duck extends Swimmable(Flyable((Animal))) {}

// // const duck = new Duck("Donald");

// // duck.fly();
// // duck.swim();
// // duck.walk();
