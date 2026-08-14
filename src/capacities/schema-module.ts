// `IValidation` / `AssertionGuard` / `IReadableURLSearchParams` are typia's
// exact return/param types, defined in `@typia/interface` (typia's own
// dependency). Importing them keeps `SchemaModule` precisely aligned with what
// `typia.createValidate*` / `http.*` actually return, so a model's bound module
// object is assignable here verbatim.
import type {
	AssertionGuard,
	IReadableURLSearchParams,
	IValidation,
} from "@typia/interface";
import type { Classifiable } from "typia";

/**
 * `HttpSchemaModule` — the HTTP-shaped *decode* slice a model may optionally
 * bind. These are PURE functions (no network): they turn HTTP-shaped inputs
 * (a query string, a headers object, a path-parameter string, `FormData`)
 * into typed objects, with automatic string→number / string→boolean coercion.
 *
 * They are the *request-ingest* counterpart of the JSON / protobuf families
 * already in {@link SchemaModule}: `fromJSON` decodes a body, these decode the
 * *rest* of an HTTP exchange (query / headers / param / form). typia backs
 * them (`typia.http.*` — ships in typia core, no `@nestia` needed) and emits
 * the concrete decoder at compile time exactly like `createAssertParse`.
 *
 * The decoded DTO type (`PostQuery`, `PostHeaders`, …) is model-specific and
 * therefore erased to `unknown` here — the model binds the CONCRETE function
 * (`typia.http.createQuery<PostQuery>()`) at its own site, so the runtime type
 * is exact; only the interface boundary is loose. This slice is OPTIONAL: a
 * model that never receives HTTP inputs simply does not bind it, and the
 * `Connectable` capacity tolerates its absence.
 *
 * Restrictions (enforced by typia at compile time, documented in
 * `node_modules/typia/lib/http.d.ts`): object types only, no dynamic keys,
 * scalar leaves (`boolean | bigint | number | string` (+ `Blob`/`File` for
 * form), arrays thereof), no unions, lowercase header keys, single-valued
 * forbidden headers (`content-type`, `user-agent`, …). `parameter` decodes a
 * single atomic (assert-only). Constraint *tags* (`Format`, `Minimum`, …) are
 * NOT checked — use the `assert*` / `validate*` variants (or the model's own
 * `validate`) for that.
 */
export interface HttpSchemaModule {
	// --- QUERY (typia.http.*Query) ------------------------------------------
	/** `createQuery` — decode, no validation. */
	query: (input: string | IReadableURLSearchParams) => unknown;
	/** `createAssertQuery` — throws on type mismatch. */
	assertQuery: (input: string | IReadableURLSearchParams) => unknown;
	/** `createIsQuery` — `null` on mismatch. */
	isQuery: (input: string | IReadableURLSearchParams) => unknown | null;
	/** `createValidateQuery` — `IValidation` with all errors. */
	validateQuery: (input: string | IReadableURLSearchParams) => IValidation<any>;

	// --- HEADERS (typia.http.*Headers) --------------------------------------
	/** `createHeaders` — decode, no validation. */
	headers: (input: Record<string, string | string[] | undefined>) => unknown;
	/** `createAssertHeaders` — throws on type mismatch. */
	assertHeaders: (
		input: Record<string, string | string[] | undefined>,
	) => unknown;
	/** `createIsHeaders` — `null` on mismatch. */
	isHeaders: (
		input: Record<string, string | string[] | undefined>,
	) => unknown | null;
	/** `createValidateHeaders` — `IValidation` with all errors. */
	validateHeaders: (
		input: Record<string, string | string[] | undefined>,
	) => IValidation<any>;

	// --- PARAMETER (typia.http.createParameter, atomic, assert-only) --------
	/** `createParameter` — decode ONE path parameter (asserts). */
	parameter: (input: string) => unknown;

	// --- FORM DATA (typia.http.*FormData) -----------------------------------
	/** `createFormData` — decode, no validation. */
	formData: (input: FormData) => unknown;
	/** `createAssertFormData` — throws on type mismatch. */
	assertFormData: (input: FormData) => unknown;
	/** `createIsFormData` — `null` on mismatch. */
	isFormData: (input: FormData) => unknown | null;
	/** `createValidateFormData` — `IValidation` with all errors. */
	validateFormData: (input: FormData) => IValidation<any>;
}

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
 * consumes only its own slice (e.g. `toJSON`/`fromJSON`, `encode`/`decode`,
 * validators, `clone`) and **ignores the rest** during composition. A capacity
 * that is not declared in the model's `capacities` list never reads its
 * functions — that is exactly the "decide whether to use them, or ignore them"
 * split the architecture is built around.
 *
 * The contract is intentionally a *fixed, complete* shape: it bundles EVERY
 * variant typia exposes for a schema — structural + `-equals`, `assert` +
 * `validate` + `is` + `assertGuard`, the three `classify` variants, the four
 * `clone` variants, the full JSON / protobuf parse|stringify|decode|encode
 * families, and `random`. Bind all of them at the model site; capacities then
 * select whichever variant their option asks for. Extend this interface only
 * when a genuinely new typia capability is needed — every model binds the
 * whole set, keeping capacity authoring ignorant of the concrete schema.
 *
 * Naming convention for variant keys: the *default* (structural) function uses
 * its bare typia name (`validate`, `clone`, `classify`, …); stricter or
 * non-throwing variants are written kebab-case (`validateEquals`,
 * `assertGuardEquals`). The `*-guard` keys are typia's `AssertionGuard`
 * returns (which assert rather than return a boolean).
 */
export interface SchemaModule<T = unknown> {
	/** `typia.reflect.schema<Type>()` / `typia.json.schema<T>()` — runtime schema. */
	schema: object;

	// --- CLASSIFY (typia.plain.*Classify) -----------------------------------
	/** `createClassify` — no validation; project the data shape. */
	classify: (data: Classifiable<T>) => T;

	/** `createAssertClassify` — throws on invalid; returns the data. */
	assertClassify: (input: any) => T;

	/** `createValidateClassify` — non-throwing; returns `IValidation<T>`. */
	validateClassify: (input: any) => IValidation<any>;

	// --- CLONE (typia.plain.*Clone) -----------------------------------------
	/** `createClone` — deep copy, NO validation. */
	clone: (input: any) => T;

	/** `createAssertClone` — deep copy + assert (throws on invalid). */
	assertClone: (input: any) => T;

	/** `createIsClone` — deep copy, or `null` if invalid. */
	isClone: (input: any) => T | null;

	/** `createValidateClone` — non-throwing; `IValidation<T>`. */
	validateClone: (input: any) => IValidation<any>;

	// --- PRUNE (typia.plain.createPrune) ------------------------------------
	/** `createPrune` — remove excess/non-schema properties in place. */
	prune: (input: any) => void;

	// --- VALIDATORS (typia.create*) -----------------------------------------
	/** `createIs` — boolean type guard. */
	is: (input: any) => input is T;

	/** `createAssert` — throws on invalid; returns the data. */
	assert: (input: any) => T;

	/** `createAssertGuard` — assertion guard (`asserts input is T`). */
	assertGuard: AssertionGuard<T>;

	/** `createValidate` — non-throwing; returns `IValidation<T>`. */
	validate: (input: any) => IValidation<T>;

	/** `createAssertEquals` — strict-equal `assert` (deep equality). */
	assertEquals: (input: any) => T;

	/** `createValidateEquals` — strict-equal `validate`. */
	validateEquals: (input: any) => IValidation<T>;

	/** `createAssertGuardEquals` — strict-equal assertion guard. */
	assertGuardEquals: AssertionGuard<T>;

	/**
	 * `createAssertGuard` again, surfaced under an explicit *-guard key so a
	 * model can name the (structural) assertion guard distinctly from the
	 * `-equals` one. typia has no separate "guard-validate"; this is the same
	 * `AssertionGuard<T>` as `assertGuard`.
	 */
	assertGuardValidate: AssertionGuard<T>;

	// --- JSON (typia.json.*) -------------------------------------------------
	/** `createStringify` — plain stringify (NO validation). */
	stringify: (input: any) => string;

	/** `createAssertStringify` — assert + stringify. */
	toJSON: (input: any) => string;

	/** `createIsStringify` — stringify or `null` if invalid. */
	isStringify: (input: any) => string | null;

	/** `createValidateStringify` — non-throwing; `IValidation<string>`. */
	validateStringify: (input: any) => IValidation<any>;

	/** `createAssertParse` — parse + validate a JSON string. */
	fromJSON: (input: string) => T;

	/** `createIsParse` — parse or `null` if invalid. */
	isParse: (input: string) => T | null;

	/** `createValidateParse` — non-throwing; `IValidation<T>`. */
	validateParse: (input: string) => IValidation<any>;

	// --- PROTOBUF (typia.protobuf.*) ----------------------------------------
	/** `message<T>()` — the proto3 schema string. */
	message: string;

	/** `createAssertEncode` — assert + protobuf encode. */
	encode: (input: any) => Uint8Array;

	/** `createAssertDecode` — assert + protobuf decode. */
	decode: (input: Uint8Array) => T;

	/** `createIsEncode` — encode or `null` if invalid. */
	isEncode: (input: any) => Uint8Array | null;

	/** `createValidateEncode` — non-throwing; `IValidation<Uint8Array>`. */
	validateEncode: (input: any) => IValidation<any>;

	/** `createIsDecode` — decode or `null` if invalid. */
	isDecode: (input: Uint8Array) => T | null;

	/** `createValidateDecode` — non-throwing; `IValidation<T>`. */
	validateDecode: (input: Uint8Array) => IValidation<any>;

	// --- COMPARE (typia.compare.*) -----------------------------------------
	/** `createEquals` — type-directed deep equality (`equals(x, y)`). */
	equals: (x: T, y: T) => boolean;

	/** `createLess` — type-directed lexicographic strict-less (`less(x, y)`). */
	less: (x: T, y: T) => boolean;

	/** `more` — derived as `less(y, x)` (typia has no native `createGreater`). */
	more: (x: T, y: T) => boolean;

	// --- RANDOM (typia.createRandom) ----------------------------------------
	/** `createRandom` — generate a random valid instance. */
	random: () => T;

	// --- HTTP INGEST (typia.http.*) -----------------------------------------
	/**
	 * OPTIONAL HTTP-shaped *decode* slice (see {@link HttpSchemaModule}). Binds
	 * the query / headers / param / formData decoders for this model's HTTP
	 * DTOs. Absent when the model has no HTTP inputs. The `Connectable`
	 * capacity and any handler that ingests requests consume this; it carries
	 * NO network code — decoding only.
	 */
	http?: HttpSchemaModule;
}
