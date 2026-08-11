import type { CapacityConstructor } from "./capable";
import { addLifecycleHook } from "./triggerable";
import { getInstanceMap } from "../storage/identity-map";

// Relation vocabulary is defined next to the `Reference` typia tag (the single
// source of truth shared by this in-memory resolver, the SQL FK projection, and
// the tag itself).
import type { RelationCardinality, OnDelete } from "../tags/reference";

/**
 * Join mode — controls behaviour when the reference is MISSING.
 *   - `inner`  — a 1:1 / m:1 getter throws if no match is found.
 *   - `left`   (default) — 1:1 / m:1 returns `undefined`; collections return `[]`.
 *   - `right`  — reserved; at the accessor level behaves like `left` (the
 *               asymmetry only matters for query-level `.join(...)`, a later
 *               concern). Kept for symmetry / future query operators.
 *   - `full`   — reserved; behaves like `left` at the accessor level.
 */
export type JoinMode = "inner" | "left" | "right" | "full";

// `OnDelete` is imported from `../tags/reference` (see above) — it is the SAME
// vocabulary used by the SQL FK constraint, so the in-memory delete behaviour
// and the DB constraint stay in sync.

export interface RelationSpec {
	/**
	 * Getter name WITHOUT the `get` prefix. `"posts"` -> `getPosts()`,
	 * `"user"` -> `getUser()`.
	 */
	name: string;

	/** Thunk to the target model class. A function (not the class) so two
	 *  models can reference each other without a TDZ / circular-import failure
	 *  at module load. */
	target: () => CapacityConstructor;

	/**
	 * The join condition. Two forms:
	 *   - string: the FOREIGN-KEY FIELD NAME. The universal predicate it
	 *     desugars to is `(owner, target) => owner[fk] === target.id`, where
	 *     `owner` is ALWAYS the entity that HOLDS the FK. This one predicate
	 *     serves BOTH directions: `post.getUser()` calls `pred(post, user)`
	 *     (post holds `authorId`), and `user.getPosts()` (the inverse, which
	 *     does NOT hold the FK) calls `pred(post, user)` with the candidate as
	 *     `owner` — so both yield `post.authorId === user.id`. The direction is
	 *     chosen automatically from `cardinality` (collection side = inverse).
	 *   - function: a full `(owner, target) => boolean` join predicate, for
	 *     composite keys, computed joins, or `many-to-many` (where `owner[fk]`
	 *     would be an array membership test). `owner` is the FK-holding entity.
	 */
	by: string | ((owner: any, target: any) => boolean);

	/**
	 * Cardinality. Explicit is required for collection relations; `"auto"`
	 * (default) resolves to `many-to-one` (a single object) — so any
	 * collection side MUST state `one-to-many` / `many-to-many` explicitly.
	 * Auto-recognition of 1:1 vs 1:N from the schema alone is unreliable
	 * (the inverse side has no FK field of its own), so we do not pretend to
	 * guess it; the declared cardinality drives the generated return type.
	 */
	cardinality?: RelationCardinality | "auto";

	/** Join mode (missing-reference behaviour). Default `left`. */
	join?: JoinMode;

	/** Junction model name for `many-to-many`. (Wiring the join table scan is
	 *  a follow-up; the predicate form already supports array membership.) */
	through?: string;

	/** Referential action when THIS entity is deleted. Default `noAction`. */
	onDelete?: OnDelete;

	/** FK field to null for `setNull` when `by` is a function. */
	fk?: string;
}

export interface ReferencibleOptions {
	relations: RelationSpec[];
}

function Referencible<TBase extends CapacityConstructor>(
	Base: TBase,
	_mod?: any,
	options: ReferencibleOptions = { relations: [] },
) {
	Base.prototype.capacities && Base.prototype.addCapacity?.("Referencible");

	const modelName = (Base as any).schemaName as string;

	// --- one shared join predicate per relation -----------------------------
	const predicateFor = (rel: RelationSpec) => {
		if (typeof rel.by === "function") return rel.by;
		const fk = rel.by; // FK field name
		return (near: any, far: any) => near[fk] === far.id;
	};

	const isMany = (rel: RelationSpec): boolean => {
		const c = rel.cardinality ?? "auto";
		return c === "one-to-many" || c === "many-to-many";
	};

	// --- register every constructed instance into the identity map ----------
	// (once, not per-relation — idempotent `Map.set` regardless)
	addLifecycleHook(Base, "onConstruct", (inst: any) => {
		if (inst?.id != null)
			getInstanceMap(inst).register(modelName, String(inst.id), inst);
		return inst;
	});

	for (const rel of options.relations) {
		const Target = rel.target;
		const targetName = () => (Target() as any).schemaName as string;
		const pred = predicateFor(rel);
		const many = isMany(rel);
		const join = rel.join ?? "left";
		const getterName =
			"get" + rel.name[0].toUpperCase() + rel.name.slice(1);

		// Direction-aware match: the FK-owning side uses `pred(self, candidate)`;
		// the inverse (collection) side flips to `pred(candidate, self)` so the
		// candidate is treated as the owner. `many` (one-to-many / many-to-many)
		// marks the inverse side.
		const matches = (self: any, candidate: any) =>
			many ? pred(candidate, self) : pred(self, candidate);

		// --- generate the accessor on the prototype -------------------------
		// Methods live on the prototype (not own props) so frozen Immutable
		// instances keep them and `{...this}` spreads ignore them.
		Object.defineProperty((Base as any).prototype, getterName, {
			enumerable: false,
			configurable: true,
			value: function (this: any) {
				const tn = targetName();
				if (many) {
					return getInstanceMap(this).filter(tn, (far: any) => matches(this, far));
				}
				const found = getInstanceMap(this).find(tn, (far: any) => matches(this, far));
				if (found) return found;
				if (join === "inner") {
					throw new Error(
						`Referencible: ${modelName}.${getterName}() found no ` +
							`matching ${tn} (inner join).`,
					);
				}
				return undefined;
			},
		});

		// --- referential action on delete of THIS entity --------------------
		if (rel.onDelete && rel.onDelete !== "noAction") {
			addLifecycleHook(Base, "onDelete", (inst: any) => {
				const tn = targetName();
				const related = getInstanceMap(inst).filter(tn, (far: any) => matches(inst, far));
				if (rel.onDelete === "restrict" && related.length > 0) {
					throw new Error(
						`Referencible: cannot delete ${modelName} ${inst.id} — ` +
							`${related.length} ${tn} still reference it (restrict).`,
					);
				}
				if (rel.onDelete === "cascade") {
					for (const child of related) (child as any).delete?.();
				}
				if (rel.onDelete === "setNull") {
					const fk =
						rel.fk ?? (typeof rel.by === "string" ? rel.by : undefined);
					if (fk) for (const child of related) child[fk] = null;
				}
			});
		}
	}

	// --- deregister hook so `Triggerable.delete()` can drop this from the map
	(Base as any).__deregister = (inst: any) => {
		if (inst?.id != null)
			getInstanceMap(inst).unregister(modelName, String(inst.id));
	};

	return Base;
}

export { Referencible };
