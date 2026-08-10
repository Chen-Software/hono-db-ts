import type { Post } from "../models/post";

/**
 * `PostRepository` — the application-owned PORT for post persistence.
 *
 * This is a *capability*, not infrastructure. It exposes post concepts
 * (`findById`, `listByAuthor`, `historyOf`), never SQL, never blob keys,
 * never HTTP. `PostService` depends ONLY on this interface; the concrete
 * adapter (`PostRepo` over the version-history store, a future
 * `PostgresPostRepository`, a read-model, …) is swapped at the composition
 * root without touching business logic.
 *
 * Versioning contract: every `Post` is an immutable instance of a logical
 * object keyed by `id` (`updated_at` is the version). `create` seeds the
 * first version; `append` records a strictly-later version.
 */
export interface PostRepository {
	/** Latest version of the post with `id`, or `null` if it does not exist. */
	findById(id: string): Promise<Post | null>;

	/** Latest version of every known post. */
	listLatest(): Promise<Post[]>;

	/** Latest version of every post authored by `authorId`. */
	listByAuthor(authorId: string): Promise<Post[]>;

	/** Full append-only history (oldest → newest) for `id`, or `null`. */
	historyOf(id: string): Promise<Post[] | null>;

	/** Seed a brand-new post with its first (immutable) version. */
	create(post: Post): Promise<void>;

	/** Append a NEW version of an existing post. */
	append(post: Post): Promise<void>;

	/** Remove a post and its entire history. */
	delete(id: string): Promise<void>;
}
