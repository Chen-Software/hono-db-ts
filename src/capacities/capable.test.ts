import { describe, expect, it } from "bun:test";
import { Capable, type CapacityConstructor } from "./capable";
import { Identifiable } from "./identifiable";
import { Immutable } from "./immutable";

/**
 * Shared contract for anything carrying the capacity registry that `Capable`
 * installs onto a prototype. Used to read the dynamically-assigned
 * `capacities` / `addCapacity` without sprinkling `any` everywhere.
 */
type WithCapacities = {
	capacities: Set<string>;
	addCapacity: (capacity: string) => void;
};

/**
 * A fresh, bare model class per call. `Capable` MUTATES the prototype it is
 * handed, so handing every test a brand-new class keeps registrations from
 * leaking across cases.
 */
const makeModel = () =>
	class Model {
		constructor(public readonly props: Record<string, unknown> = {}) {}
	};

/**
 * A synthetic capacity that uses EXACTLY the registration idiom the real
 * capacities use:
 *
 *     Base.prototype.capacities && Base.prototype.addCapacity("X");
 *
 * It contributes no other behaviour, so it isolates the guard that `Capable`
 * enables. Without `capacities` on the prototype this is a silent no-op —
 * that silence is the control `Capable` is responsible for.
 */
function Guarded<TBase extends CapacityConstructor>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Guarded");
	return class extends Base {};
}

// ---------------------------------------------------------------------------
// 1. Capable provisions the registry
// ---------------------------------------------------------------------------
describe("Capable provisions the capacity registry", () => {
	it("seeds a 'capacities' Set containing 'Capable' on the prototype", () => {
		const C = Capable(makeModel());
		const proto = (C as unknown as WithCapacities).prototype;
		expect(proto.capacities).toBeInstanceOf(Set);
		expect(proto.capacities.has("Capable")).toBe(true);
		expect(proto.capacities.size).toBe(1);
	});

	it("returns the same constructor (it patches in place, not a wrapper)", () => {
		const Model = makeModel();
		const C = Capable(Model);
		expect(C).toBe(Model);
	});

	it("installs an addCapacity method on the prototype", () => {
		const C = Capable(makeModel());
		expect(typeof (C as unknown as WithCapacities).prototype.addCapacity).toBe(
			"function",
		);
	});
});

// ---------------------------------------------------------------------------
// 2. addCapacity writes into the shared registry
// ---------------------------------------------------------------------------
describe("Capable.addCapacity writes into the shared registry", () => {
	it("a registered name is visible on the prototype Set", () => {
		const C = Capable(makeModel());
		const proto = (C as unknown as WithCapacities).prototype;
		proto.addCapacity("Custom");
		expect(proto.capacities.has("Custom")).toBe(true);
	});

	it("registration is shared prototype-wide (one Set, many instances)", () => {
		const C = Capable(makeModel());
		const proto = (C as unknown as WithCapacities).prototype;
		(new C() as unknown as WithCapacities).addCapacity("A");
		(new C() as unknown as WithCapacities).addCapacity("B");
		// "A" and "B" land on the SAME prototype Set as "Capable".
		expect(proto.capacities).toEqual(new Set(["Capable", "A", "B"]));
	});

	it("duplicates are de-duplicated by the Set", () => {
		const C = Capable(makeModel());
		const proto = (C as unknown as WithCapacities).prototype;
		proto.addCapacity("Dup");
		proto.addCapacity("Dup");
		expect(proto.capacities.size).toBe(2); // "Capable" + "Dup"
	});
});

// ---------------------------------------------------------------------------
// 3. THE CONTROL: other capacities register ONLY because Capable paved the way
// ---------------------------------------------------------------------------
describe("Capable controls WHEN other capacities register", () => {
	it("a downstream capacity registers itself once Capable is present", () => {
		// Capable is applied to the model first (innermost), then Identifiable.
		const C = Identifiable(Capable(makeModel()));
		const proto = (C as unknown as WithCapacities).prototype;
		expect(proto.capacities.has("Capable")).toBe(true);
		expect(proto.capacities.has("Identifiable")).toBe(true);
	});

	it("registration happens at mixin-composition time, not at instantiation", () => {
		const C = Identifiable(Capable(makeModel()));
		// No instance created yet — the names are already on the prototype Set.
		expect((C as unknown as WithCapacities).prototype.capacities).toEqual(
			new Set(["Capable", "Identifiable"]),
		);
	});

	it("the synthetic Guarded capacity registers when Capable is present", () => {
		const C = Guarded(Capable(makeModel()));
		expect(
			(C as unknown as WithCapacities).prototype.capacities.has("Guarded"),
		).toBe(true);
	});

	it("WITHOUT Capable, a downstream capacity silently refuses to register", () => {
		const C = Guarded(makeModel()); // no Capable anywhere in the chain
		const inst = new C();
		// The guard `Base.prototype.capacities && …` short-circuits: no Set is
		// ever created, so nothing was registered.
		expect(
			(inst as unknown as Partial<WithCapacities>).capacities,
		).toBeUndefined();
	});

	it("the real Immutable capacity obeys the same guard (no Capable → no register)", () => {
		const C = Immutable(makeModel());
		expect(
			(new C() as unknown as Partial<WithCapacities>).capacities,
		).toBeUndefined();
	});

	it("with Capable present, the full chain (Identifiable + Immutable) all register", () => {
		const C = Immutable(Identifiable(Capable(makeModel())));
		const caps = (new C() as unknown as WithCapacities).capacities;
		expect(caps.has("Capable")).toBe(true);
		expect(caps.has("Identifiable")).toBe(true);
		expect(caps.has("Immutable")).toBe(true);
	});

	it("ORDERING: a capacity applied BEFORE Capable is never registered", () => {
		// Identifiable runs against the bare model (no capacities yet) and is
		// silently dropped; only the capacities applied after Capable survive.
		const C = Immutable(Capable(Identifiable(makeModel())));
		const caps = (new C() as unknown as WithCapacities).capacities;
		expect(caps.has("Capable")).toBe(true);
		expect(caps.has("Immutable")).toBe(true);
		expect(caps.has("Identifiable")).toBe(false);
	});
});
