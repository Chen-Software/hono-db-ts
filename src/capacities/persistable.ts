import { matchesFilter, type Store, StoreRegistry } from "../storage/store";
import type { CapacityConstructor } from "./capable";
import type { ComposeContext } from "./compose";
import { Registry } from "./registry";

export interface PersistableOptions {
	/**
	 * The `Store` to persist through. Either a `Store` instance, or a NAME
	 * registered in `StoreRegistry` (the DI seam). Required — persistence is
	 * explicit, never implicit, so the same model targets memory in tests and
	 * S3 in prod by swapping this one value.
	 */
	store: Store | string;

	/**
	 * Wire format. `"json"` (default) uses `JsonSerialisable`'s toJSON/fromJSON;
	 * `"protobuf"` uses `ProtobufEncodable`'s encode/decode (falls back to JSON
	 * if that capacity is absent).
	 */
	format?: "json" | "protobuf";

	/**
	 * Opt-in auto-persist on mutation. When true, `afterUpdate` triggers
	 * `save()` and `afterDelete` triggers `store.delete`. Default OFF — you keep
	 * in-memory speed + explicit batching/transactions; call `save()` yourself
	 * when you want ordering/durability.
	 */
	autoSave?: boolean;

	/** Persist deletion of the blob on `afterDelete`. Default true. Set false
	 *  to keep tombstones (e.g. git history you don't want to prune). */
	autoDelete?: boolean;
}

/**
 * Persistable — the model-facing half of storage.
 *
 * It does NOT do I/O itself; it holds a `Store` (injected) and ships bytes to
 * it. Serialization is REUSED from `JsonSerialisable`/`ProtobufEncodable`
 * (already composed) — the capacity never invents a format.
 *
 * It hangs off the EXISTING event seam (`Triggerable`): `save()` fires
 * `beforePersist` / `afterPersist`; `autoSave` subscribes to `afterUpdate`;
 * deletion-of-blob subscribes to `afterDelete`. Because these are EVENTS (not
 * the synchronous `onUpdate`/`onDelete` hooks), persistence can never block or
 * reject a transaction — exactly the split we settled on. And `load` re-
 * registers the instance into the `Registry` identity map, so `post.getUser()`
 * still resolves after loading from S3, and cascade-delete flows for free
 * (Referencible's sync `onDelete` hook deletes children, each child's
 * `afterDelete` then drops its blob).
 *
 * Adds to the adorned class:
 *   instance.save(): Promise<this>      — serialize + store.put + emit
 *   static  load(id): Promise<T | undefined>
 *   static  find(filter?): Promise<T[]>  — store.query, or in-memory fallback
 */
function Persistable<TBase extends CapacityConstructor>(
	Base: TBase,
	_mod?: any,
	options: PersistableOptions = { store: "memory" },
	ctx?: ComposeContext,
) {
	Base.prototype.capacities && Base.prototype.addCapacity?.("Persistable");

	const store = StoreRegistry.resolve(options.store);
	const format: "json" | "protobuf" = options.format ?? "json";
	const autoSave = options.autoSave === true;
	const autoDelete = options.autoDelete !== false;

	const keyFor = (Ctor: any, inst: any): string =>
		`${Ctor.schemaName}/${inst.id}`;

	const toBytes = (Ctor: any, inst: any): Uint8Array => {
		if (format === "protobuf") {
			if (typeof Ctor.encode === "function") return Ctor.encode(inst);
			// fall back to JSON silently (capacity absent)
		}
		if (typeof Ctor.toJSON !== "function") {
			throw new Error(
				`Persistable: ${Ctor.schemaName} has no \`toJSON\` — add ` +
					`JsonSerialisable (or ProtobufEncodable for protobuf).`,
			);
		}
		return new TextEncoder().encode(Ctor.toJSON(inst));
	};

	const fromBytes = (Ctor: any, bytes: Uint8Array): any => {
		if (format === "protobuf" && typeof Ctor.decode === "function") {
			return Ctor.decode(bytes);
		}
		if (typeof Ctor.fromJSON !== "function") {
			throw new Error(
				`Persistable: ${Ctor.schemaName} has no \`fromJSON\` — add ` +
					`JsonSerialisable.`,
			);
		}
		return Ctor.fromJSON(new TextDecoder().decode(bytes));
	};

	// --- wiring: opt-in auto-save / auto-delete on the EVENT seam ----------
	if (autoSave) {
		(Base as any).after("Update", (inst: any) => {
			if (inst && typeof inst.save === "function") void inst.save();
		});
	}
	if (autoDelete) {
		(Base as any).after("Delete", (inst: any) => {
			if (inst?.id != null) void store.delete(keyFor(Base, inst));
		});
	}

	return class extends (Base as any) {
		/** Serialize + write to the store, firing before/afterPersist. */
		async save(): Promise<any> {
			const Ctor = this.constructor as any;
			const key = keyFor(Ctor, this);
			const bytes = toBytes(Ctor, this);
			await Ctor.emit?.("beforePersist", { instance: this, key });
			await store.put(key, bytes);
			await Ctor.emit?.("afterPersist", { instance: this, key });
			return this;
		}

		/** Load one entity by id; re-registers it into the identity map. */
		static async load(id: string | number): Promise<any> {
			const Ctor = this as any;
			const key = `${Ctor.schemaName}/${id}`;
			const obj = await store.get(key);
			if (!obj) return undefined;
			const data = fromBytes(Ctor, obj.data);
			return new Ctor(data); // auto-registers via onConstruct
		}

		/** Find entities. Prefers the store's real `query`; falls back to the
		 *  in-memory identity map when the store has no query engine. */
		static async find(filter?: Record<string, unknown>): Promise<any[]> {
			const Ctor = this as any;
			const prefix = `${Ctor.schemaName}/`;
			if (store.query) {
				const objs = await store.query({ prefix, filter });
				return objs.map((o) => new Ctor(fromBytes(Ctor, o.data)));
			}
			const all = Registry.all(Ctor.schemaName);
			return filter ? all.filter((i: any) => matchesFilter(i, filter)) : all;
		}
	};
}

export { Persistable };
