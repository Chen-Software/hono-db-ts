import type { Post } from "../models/post";
import type { PostRepository } from "../ports/post-repository";
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
 * The `create`/`append` distinction mirrors the versioned model contract:
 * `create` seeds the first version of a logical post, `append` records a
 * strictly-later version.
 */
export class PostRepo implements PostRepository {
	private store: VersionHistoryStore<Post>;

	constructor(store?: VersionHistoryStore<Post>) {
		this.store = store ?? createVersionHistoryStore<Post>();
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

	async create(post: Post): Promise<void> {
		if (this.store.has(post.id)) {
			throw new Error(`PostRepo.create: post already exists: ${post.id}`);
		}
		this.store.create(post);
	}

	async append(post: Post): Promise<void> {
		if (!this.store.has(post.id)) {
			throw new Error(
				`PostRepo.append: no history for "${post.id}" — call create() first`,
			);
		}
		this.store.append(post);
	}

	async delete(id: string): Promise<void> {
		this.store.remove(id);
	}
}
