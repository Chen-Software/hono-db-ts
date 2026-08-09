import { type Classifiable } from "typia";

interface Instantiable<Model> {
	new (...args: any[]): Model;
	from(seed: Classifiable<Model>): Model;
}

export { type Instantiable };
