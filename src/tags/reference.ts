import type { tags } from "typia";

/**
 * Relation cardinality — the SINGLE vocabulary shared by the in-memory
 * `Referencible` relation resolver and the SQL foreign-key projection. Defined
 * here (next to the `Reference` tag) so the tag, `Referencible`, and
 * `SqlRelationDef` all agree on the same words.
 */
export type RelationCardinality =
	| "one-to-one"
	| "one-to-many"
	| "many-to-one"
	| "many-to-many";

/** Referential action for an FK / relation on delete. */
export type OnDelete = "cascade" | "setNull" | "restrict" | "noAction";

/**
 * Reference — a typia CUSTOM TAG that declares a relation (foreign key) on a
 * scalar field — typically the UUID id column that joins to another model, e.g.
 * `authorId`.
 *
 * It is the DECLARATIVE source of truth for a relation. The metadata it carries
 * is enough to:
 *   - build the SQL FK constraint (drizzle `.references()`), and
 *   - emit the `SqlRelationDef` the `SqlBackend` uses for joins,
 * entirely from the model's type — no hand-written drizzle column code.
 *
 * @example
 * ```ts
 * interface PostSchema {
 *   authorId: UUID & Reference<"User", "id", "many-to-one", "cascade">;
 * }
 * ```
 *
 * Type params:
 *   - `Target`   — the target MODEL NAME (string). Resolved to its drizzle
 *                  `Table` via the relation-table registry at derive time, so
 *                  two models can reference each other without a circular import.
 *   - `Column`   — referenced column on the target (default `"id"`).
 *   - `Card`     — cardinality (default `"many-to-one"`); mirrors `Referencible`.
 *   - `Action`   — `onDelete` referential action (default `"noAction"`).
 *
 * The `schema` fragment (`x-reference`) is merged by typia into the reflected
 * schema node, where `sql-tablisable` reads it. (typia's `TagBase` `schema`
 * field is a JSON-schema fragment; `x-*` keys are valid annotations.)
 */
export type Reference<
	Target extends string,
	Column extends string = "id",
	Card extends RelationCardinality = "many-to-one",
	Action extends OnDelete = "noAction",
> = tags.TagBase<{
	kind: "reference";
	target: "string";
	value: undefined;
	schema: {
		"x-reference": {
			target: Target;
			column: Column;
			cardinality: Card;
			onDelete: Action;
		};
	};
}>;
