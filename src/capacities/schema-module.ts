import type { Classifiable } from "typia";
// `IValidation` / `AssertionGuard` are typia's exact validator return types,
// defined in `@typia/interface` (typia's own dependency). Importing them keeps
// `SchemaModule` precisely aligned with what `typia.createValidate*` /
// `createAssertGuard*` actually return, so a model's bound module object is
// assignable here verbatim.
import type { AssertionGuard, IValidation } from "@typia/interface";

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

	// --- typia VALIDATORS (consumed by the `Validatable` capacity) ----------
	/** `typia.createValidate<T>()` — non-throwing; returns `IValidation<T>`. */
	validate: (input: unknown) => IValidation<T>;

	/** `typia.createAssert<T>()` — throws on invalid; returns the data. */
	assert: (input: unknown) => T;

	/** `typia.createAssertGuard<T>()` — assertion guard; `asserts input is T`. */
	assertGuard: AssertionGuard<T>;

	/** `typia.createValidateEquals<T>()` — strict-equal `validate` variant. */
	"validate-equals": (input: unknown) => IValidation<T>;

	/** `typia.createAssertEquals<T>()` — strict-equal `assert` variant. */
	"assert-equals": (input: unknown) => T;

	/**
	 * Strict-equal `assertGuard` variant. typia has no equals-guard of its own,
	 * so this aliases `typia.createAssertGuard<T>()` — but it is kept as a
	 * distinct, named key so a model can wire `assertGuard` to it explicitly.
	 */
	"assert-guard-validate": AssertionGuard<T>;
}
