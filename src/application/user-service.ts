import type { User, UserSchema } from "../models/user";
import type { EventPublisher } from "../ports/event-publisher";
import type { UserRepository, UserRole } from "../ports/user-repository";

/**
 * `UserService` — an APPLICATION-LAYER service.
 *
 * It orchestrates user use cases and depends ONLY on ports:
 *   - `UserRepository` — a persistence *capability* (never SQL, never a store
 *     provider, never a backend);
 *   - `EventPublisher` — the "record a meaningful business event" seam
 *     (`user.created`, `user.deleted`).
 *
 * It knows nothing about Hono, HTTP, Postgres, S3, or the filesystem. REST
 * controllers (transport) parse HTTP and call these same methods; CLI and
 * queue consumers can do the same with zero changes here.
 *
 * Telemetry is deliberately NOT composed in. Cross-cutting instrumentation
 * (traces/spans around the request) belongs to the framework/runtime, and
 * business events already flow through the `EventPublisher` for anyone who
 * wants to forward them (OTEL, metrics, reactivity).
 */
export interface UserServiceOptions {
	/** Port: persistence capability implemented by an infra adapter. */
	repo: UserRepository;
	/** Port: domain-event emitter (optional; no-op when omitted). */
	bus?: EventPublisher;
}

export class UserService {
	private bus?: EventPublisher;

	constructor(private opts: UserServiceOptions) {
		this.bus = opts.bus;
	}

	async createUser(input: Partial<UserSchema>): Promise<User> {
		const user = await this.opts.repo.insert(input);
		this.bus?.publish("user.created", { id: user.id });
		return user;
	}

	async updateUser(
		id: string,
		input: Partial<UserSchema>,
	): Promise<User | undefined> {
		const existing = await this.opts.repo.load(id);
		if (!existing) return undefined;
		const user = await this.opts.repo.update(id, input);
		this.bus?.publish("user.updated", { id });
		return user;
	}

	async getUser(id: string): Promise<User | undefined> {
		return this.opts.repo.load(id);
	}

	async listUsers(): Promise<User[]> {
		return this.opts.repo.list();
	}

	async listUsersByRole(role: UserRole): Promise<User[]> {
		return this.opts.repo.listByRole(role);
	}

	async deleteUser(id: string): Promise<void> {
		await this.opts.repo.delete(id);
		this.bus?.publish("user.deleted", { id });
	}
}
