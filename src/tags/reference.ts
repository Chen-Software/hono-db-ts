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
 * Join mode — controls behaviour when the reference is MISSING. Shared by the
 * in-memory `Referencible` resolver and the SQL projection, so the tag,
 * `Referencible`, and `SqlRelationDef` all agree on the same word.
 *   - `inner` — a 1:1 / m:1 getter throws if no match is found.
 *   - `left`  (default) — 1:1 / m:1 returns `undefined`; collections return `[]`.
 *   - `right` / `full` — reserved for query-level joins (a later concern).
 */
export type JoinMode = "inner" | "left" | "right" | "full";

/**
 * Reference — a typia CUSTOM TAG that declares a relation (foreign key) on a
 * scalar field — typically the UUID id column that joins to another model, e.g.
 * `authorId`.
 *
 * It is the DECLARATIVE source of truth for a relation. The metadata it carries
 * is enough to:
 *   - build the SQL FK constraint (drizzle `.references()`) — read by
 *     `sql-serialisable` from the reflected JSON schema, and
 *   - derive the OWNER-side in-memory accessor (`repo.getOwner()`) — read by
 *     `Referencible` from the same reflected schema,
 * entirely from the model's type — no hand-written drizzle column code AND no
 * duplicated manual relation declaration.
 *
 * The inverse (collection) side of a relation (`user.getRepositories()`) has no FK
 * column of its own to tag, so `Referencible`'s own mixin does not derive it.
 * Instead `wireInverseRelations()` (run from `defineModel`) scans every model's
 * tags and installs the matching collection getter on the target (`user.getRepositories()`
 * from `Repository.ownerId -> UserSchema`,
 * etc.), mirroring each tag's `onDelete`. A manual inverse in `Referencible`'s
 * `relations` is still allowed and guarded against this tag, so the two cannot
 * silently drift.
 *
 * @example
 * ```ts
 * interface RepositorySchema {
 *   ownerId: UUID & Reference<"UserSchema", "id", "many-to-one", "setNull", "inner">;
 * }
 * ```
 *
 * Type params:
 *   - `Target`   — the target MODEL NAME (string). Resolved to its class via the
 *                  model registry (at derive time), so two models can reference
 *                  each other without a circular import.
 *   - `Column`   — referenced column on the target (default `"id"`).
 *   - `Card`     — cardinality (default `"many-to-one"`); mirrors `Referencible`.
 *   - `Action`   — `onDelete` referential action (default `"noAction"`).
 *   - `Join`     — owner-side join mode (default `"left"`); `inner` makes the
 *                  derived getter throw when the target is missing.
 *   - `Name`     — optional explicit accessor name (without `get` prefix);
 *                  derived from `Target` when omitted.
 *
 * The `schema` fragment (`x-reference`) is merged by typia into the reflected
 * schema node, where `sql-serialisable` and `referencible` both read it.
 * (typia's `TagBase` `schema` field is a JSON-schema fragment; `x-*` keys are
 * valid annotations.)
 */
export type Reference<
	Target extends string,
	Column extends string = "id",
	Card extends RelationCardinality = "many-to-one",
	Action extends OnDelete = "noAction",
	Join extends JoinMode = "left",
	Name extends string | undefined = undefined,
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
			join: Join;
			name?: Name;
		};
	};
}>;

/**
 * `ReferenceMeta` — the decoded shape of a `Reference` tag (`x-reference`
 * extension in the reflected JSON schema). Canonical; imported by both
 * `sql-serialisable` and `referencible` so they read the SAME structure.
 */
export interface ReferenceMeta {
	/** Target model name, e.g. `"UserSchema"`. */
	target: string;
	/** Referenced column on the target table. Default `"id"`. */
	column?: string;
	/** Relation cardinality. Default `"many-to-one"`. */
	cardinality?: RelationCardinality;
	/** Referential action on delete. Default `"noAction"`. */
	onDelete?: OnDelete;
	/** Owner-side join mode. Default `"left"`. */
	join?: JoinMode;
	/** Explicit accessor name (without `get`). Derived from `target` if absent. */
	name?: string;
}

/** Read the `Reference` tag off a single reflected JSON-schema property. */
export function readReference(prop: any): ReferenceMeta | undefined {
	// Direct annotation (the common case: `field: UUID & Reference<…>`).
	const meta = prop?.["x-reference"];
	if (meta && typeof meta === "object") return meta as ReferenceMeta;
	// Nullable union form: typia reflects `field?: UUID & Reference<…> | null`
	// as `{ oneOf: [{ type: "null" }, { type: "string", x-reference: {…} }] }`,
	// so the `x-reference` annotation lives INSIDE the non-null branch rather
	// than on the property node. Search the union branches for it.
	for (const key of ["oneOf", "anyOf"]) {
		const branches = prop?.[key];
		if (Array.isArray(branches)) {
			for (const b of branches) {
				const m = b?.["x-reference"];
				if (m && typeof m === "object") return m as ReferenceMeta;
			}
		}
	}
	return undefined;
}

/**
 * Unwrap typia's envelope / array form to the underlying object schema.
 * `typia.json.schema<T>()` may yield `{ components, schema }` or an
 * array-of-one (`{ type: "array", items: { type: "object", … } }`); both must
 * resolve to the same properties.
 */
function unwrapObject(schema: any): any {
	const isArray =
		schema?.type === "array" ||
		(Array.isArray(schema?.type) && schema.type.includes("array"));
	if (isArray && schema.items) return schema.items;
	if (schema?.schema && typeof schema.schema === "object") return schema.schema;
	return schema;
}

/** All `Reference`-tagged columns on a reflected schema, as `{ column, meta }`. */
export function referencesOf(
	schema: any,
): { column: string; meta: ReferenceMeta }[] {
	const obj = unwrapObject(schema);
	const props: Record<string, any> = obj?.properties ?? {};
	const out: { column: string; meta: ReferenceMeta }[] = [];
	for (const [name, p] of Object.entries(props)) {
		const meta = readReference(p);
		if (meta) out.push({ column: name, meta });
	}
	return out;
}

/**
 * Derive a relation accessor name (WITHOUT the `get` prefix) from a target
 * model name. `"UserSchema"` → `"user"` (the trailing `Schema` is stripped);
 * `"User"` → `"user"`.
 */
export function deriveRelationName(target: string): string {
	// Strip the model's schema-name suffix. The forge models use `…Schema`
	// (`UserSchema` → `user`, `RepositorySchema` → `repository`); the `…Data`
	// fallback is retained for legacy models. The result is the lower-cased
	// model base name, used to build default accessor names.
	const base = target.endsWith("Schema")
		? target.slice(0, -"Schema".length)
		: target.endsWith("Data")
			? target.slice(0, -"Data".length)
			: target;
	if (!base) return target.toLowerCase();
	return base.charAt(0).toLowerCase() + base.slice(1);
}

/** Inverse cardinality for the non-FK-owning side of a relation. */
export function inverseCardinality(
	card?: RelationCardinality,
): RelationCardinality {
	switch (card) {
		case "one-to-one":
			return "one-to-one";
		case "one-to-many":
			return "many-to-one";
		case "many-to-one":
			return "one-to-many";
		case "many-to-many":
			return "many-to-many";
		default:
			return "many-to-one";
	}
}
