import typia, { tags } from "typia";

interface Identifiable<T extends "uuid"> {
	id: string & tags.Format<T>;
}

const isIdentifiable = typia.createIs<Identifiable<"uuid">>();
const validateIdentifiable = typia.createValidate<Identifiable<"uuid">>();

export { type Identifiable, isIdentifiable, validateIdentifiable };
