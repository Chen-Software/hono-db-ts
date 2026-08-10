/**
 * Observability providers — the counterexample that kills the "every provider
 * has a URI" framing. `TelemetryProvider` and `MonitoringProvider` are providers
 * in exactly the same sense as `FsProvider` / `ObjectStoreProvider` (injectable,
 * capability-shaped modules composed per deployment), yet they touch no URI and
 * do no I/O to a remote endpoint unless *their* particular backend does. A
 * `UserService` may take all of them side by side; only the storage ones care
 * about addresses.
 */

/** Records discrete domain events (e.g. "user.created"). */
export interface TelemetryProvider {
	readonly name: string;
	record(event: string, props?: Record<string, unknown>): void;
}

/** Emits numeric metrics with optional tags (e.g. counters / gauges). */
export interface MonitoringProvider {
	readonly name: string;
	emit(metric: string, value: number, tags?: Record<string, string>): void;
}

/** Default no-op implementations, so a service can omit observability entirely. */
export class NoopTelemetry implements TelemetryProvider {
	readonly name = "noop-telemetry";
	record(): void {}
}
export class NoopMonitoring implements MonitoringProvider {
	readonly name = "noop-monitoring";
	emit(): void {}
}
