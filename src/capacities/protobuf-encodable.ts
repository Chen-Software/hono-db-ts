import type { CapacityComposer } from "./compose";
import type { SchemaModule } from "./schema-module";

/**
 * `ProtobufEncodableSchema` — the type-level MARKER for the capacity.
 *
 * It is the empty object (`Record<never, never>`), mirroring
 * {@link JsonSerialisableSchema} and {@link ImmutableSchema}: a no-op in an
 * intersection at both runtime and the type level, but it reads as a deliberate
 * contract in capacity compositions. The runtime behaviour (the protobuf
 * encode / decode / message machinery) lives in the {@link ProtobufEncodable}
 * mixin function below.
 */
type ProtobufEncodableSchema = Record<never, never>;

/**
 * ProtobufEncodable — a capacity that equips a class with protobuf
 * (de)serialisation.
 *
 * It adds, to the adorned class:
 *   - `static encode`    — `mod.encode` (assert + encode).
 *   - `static decode`    — `mod.decode` (assert + decode).
 *   - `static message`   — `mod.message`, the proto3 schema string.
 *   - an instance `encode()` that encodes `this`.
 *   - an instance `decode()` that re-decodes this instance's own encoding
 *     (a round-trip self-check — mirrors the previous inline behaviour).
 *
 * Like {@link JsonSerialisable}, this capacity binds NO typia transform itself —
 * typia cannot resolve a generic type argument inside a mixin. It pulls
 * `encode` / `decode` / `message` out of the {@link SchemaModule} the model
 * handed to `defineModel`. If the model does not declare `ProtobufEncodable`
 * in its `capacities`, those three functions simply stay unused in the module.
 *
 * Unlike {@link JsonSerialisable}, {@link Immutable}, and {@link Triggerable}
 * (all of which return a NEW subclass), this mixin mutates `Base` **in place**
 * and returns the same constructor. That is a deliberate choice, not an
 * oversight:
 *   - protobuf (de)serialisation is a pure codec with no constructor override,
 *     so there is nothing that *requires* wrapping `Base` in a fresh subclass;
 *   - in-place mutation lets the capacity **decorate an existing standalone
 *     class** (e.g. `Post`, which carries its own hand-written constructor and
 *     methods) without forcing it into a `class X extends Mixin(...)` chain;
 *   - it still composes cleanly *after* other layered mixins, e.g.
 *     `composeCapabilities(PostBase, [JsonSerialisable, ProtobufEncodable], mod)`.
 *
 * It registers itself in the capacity registry so the class is introspectable as
 * `ProtobufEncodable` — but only when {@link Triggerable} has already paved the
 * registry (the standard guarded idiom
 * `Base.prototype.capacities && Base.prototype.addCapacity("X")`).
 *
 * @example
 * // In the model:
 * const schemaModule = {
 *   schema: typia.json.schema<[RepositoryData]>(),
 *   classify: (d) => typia.plain.assertClassify<RepositoryData>(d),
 *   toJSON: typia.json.createAssertStringify<RepositoryData>(),
 *   fromJSON: typia.json.createAssertParse<RepositoryData>(),
 *   encode: typia.protobuf.createAssertEncode<RepositoryData>(),
 *   decode: typia.protobuf.createAssertDecode<RepositoryData>(),
 *   message: typia.protobuf.message<RepositoryData>(),
 * };
 * const RepositoryBase = defineModel<RepositoryData>({
 *   schemaName: "RepositoryData",
 *   schemaModule,
 *   capacities: [JsonSerialisable, ProtobufEncodable],
 * });
 * Repository.encode(valid);   // → Uint8Array (pulled from the module)
 * Repository.decode(bytes);   // → validated data
 * Repository.message;         // → "syntax = \"proto3\";\nmessage Repository { … }"
 */
function ProtobufEncodable<TBase extends CapacityComposer>(
	Base: TBase,
	mod: SchemaModule<any>,
) {
	const { encode, decode, message } = mod;
	Base.prototype.capacities && Base.prototype.addCapacity("ProtobufEncodable");

	// Statics — bound codec functions, lifted onto the adorned class.
	(Base as any).encode = encode;
	(Base as any).decode = decode;
	(Base as any).message = message;

	// Instance methods — operate on `this` (the entity instance).
	(Base.prototype as any).encode = function (this: any): Uint8Array {
		return encode(this);
	};

	(Base.prototype as any).decode = function (this: any): unknown {
		// Round-trip self-check, matching the previous inline behaviour.
		return decode(encode(this));
	};

	return Base;
}

export { ProtobufEncodable, type ProtobufEncodableSchema };
