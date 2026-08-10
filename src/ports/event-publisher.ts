/**
 * `EventPublisher` — the application-owned PORT for emitting domain events.
 *
 * This is the "record meaningful business events" seam: `post.published`,
 * `post.deleted`, `user.created`, … A subscriber (in-process bus, Cloudflare
 * Queues, Kafka, an OTEL bridge) can forward these to wherever telemetry /
 * reactivity / downstream systems live. The service never cares which one.
 *
 * `EventBus` (services/event-bus.ts) satisfies this structurally, so the
 * application layer does not need to know about the richer bus interface.
 */
export interface EventPublisher {
	/** Publish `payload` on `topic`. Fire-and-forget; no await on handlers. */
	publish(topic: string, payload: unknown): void;
}
