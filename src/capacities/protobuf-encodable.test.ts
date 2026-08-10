import { describe, expect, it } from "bun:test";
import typia from "typia";
import { Capable } from "./capable";
import { JsonSerialisable } from "./json-serialisable";
import { ProtobufEncodable } from "./protobuf-encodable";
import type { SchemaModule } from "./schema-module";

/**
 * A tiny concrete schema used to bind the codec. typia cannot resolve a generic
 * transform inside the mixin, so the model (here, the test) supplies the
 * already-instantiated, schema-specific functions — exactly as a real model does.
 */
interface Ping {
	id: string;
	n: number;
}

// The fixed schema module — bound once, handed to every capacity.
const pingModule: SchemaModule<Ping> = {
	schema: typia.json.schema<[Ping]>(),
	classify: (d: any) => d,
	toJSON: typia.json.createAssertStringify<Ping>(),
	fromJSON: typia.json.createAssertParse<Ping>(),
	encode: typia.protobuf.createAssertEncode<Ping>(),
	decode: typia.protobuf.createAssertDecode<Ping>(),
	message: typia.protobuf.message<Ping>(),
};

/** Cast helper so we can read the (runtime) capacity registry without `any`. */
type WithCapacities = {
	prototype: {
		capacities?: Set<string>;
		addCapacity?: (capacity: string) => void;
	};
};

/** Fresh bare class each test — the mixin mutates `Base` in place, so isolation matters. */
function makeModel() {
	return class PingModel {};
}

describe("ProtobufEncodable — registration (Capable gatekeeper)", () => {
	it("registers itself once Capable has paved the registry", () => {
		const Model = ProtobufEncodable(Capable(makeModel()), pingModule);
		const caps = (Model as unknown as WithCapacities).prototype.capacities;
		expect(caps).toBeDefined();
		expect([...caps!]).toContain("Capable");
		expect([...caps!]).toContain("ProtobufEncodable");
	});

	it("does NOT register when Capable is absent (guard short-circuits)", () => {
		const Model = ProtobufEncodable(makeModel(), pingModule);
		// No registry was ever created, so `capacities` stays undefined.
		expect((Model as unknown as WithCapacities).prototype.capacities).toBeUndefined();
	});

	it("still attaches the codec even without Capable", () => {
		// The capacity guard only gates *registration*; codec attachment is
		// unconditional, matching JsonSerialisable / Immutable behaviour.
		const Model = ProtobufEncodable(makeModel(), pingModule);
		expect(typeof (Model as any).encode).toBe("function");
		expect(typeof (Model as any).decode).toBe("function");
	});
});

describe("ProtobufEncodable — attached codec", () => {
	const Model = ProtobufEncodable(Capable(makeModel()), pingModule);

	it("attaches static encode / decode / message", () => {
		expect(typeof (Model as any).encode).toBe("function");
		expect(typeof (Model as any).decode).toBe("function");
		expect(typeof (Model as any).message).toBe("string");
	});

	it("message is a proto3 schema string naming the message", () => {
		const msg = (Model as any).message as string;
		expect(msg).toContain("proto3");
		expect(msg).toContain("message Ping");
	});

	it("static encode → decode round-trips data", () => {
		const data: Ping = { id: "abc", n: 42 };
		const bytes = (Model as any).encode(data);
		expect(bytes).toBeInstanceOf(Uint8Array);

		const back = (Model as any).decode(bytes) as Ping;
		expect(back.id).toBe("abc");
		expect(back.n).toBe(42);
	});

	it("attaches instance encode() / decode() that round-trip this", () => {
		const inst = new (Model as any)() as Ping & {
			encode(): Uint8Array;
			decode(): Ping;
		};
		inst.id = "yz";
		inst.n = 7;

		expect(typeof inst.encode).toBe("function");
		expect(typeof inst.decode).toBe("function");

		const back = inst.decode();
		expect(back.id).toBe("yz");
		expect(back.n).toBe(7);
	});
});

describe("ProtobufEncodable — composes after JsonSerialisable (real wiring)", () => {
	it("registers both capacities and exposes both codecs", () => {
		const Composed = ProtobufEncodable(
			JsonSerialisable(Capable(makeModel()), pingModule),
			pingModule,
		);
		const caps = (Composed as unknown as WithCapacities).prototype.capacities;
		expect([...caps!]).toContain("Capable");
		expect([...caps!]).toContain("JsonSerialisable");
		expect([...caps!]).toContain("ProtobufEncodable");

		// Both codecs reachable on the composed class.
		expect(typeof (Composed as any).toJSON).toBe("function");
		expect(typeof (Composed as any).encode).toBe("function");
		expect(typeof (Composed as any).message).toBe("string");
	});
});
