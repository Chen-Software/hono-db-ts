import type { Post } from "../models/post";
import type { DomainEvent, PostRepository } from "../ports/post-repository";
import type { EventPublisher } from "../ports/event-publisher";
import {
	createVersionHistoryStore,
	type VersionHistoryStore,
} from "../services/version-history-store";

/**
 * `PostRepo` — an INFRASTRUCTURE adapter implementing the `PostRepository` port.
 *
 * This is the *reference* implementation: it persists immutable post versions
 * in an in-process append-only `VersionHistoryStore` (the same shape `UserRepo`
 * follows, but for versioned posts). The service above cannot tell this apart
 * from a `PostgresPostRepository` — swap the adapter at the composition root
 * (e.g. a SQL table with a `(id, updated_at)` uniqueness constraint) and every
 * use case keeps working unchanged.
 *
 * Outbox: the store is the single source of truth for both the post version
 * AND its lifecycle event. `PostRepo` subscribes to `store.onChange` once and
 * forwards the event to the domain-event `bus` as part of the same write. The
 * application service therefore makes exactly ONE call per use case
 * (`repo.create` / `repo.append` / `repo.delete`) and never calls the bus
 * directly for post events — eliminating the dual-write/transaction-boundary
 * gap. For a relational backend this becomes "insert version row + insert
 * outbox row in one transaction, then dispatch".
 */
export class PostRepo implements PostRepository {
	private store: VersionHistoryStore<Post>;
	private bus?: EventPublisher;

	constructor(bus?: EventPublisher, store?: VersionHistoryStore<Post>) {
		this.bus = bus;
		this.store = store ?? createVersionHistoryStore<Post>();
		this.store.onChange((_entity, event) => {
			if (event) this.bus?.publish(event.topic, event.payload);
		});
	}

	async findById(id: string): Promise<Post | null> {
		return this.store.latestOf(id) ?? null;
	}

	async listLatest(): Promise<Post[]> {
		return this.store.listLatest();
	}

	async listByAuthor(authorId: string): Promise<Post[]> {
		return this.store.listLatest().filter((p) => p.authorId === authorId);
	}

	async historyOf(id: string): Promise<Post[] | null> {
		return this.store.historyOf(id) ?? null;
	}

	async create(post: Post, event?: DomainEvent): Promise<void> {
		if (this.store.has(post.id)) {
			throw new Error(`PostRepo.create: post already exists: ${post.id}`);
		}
		this.store.create(post, event);
	}

	async append(post: Post, event?: DomainEvent): Promise<void> {
		if (!this.store.has(post.id)) {
			throw new Error(
				`PostRepo.append: no history for "${post.id}" — call create() first`,
			);
		}
		this.store.append(post, event);
	}

	async delete(id: string, event?: DomainEvent): Promise<void> {
		this.store.remove(id, event);
	}
}
