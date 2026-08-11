import { BusRegistry, type EventBus } from "../services/event-bus";
import type { CapacityConstructor } from "./capable";
import { Reactive, type ReactiveOptions } from "./reactive";
import { defaultIdentityMap } from "../storage/identity-map";
import { addLifecycleHook } from "./triggerable";

export interface DerivedSpec {
	/** The derived attribute, e.g. `"name.de"`. */
	attr: string;
	/** Dependency attribute(s) it is computed from, e.g. `["name.en"]`. */
	from: string | string[];
	/** Recompute from current deps. Receives `(self, depValues)`. */
	recompute: (self: any, deps: Record<string, any>) => any;
	/**
	 * If true, a dependency change marks the attr DIRTY + publishes (instead of
	 * recomputing in-process). The actual re-materialisation happens when a
	 * `Reactive` reaction (or a scheduled drain) delivers the event. This is
	 * the bridge to out-of-process / deferred recompute.
	 */
	lazy?: boolean;
	/**
	 * Bus topic published to on a dependency change AND subscribed from for
	 * re-materialisation. Enables cross-process + scheduled recompute. Omit for
	 * purely in-process derived state.
	 */
	topic?: string;
	/**
	 * When false, the topic is published but NO immediate `Reactive` reaction is
	 * wired here — only a scheduled `bus.drain` (or an external subscriber)
	 * picks it up. Defaults to true.
	 */
	reactive?: boolean;
}

export interface DerivableOptions {
	/** Bus for the publish/subscribe bridge. Name or instance. */
	bus?: EventBus | string;
	/** The derived attributes this model maintains. */
	derived: DerivedSpec[];
}

/**
 * Derivable — computed / cached attributes that RE-MATERIALISE when their
 * dependencies change. This is the capacity for the "update `name.en` →
 * regenerate `name.de` (or mark it dirty for the next scheduled job)" case —
 * which is a DERIVATION, not a `Referencible` FK relationship.
 *
 * Two trigger paths, composed from the event seam:
 *   1. IN-PROCESS (eager, no bus): an `onUpdate` lifecycle hook (synchronous,
 *      part of `Triggerable`) recomputes the derived attr immediately when a
 *      dependency changes. This is exactly what you could already do with
 *      `Triggerable` today — sufficient when everything is same-process and
 *      both entities are live.
 *   2. REACTIVE (lazy + topic): a dependency change publishes to a bus topic;
 *      a `Reactive` reaction (subscriber-centric) re-materialises the target
 *      instance. The trigger source is opaque — an in-process update, a remote
 *      translation service, a webhook, or a `bus.drain` on a schedule all look
 *      identical to the model. This is what `Triggerable`'s emitter-centric
 *      events CANNOT do: reach a persisted-but-unloaded entity or a remote one.
 *
 * If `bus` is supplied, `Derivable` internally folds `Reactive` so each
 * `topic` becomes a class-level subscription that calls `recomputeFor(id, attr)`
 * — i.e. the model reactively receives the stream and re-materialises itself.
 *
 * Adds to the adorned class:
 *   instance.recompute(attr?)  — force re-materialise one (or all) derived attrs
 *   static  recomputeFor(id, attr?, event?) — re-materialise a (possibly
 *     persisted) instance by id, resolving it from the identity map
 */
function Derivable<TBase extends CapacityConstructor>(
	Base: TBase,
	_mod?: any,
	options: DerivableOptions,
	_ctx?: any,
): TBase {
	Base.prototype.capacities && Base.prototype.addCapacity?.("Derivable");

	const specs = options.derived ?? [];
	const bus: EventBus | undefined = options.bus
		? BusRegistry.resolve(options.bus)
		: undefined;
	const schemaName = () => (Base as any).schemaName as string;

	const depList = (s: DerivedSpec) =>
		Array.isArray(s.from) ? s.from : [s.from];

	const compute = (
		inst: any,
		spec: DerivedSpec,
		depsOverride?: Record<string, any>,
	) => {
		// Prefer values carried in the event payload (post-update values), so a
		// reactive re-materialisation triggered during the update hook still
		// uses the NEW deps, not the not-yet-committed live instance.
		const deps =
			depsOverride ??
			Object.fromEntries(depList(spec).map((d) => [d, inst[d]]));
		inst[spec.attr] = spec.recompute(inst, deps);
		if (inst.__dirty) inst.__dirty[spec.attr] = false;
	};

	/**
	 * Materialise a spec whose dependency changed:
	 *   - eager (lazy:false)          → compute in-process (into `merged` during
	 *                                   update, so it commits atomically).
	 *   - lazy + reactive (local sub) → ALSO compute in-process (so the local
	 *                                   replica is consistent immediately) AND
	 *                                   publish (so remote replicas converge).
	 *   - lazy + !reactive (scheduled)→ publish only; mark dirty and let a
	 *                                   `bus.drain` / external subscriber
	 *                                   re-materialise later (eventual).
	 */
	const materialise = (inst: any, spec: DerivedSpec) => {
		const depVals = Object.fromEntries(depList(spec).map((d) => [d, inst[d]]));
		if (spec.lazy) inst.__dirty[spec.attr] = true;
		if (bus && spec.topic) {
			// Ship the NEW dep values so any subscriber re-materialises from the
			// post-update state, not the pre-assign live one.
			bus.publish(spec.topic, { id: inst.id, attr: spec.attr, deps: depVals });
		}
		if (!spec.lazy || spec.reactive !== false) {
			compute(inst, spec, depVals);
		}
	};

	const onChanged = (inst: any, patch: Record<string, unknown>) => {
		inst.__dirty = inst.__dirty ?? {};
		for (const spec of specs) {
			const deps = depList(spec);
			if (!deps.some((d) => d in (patch ?? {}))) continue;
			materialise(inst, spec);
		}
	};

	// (1) fresh construction — materialise eager / lazy derived.
	addLifecycleHook(Base, "onConstruct", (inst: any) => {
		inst.__dirty = inst.__dirty ?? {};
		for (const spec of specs) materialise(inst, spec);
		return inst;
	});

	// (2) update — recompute eager / mark-dirty+publish lazy when a dep changes.
	//     `patch` is forwarded by `defineModel.update` so we know what changed.
	addLifecycleHook(
		Base,
		"onUpdate",
		(inst: any, patch: Record<string, unknown>) => {
			onChanged(inst, patch);
			return inst;
		},
	);

	// (3) instance + static re-materialisation API (attached to `Base` so both
	//     `Base` and any subclass `Reactive` returns inherit them — and so the
	//     reactive handler's captured `Ctor` finds `recomputeFor`).
	(Base as any).prototype.recompute = function (attr?: string, event?: any) {
		const targets = attr ? specs.filter((s) => s.attr === attr) : specs;
		for (const spec of targets) compute(this, spec, event?.deps);
		return this;
	};
	(Base as any).recomputeFor = (
		id: string | number,
		attr?: string,
		_event?: any,
	) => {
		// Honest gap: if the target instance isn't loaded in the identity map,
		// we can't reach it here — that's the whole point of `lazy` + a scheduled
		// drain or an external subscriber that reloads it first.
		const inst = defaultIdentityMap.get(schemaName(), String(id)) as any;
		if (!inst) return undefined;
		return inst.recompute?.(attr, _event);
	};

	// (4) reactive wiring — fold `Reactive` so each `topic` becomes a class-level
	//     subscription that re-materialises the target instance by id.
	let Out: any = Base;
	if (bus) {
		const reactions = specs
			.filter((s) => s.topic && s.reactive !== false)
			.map((s) => ({
				topic: s.topic as string,
				handler: (_event: any, Ctor: any) =>
					(Ctor as any).recomputeFor?.(
						(_event as any).id,
						(_event as any).attr,
						_event,
					),
			}));
		const reactiveOpts: ReactiveOptions = { bus, reactions };
		Out = Reactive(Base, _mod, reactiveOpts, _ctx);
	}

	return Out;
}

export { Derivable };
