import typia, { type Classifiable } from "typia";

interface Instantiable<T> {
	new (...args: any[]): T;
	from(seed: Classifiable<T>): T;
}

const input = { data: "payload" };
const createInstance = typia.plain.createValidateClassify<typeof input>();

export { type Instantiable, createInstance };
