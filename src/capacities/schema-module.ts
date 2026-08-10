import type { Classifiable } from "typia";

/**
 * `SchemaModule<T>` — the FIXED, complete set of typia bindings a model
 * offers to its capacities.
 *
 * Why this exists: typia is a *compile-time* transformer. It cannot resolve a
 * generic type argument inside a mixin or factory ("non-specified generic
 * argument" — proven empirically). So every typia function must be bound
 * ONCE, concretely, at the model site (where `UserSchema` / `PostData` are
 * concrete), gathered into this single object, and handed to `defineModel`.
 *
 * The base model consumes what it needs (`schema`, `classify`); each capacity
 * consumes only its own slice (`toJSON`/`fromJSON`, or `encode`/`decode`/
 * `message`) and **ignores the rest** during composition. A capacity that is
 * not declared in the model's `capacities` list never reads its functions —
 * that is exactly the "decide whether to use them, or ignore them" split the
 * architecture is built around.
 *
 * The contract is intentionally a *fixed* shape: extend it here when a new
 * capacity needs a new typia API, and every model binds the whole set. This
 * keeps capacity authoring ignorant of which concrete schema it is operating
 * on — it just pulls named functions out of the module.
 */
export interface SchemaModule<T = unknown> {
	/** `typia.reflect.schema` / `typia.json.schema` object (runtime schema). */
	schema: object;

	/** `typia.plain.assertClassify<T>()` — used by the base constructor. */
	classify: (data: Classifiable<T>) => T;

	/** `typia.json.createAssertStringify<T>()` — assert + JSON stringify. */
	toJSON: (input: T) => string;

	/** `typia.json.createAssertParse<T>()` — parse + validate a JSON string. */
	fromJSON: (input: string) => T;

	/** `typia.protobuf.createAssertEncode<T>()` — assert + protobuf encode. */
	encode: (input: T) => Uint8Array;

	/** `typia.protobuf.createAssertDecode<T>()` — assert + protobuf decode. */
	decode: (input: Uint8Array) => T;

	/** `typia.protobuf.message<T>()` — the proto3 schema string. */
	message: string;
}
