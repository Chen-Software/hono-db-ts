import type { CapacityComposer } from "./compose";
import { describe, expect, it } from "bun:test";
import { Identifiable } from "./identifiable";
import { Immutable } from "./immutable";
import { Triggerable } from "./triggerable";

/**
 * Shared contract for anything carrying the capacity registry that
 * `Triggerable` installs onto a prototype. Used to read the dynamically-assigned
 * `capacities` / `addCapacity` without sprinkling `any` everywhere.
 */
type WithCapacities = {
	capacities: Set<string>;
	addCapacity: (capacity: string) => void;
};

/**
 * A fresh, bare model class per call. `Triggerable` returns a NEW subclass
 * (it does NOT mutate the handed class in place), so handing every test a
 * brand-new class keeps registrations from leaking across cases.
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
 * It contributes no other behaviour, so it isolates the guard that
 * `Triggerable` enables. Without `capacities` on the prototype this is a silent
 * no-op — that silence is the control `Triggerable` is responsible for.
 */
function Guarded<TBase extends CapacityComposer>(Base: TBase) {
	Base.prototype.capacities && Base.prototype.addCapacity("Guarded");
	return class extends Base {};
}

// ---------------------------------------------------------------------------
// 1. Triggerable provisions the registry (the old `Capable` contract)
// ---------------------------------------------------------------------------
describe("Triggerable provisions the capacity registry", () => {
	it("seeds a 'capacities' Set containing 'Triggerable' on the prototype", () => {
		const C = Triggerable(makeModel());
		const proto = (C as unknown as WithCapacities).prototype;
		expect(proto.capacities).toBeInstanceOf(Set);
		expect(proto.capacities.has("Triggerable")).toBe(true);
		expect(proto.capacities.size).toBe(1);
	});

	it("returns a NEW constructor (a subclass, not an in-place patch)", () => {
		const Model = makeModel();
		const C = Triggerable(Model);
		expect(C).not.toBe(Model);
		expect(typeof C).toBe("function");
	});

	it("installs an addCapacity method on the prototype", () => {
		const C = Triggerable(makeModel());
		expect(typeof (C as unknown as WithCapacities).prototype.addCapacity).toBe(
			"function",
		);
	});
});

// ---------------------------------------------------------------------------
// 2. addCapacity writes into the shared registry
// ---------------------------------------------------------------------------
describe("Triggerable.addCapacity writes into the shared registry", () => {
	it("a registered name is visible on the prototype Set", () => {
		const C = Triggerable(makeModel());
		const proto = (C as unknown as WithCapacities).prototype;
		proto.addCapacity("Custom");
		expect(proto.capacities.has("Custom")).toBe(true);
	});

	it("registration is shared prototype-wide (one Set, many instances)", () => {
		const C = Triggerable(makeModel());
		const proto = (C as unknown as WithCapacities).prototype;
		(new C() as unknown as WithCapacities).addCapacity("A");
		(new C() as unknown as WithCapacities).addCapacity("B");
		// "A" and "B" land on the SAME prototype Set as "Triggerable".
		expect(proto.capacities).toEqual(new Set(["Triggerable", "A", "B"]));
	});

	it("duplicates are de-duplicated by the Set", () => {
		const C = Triggerable(makeModel());
		const proto = (C as unknown as WithCapacities).prototype;
		proto.addCapacity("Dup");
		proto.addCapacity("Dup");
		expect(proto.capacities.size).toBe(2); // "Triggerable" + "Dup"
	});
});

// ---------------------------------------------------------------------------
// 3. THE CONTROL: other capacities register ONLY because Triggerable paved the way
// ---------------------------------------------------------------------------
describe("Triggerable controls WHEN other capacities register", () => {
	it("a downstream capacity registers itself once Triggerable is present", () => {
		// Triggerable is applied to the model first (innermost), then Identifiable.
		const C = Identifiable(Triggerable(makeModel()));
		const proto = (C as unknown as WithCapacities).prototype;
		expect(proto.capacities.has("Triggerable")).toBe(true);
		expect(proto.capacities.has("Identifiable")).toBe(true);
	});

	it("registration happens at mixin-composition time, not at instantiation", () => {
		const C = Identifiable(Triggerable(makeModel()));
		// No instance created yet — the names are already on the prototype Set.
		expect((C as unknown as WithCapacities).prototype.capacities).toEqual(
			new Set(["Triggerable", "Identifiable"]),
		);
	});

	it("the synthetic Guarded capacity registers when Triggerable is present", () => {
		const C = Guarded(Triggerable(makeModel()));
		expect(
			(C as unknown as WithCapacities).prototype.capacities.has("Guarded"),
		).toBe(true);
	});

	it("WITHOUT Triggerable, a downstream capacity silently refuses to register", () => {
		const C = Guarded(makeModel()); // no Triggerable anywhere in the chain
		const inst = new C();
		// The guard `Base.prototype.capacities && …` short-circuits: no Set is
		// ever created, so nothing was registered.
		expect(
			(inst as unknown as Partial<WithCapacities>).capacities,
		).toBeUndefined();
	});

	it("the real Immutable capacity obeys the same guard (no Triggerable → no register)", () => {
		const C = Immutable(makeModel());
		expect(
			(new C() as unknown as Partial<WithCapacities>).capacities,
		).toBeUndefined();
	});

	it("with Triggerable present, the full chain (Identifiable + Immutable) all register", () => {
		const C = Immutable(Identifiable(Triggerable(makeModel())));
		const caps = (new C() as unknown as WithCapacities).capacities;
		expect(caps.has("Triggerable")).toBe(true);
		expect(caps.has("Identifiable")).toBe(true);
		expect(caps.has("Immutable")).toBe(true);
	});

	it("ORDERING: a capacity applied BEFORE Triggerable is never registered", () => {
		// Identifiable runs against the bare model (no capacities yet) and is
		// silently dropped; only the capacities applied after Triggerable survive.
		const C = Immutable(Triggerable(Identifiable(makeModel())));
		const caps = (new C() as unknown as WithCapacities).capacities;
		expect(caps.has("Triggerable")).toBe(true);
		expect(caps.has("Immutable")).toBe(true);
		expect(caps.has("Identifiable")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 4. The lifecycle/event surface is paved and usable (the rest of the merge)
// ---------------------------------------------------------------------------
describe("Triggerable paves the lifecycle + event surface", () => {
	it("exposes static addHook / on / before / after / emit", () => {
		const C = Triggerable(makeModel());
		expect(typeof (C as any).addHook).toBe("function");
		expect(typeof (C as any).on).toBe("function");
		expect(typeof (C as any).before).toBe("function");
		expect(typeof (C as any).after).toBe("function");
		expect(typeof (C as any).emit).toBe("function");
	});

	it("on() subscribes and the returned fn unsubscribes", () => {
		const C = Triggerable(makeModel());
		let seen: unknown = null;
		const off = (C as any).on("afterUpdate", (p: unknown) => {
			seen = p;
		});
		expect((C as any).listeners.afterUpdate).toHaveLength(1);
		off();
		expect((C as any).listeners.afterUpdate).toHaveLength(0);
	});

	it("emit() resolves even with no subscribers", async () => {
		const C = Triggerable(makeModel());
		await expect((C as any).emit("afterUpdate", {})).resolves.toBeUndefined();
	});
});
