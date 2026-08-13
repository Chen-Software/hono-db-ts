import { getInstanceMap } from "../storage/identity-map";
// Relation vocabulary is defined next to the `Reference` typia tag (the single
// source of truth shared by this in-memory resolver, the SQL FK projection, and
// the tag itself).
import {
	type JoinMode,
	type OnDelete,
	type RelationCardinality,
	deriveRelationName,
	inverseCardinality,
	referencesOf,
} from "../tags/reference";
import { hasModel, listModels } from "../registry";
import type { CapacityComposer } from "./compose";
import { addLifecycleHook } from "./triggerable";

// Re-export `JoinMode` so existing importers of `Referencible` keep working now
// that the vocabulary lives in `tags/reference`.
export type { JoinMode } from "../tags/reference";

/**
 * Join mode — controls behaviour when the reference is MISSING.
 *   - `inner`  — a 1:1 / m:1 getter throws if no match is found.
 *   - `left`   (default) — 1:1 / m:1 returns `undefined`; collections return `[]`.
 *   - `right`  — reserved; at the accessor level behaves like `left` (the
 *               asymmetry only matters for query-level `.join(...)`, a later
 *               concern). Kept for symmetry / future query operators.
 *   - `full`   — reserved; behaves like `left` at the accessor level.
 */
export type JoinModeLocal = JoinMode;

// `OnDelete` is imported from `../tags/reference` (see above) — it is the SAME
// vocabulary used by the SQL FK constraint, so the in-memory delete behaviour
// and the DB constraint stay in sync.

export interface RelationSpec {
	/**
	 * Getter name WITHOUT the `get` prefix. `"posts"` -> `getPosts()`,
	 * `"user"` -> `getUser()`. When the spec is DERIVED from a `Reference` tag,
	 * this defaults to the tag's `target` model name (e.g. `"UserSchema"` →
	 * `"user"`, or the tag's explicit `name`).
	 */
	name: string;

	/** Thunk to the target model class OR its `schemaName` string. A function
	 *  (not the value) so two models can reference each other without a TDZ /
	 *  circular-import failure at module load. Manual relations pass the class
	 *  (`() => User`); tag-derived relations pass the tag's string target
	 *  directly (`() => meta.target`) — which already equals the target's
	 *  `schemaName`, so no registry class lookup is needed for the owner side. */
	target: () => CapacityComposer | string;

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

	/** Referential action when THIS entity is deleted. Default `noAction`.
	 *  NOTE: a `Reference` tag's `onDelete` describes the INVERSE cascade (delete
	 *  the tagged model → cascade the owner); the owner accessor derived from a
	 *  tag deliberately carries no `onDelete` of its own. The inverse side
	 *  (which has no FK column to tag) declares `onDelete` manually here. */
	onDelete?: OnDelete;

	/** FK field to null for `setNull` when `by` is a function. */
	fk?: string;
}

export interface ReferencibleOptions {
	relations: RelationSpec[];
}

function Referencible<TBase extends CapacityComposer>(
	Base: TBase,
	mod?: any,
	options: ReferencibleOptions = { relations: [] },
) {
	Base.prototype.capacities && Base.prototype.addCapacity?.("Referencible");

	const modelName = (Base as any).schemaName as string;

	// --- derive owner-side relations from the `Reference` tags on this model's
	// reflected schema. The tag is the declarative source of truth for the FK-
	// owning side of a relation, so we no longer require a hand-written
	// `relations` entry for it: the in-memory accessor (`post.getUser()`) falls
	// out of the tag, and cannot drift from the SQL FK (both read the same tag).
	// The inverse (collection) side has no FK column of its own to tag, so it
	// stays manual — but its `cardinality` / `onDelete` are guarded against the
	// tag below.
	const tagged = mod?.schema ? referencesOf(mod.schema) : [];
	const manualByColumn = new Map<string, RelationSpec>();
	for (const r of options.relations) {
		if (typeof r.by === "string") manualByColumn.set(r.by, r);
	}

	const derived: RelationSpec[] = [];
	for (const { column, meta } of tagged) {
		const manual = manualByColumn.get(column);
		if (manual) {
			// Drift guard — a manual owner spec must agree with the tag that
			// already declares this FK column.
			const targetName = (manual.target() as any)?.schemaName;
			if (targetName && targetName !== meta.target) {
				throw new Error(
					`Referencible(${modelName}): manual relation on "${column}" targets ` +
						`"${targetName}" but its Reference tag targets "${meta.target}".`,
				);
			}
			if (
				meta.cardinality &&
				manual.cardinality &&
				meta.cardinality !== manual.cardinality
			) {
				throw new Error(
					`Referencible(${modelName}): manual relation on "${column}" cardinality ` +
						`"${manual.cardinality}" disagrees with its Reference tag ` +
						`"${meta.cardinality}".`,
				);
			}
			continue; // manual wins; do not re-derive
		}
		// Derive the owner accessor from the tag. The tag's `onDelete` describes
		// the inverse cascade (delete the target → cascade here), so the owner
		// accessor itself carries no delete action.
		derived.push({
			name: meta.name ?? deriveRelationName(meta.target),
			// The tag's string target IS the identity-map key (it equals the
			// target's `schemaName`), so store it directly — no `resolveModel`
			// class lookup.
			target: () => meta.target,
			by: column,
			cardinality: meta.cardinality ?? "many-to-one",
			join: meta.join ?? "left",
		});
	}

	// --- inverse-side drift guard (best-effort). For each manual COLLECTION
	// relation, find a registered model whose `Reference` tag targets THIS
	// model; its tag's `onDelete` / inverse cardinality must match the manual
	// spec. Skipped (no throw) if the complement model isn't registered yet, so
	// import order can never break composition.
	for (const rel of options.relations) {
		const c = rel.cardinality ?? "auto";
		const isMany = c === "one-to-many" || c === "many-to-many";
		if (!isMany) continue;
		// Match the SPECIFIC inverse model: the one whose Reference tag on the
		// SAME FK column (`rel.by`) targets this model. A model may be referenced
		// by MANY other models with different onDelete rules (e.g. `User` is
		// referenced by `Post.authorId` cascade AND `Board.moderatorId` setNull);
		// we must validate against the correct complement, not the first model
		// that happens to reference us.
		for (const [name, ctor] of listModels()) {
			if (name === modelName) continue;
			const cols = referencesOf((ctor as any)?.schema);
			const match = cols.find(
				(x) => x.meta.target === modelName && x.column === rel.by,
			);
			if (!match) continue;
			if (
				rel.onDelete &&
				match.meta.onDelete &&
				rel.onDelete !== match.meta.onDelete
			) {
				throw new Error(
					`Referencible(${modelName}): inverse relation "${rel.name}" onDelete ` +
						`"${rel.onDelete}" disagrees with ${name}'s Reference tag ` +
						`"${match.meta.onDelete}".`,
				);
			}
			const inv = inverseCardinality(match.meta.cardinality);
			if (rel.cardinality && rel.cardinality !== inv) {
				throw new Error(
					`Referencible(${modelName}): inverse relation "${rel.name}" cardinality ` +
						`"${rel.cardinality}" should be "${inv}" (inverse of ${name}'s ` +
						`Reference tag "${match.meta.cardinality}").`,
				);
			}
			break;
		}
	}

	const allRelations = [...derived, ...options.relations];

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

	for (const rel of allRelations) {
		const Target = rel.target;
		// `target` is a class thunk (manual relations) or a plain name string
		// (tag-derived relations, where `meta.target` already equals the
		// target's `schemaName`). Both yield the identity-map key directly.
		const targetName = (): string => {
			const t = Target();
			return typeof t === "string" ? t : ((t as any).schemaName as string);
		};
		const pred = predicateFor(rel);
		const many = isMany(rel);
		const join = rel.join ?? "left";
		const getterName = "get" + rel.name[0].toUpperCase() + rel.name.slice(1);

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
					return getInstanceMap(this).filter(tn, (far: any) =>
						matches(this, far),
					);
				}
				const found = getInstanceMap(this).find(tn, (far: any) =>
					matches(this, far),
				);
				if (found) return found;
				// Lighter existence check (replaces the old `resolveModel` class
				// lookup): if the target model name isn't registered at all, the
				// tag points at a typo'd / never-imported model — fail loudly here,
				// before the inner-join message, so the cause is obvious.
				if (!hasModel(tn)) {
					throw new Error(
						`Referencible: ${modelName}.${getterName}() references unknown ` +
							`model "${tn}" — its Reference tag target is not registered ` +
							`(typo, or the model is never imported).`,
					);
				}
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
				const related = getInstanceMap(inst).filter(tn, (far: any) =>
					matches(inst, far),
				);
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
