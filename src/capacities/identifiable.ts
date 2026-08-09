import typia, { type tags } from "typia";
import { type UUID } from "crypto";

interface Identifiable<T extends UUID> {
	id: T & tags.Format<"uuid">;
}

const isIdentifiable = typia.createIs<Identifiable<UUID>>();
const validateIdentifiable = typia.createValidate<Identifiable<UUID>>();

export { type Identifiable, isIdentifiable, validateIdentifiable };
