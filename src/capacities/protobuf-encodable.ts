import type { CapacityConstructor } from "./capable";

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
 * The protobuf codec a model binds when it adopts the capacity.
 *
 * typia's transformer cannot resolve a *generic* type argument inside a mixin
 * (`typia.protobuf.createAssertEncode<T>()` fails with
 * "non-specified generic argument" under the `@ttsc` bun plugin), so — exactly
 * like {@link JsonSerialisable} receives its `serializer` — the model supplies
 * the already-instantiated, schema-specific functions here. The plain-data
 * schema (`UserSchema`, `PostData`, …) is concrete at the model, so the typia
 * calls resolve fine there.
 */
interface ProtobufCodec<T> {
	/** Assert + encode data into protobuf bytes. */
	encode: (input: T) => Uint8Array;
	/** Assert + decode protobuf bytes back into data. */
	decode: (input: Uint8Array) => T;
	/** proto3 schema string for the message (`typia.protobuf.message<T>()`). */
	message: string;
}

/**
 * ProtobufEncodable — a capacity that equips a class with protobuf
 * (de)serialisation.
 *
 * It adds, to the adorned class:
 *   - `static encode`    — the bound `codec.encode` (assert + encode).
 *   - `static decode`    — the bound `codec.decode` (assert + decode).
 *   - `static message`   — the proto3 schema string (`typia.protobuf.message<T>()`).
 *   - an instance `encode()` that encodes `this`.
 *   - an instance `decode()` that re-decodes this instance's own encoding
 *     (a round-trip self-check — mirrors the previous inline behaviour).
 *
 * Unlike {@link JsonSerialisable} (and {@link Immutable}), this mixin mutates
 * `Base` **in place** and returns the same constructor — the way {@link Capable}
 * itself behaves. That is a deliberate choice, not an oversight:
 *   - protobuf (de)serialisation is a pure codec with no constructor override,
 *     so there is nothing that *requires* wrapping `Base` in a fresh subclass;
 *   - in-place mutation lets the capacity **decorate an existing standalone
 *     class** (e.g. `Post`, which carries its own hand-written constructor and
 *     methods) without forcing it into a `class X extends Mixin(...)` chain;
 *   - it still composes cleanly *after* other layered mixins, e.g.
 *     `ProtobufEncodable(JsonSerialisable(Capable(UserModel), json), pb)` —
 *     statics and prototype methods land on the composed class and are inherited
 *     by the downstream `class User extends caps`.
 *
 * It registers itself in the capacity registry so the class is introspectable as
 * `ProtobufEncodable` — but only when {@link Capable} has already paved the
 * registry (the standard guarded idiom
 * `Base.prototype.capacities && Base.prototype.addCapacity("X")`).
 *
 * @example
 * const pb = {
 *   encode: typia.protobuf.createAssertEncode<PostData>(),
 *   decode: typia.protobuf.createAssertDecode<PostData>(),
 *   message: typia.protobuf.message<PostData>(),
 * };
 * ProtobufEncodable(Capable(Post), pb);
 * Post.encode(valid);   // → Uint8Array
 * Post.decode(bytes);   // → validated data
 * Post.message;         // → "syntax = \"proto3\";\nmessage Post { … }"
 */
function ProtobufEncodable<TBase extends CapacityConstructor>(
	Base: TBase,
	codec: ProtobufCodec<any>,
) {
	Base.prototype.capacities && Base.prototype.addCapacity("ProtobufEncodable");

	// Statics — bound codec functions, lifted onto the adorned class.
	(Base as any).encode = codec.encode;
	(Base as any).decode = codec.decode;
	(Base as any).message = codec.message;

	// Instance methods — operate on `this` (the entity instance).
	(Base.prototype as any).encode = function (this: any): Uint8Array {
		return codec.encode(this);
	};

	(Base.prototype as any).decode = function (this: any): unknown {
		// Round-trip self-check, matching the previous inline behaviour.
		return codec.decode(codec.encode(this));
	};

	return Base;
}

export { ProtobufEncodable, type ProtobufEncodableSchema };
