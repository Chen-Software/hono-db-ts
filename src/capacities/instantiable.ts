import typia, { type Classifiable } from "typia";

interface Instantiable<Model> {
	new (...args: any[]): Model;
	from(seed: Classifiable<Model>): Model;
}

const input = { data: "payload", config: { a: 1, b: 2 } };
const createInstance = typia.plain.createValidateClassify<typeof input>();
console.log(createInstance(input));

export { createInstance, type Instantiable };
