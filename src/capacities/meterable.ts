import type { CapacityComposer } from "./compose";
import type { ComposeContext } from "./compose";

export interface MeterableOptions {
	/**
	 * Metric name prefix for this model's operations, e.g. `"User"` or
	 * `"Repository"`. Defaults to the model's `schemaName` (`"UserSchema"`,
	 * `"RepositorySchema"`, …). Surfaces as `db.operation.name` in OTEL and as
	 * the prefix in `/debug/operations` (e.g. `User.load`, `Repository.create`).
	 */
	name?: string;
}

/** Static surface the `Meterable` capacity stamps onto the adorned model. */
export interface MeterableStatic {
	/** Read by `Repository` / `UserRepo` to decide whether to time each op. */
	isMeterable: boolean;
	/** Display prefix for operation metrics. */
	meterName: string;
}

/**
 * `Meterable` — a declarative MARKER capacity that opts a model's repository
 * operations into metrics.
 *
 * It deliberately wraps NO methods itself. Instead it stamps two statics onto
 * the adorned class:
 *   - `isMeterable: true`   — read by `Repository` (User) and `PostRepo` (Post)
 *                             to decide whether to time each operation;
 *   - `meterName: string`   — the display prefix for operation metrics
 *                             (`User.load`, `Post.create`, …).
 *
 * The actual timing happens at the repository boundary — `Repository.metered`
 * for `User`, the equivalent private helper in `PostRepo` — which calls
 * `queryTelemetry.recordOperation(...)`. That reuses the SAME in-memory
 * collector + OTLP sink the driver-level query metrics use, so operation
 * metrics show up in `/debug/operations` (dev) and as `db.client.operations.*`
 * OTEL metrics (prod). Models that don't wear it pay zero overhead.
 *
 * Enable it on a model exactly like any other capacity:
 *
 * @example
 * { capacity: Meterable, options: { name: "User" } }
 */
export const Meterable = <TBase extends CapacityComposer>(
	Base: TBase,
	_mod?: any,
	options: MeterableOptions = {},
	_ctx?: ComposeContext,
) => {
	const MeterableClass = class extends (Base as any) {
		static isMeterable = true;
		static meterName = options.name ?? (Base as any).schemaName ?? Base.name;
	};
	return MeterableClass as unknown as TBase & MeterableStatic;
};

export { Meterable as default };
