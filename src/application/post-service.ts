import { Post, type PostData } from "../models/post";
import { User } from "../models/user";
import type {
	ImageUpload,
	PostAsset,
	PostAssetStore,
} from "../ports/asset-store";
import type { EventPublisher } from "../ports/event-publisher";
import type { PostRepository } from "../ports/post-repository";

// ---------------------------------------------------------------------------
// Domain errors — the application layer's vocabulary for "what went wrong".
// Transport adapters map these onto HTTP status codes (404 / 409 / 400).
// ---------------------------------------------------------------------------

export class PostNotFoundError extends Error {
	constructor(id: string) {
		super(`Post not found: ${id}`);
		this.name = "PostNotFoundError";
	}
}

export class PostAlreadyExistsError extends Error {
	constructor(id: string) {
		super(`Post already exists: ${id}`);
		this.name = "PostAlreadyExistsError";
	}
}

export class InvalidInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidInputError";
	}
}

/**
 * `PostService` — an APPLICATION-LAYER service.
 *
 * The use-case surface for posts, organised around what the system does:
 * create / edit / publish / delete / upload an image. It depends ONLY on
 * capabilities:
 *
 *   PostService
 *     ├── PostRepository     — port: post persistence
 *     ├── EventPublisher     — port: business events (post.created, …)
 *     └── PostAssetStore     — port: media, expressed as a business capability
 *
 * None of those are infrastructure. `PostRepo` (over an append-only version
 * store today), a `PostgresPostRepository`, an S3 asset store or a local one —
 * the service cannot tell the difference, because it never names one.
 *
 * Note: publishing is deliberately a USE CASE here, not a separate service.
 * For a small system `PostService.publish()` is the right granularity; if the
 * system grows (scheduling, fan-out, downstream workflow), it can be promoted
 * to its own `PublishingService` without changing the ports it uses.
 */
export interface PostServiceOptions {
	/** Port: persistence capability (implemented by an infra adapter). */
	repo: PostRepository;
	/** Port: domain-event emitter (optional; no-op when omitted). */
	bus?: EventPublisher;
	/** Port: media storage (optional; only needed by `uploadImage`). */
	assets?: PostAssetStore;
}

export class PostService {
	constructor(private opts: PostServiceOptions) {}

	/**
	 * Create a post. `updated_at` is authoritative: the first version is
	 * stamped with the entity's birth time (`created_at`), regardless of what
	 * the caller sent.
	 */
	async create(input: PostData): Promise<Post> {
		// `author` is a nested User AGGREGATE. `Post.from` does not fully
		// recurse into a class-typed property (it misses e.g. the email
		// format), so we validate the author explicitly at the service boundary.
		const authorResult = User.validate(input.author);
		if (!authorResult.success) {
			throw new InvalidInputError("Invalid author");
		}
		if (await this.opts.repo.findById(input.id)) {
			throw new PostAlreadyExistsError(input.id);
		}
		const post = Post.from({
			...input,
			updated_at: input.created_at,
			// `PostData` carries both the nested `author` (for embedding) and the
			// `authorId` FK. The transport sends the full `author`; derive the FK
			// from it so `Post.from`'s typia validation (which requires `authorId`)
			// passes without the client having to supply the duplicate id.
			authorId: input.author.id,
		});
		await this.opts.repo.create(post, {
			topic: "post.created",
			payload: { id: post.id },
		});
		return post;
	}

	/** Latest version of a post, or throw. */
	async get(id: string): Promise<Post> {
		const post = await this.opts.repo.findById(id);
		if (!post) throw new PostNotFoundError(id);
		return post;
	}

	/** Latest version of every post. */
	async list(): Promise<Post[]> {
		return this.opts.repo.listLatest();
	}

	/** Full immutable audit log for a post, or throw. */
	async getHistory(id: string): Promise<Post[]> {
		const history = await this.opts.repo.historyOf(id);
		if (!history || history.length === 0) throw new PostNotFoundError(id);
		return history;
	}

	/**
	 * Partial update. Produces a brand-new immutable instance: same `id`, a
	 * strictly-later `updated_at` (the version); `id`/`updated_at` in the
	 * patch are ignored.
	 */
	async edit(id: string, patch: Partial<PostData>): Promise<Post> {
		const existing = await this.opts.repo.findById(id);
		if (!existing) throw new PostNotFoundError(id);
		if (patch.author) {
			const authorResult = User.validate(patch.author);
			if (!authorResult.success) {
				throw new InvalidInputError("Invalid author");
			}
		}
		const updated = existing.update(patch);
		await this.opts.repo.append(updated, {
			topic: "post.updated",
			payload: { id },
		});
		return updated;
	}

	/** Publish a post (the "publish" use case). */
	async publish(id: string): Promise<Post> {
		const existing = await this.opts.repo.findById(id);
		if (!existing) throw new PostNotFoundError(id);
		const published = existing.publish();
		await this.opts.repo.append(published, {
			topic: "post.published",
			payload: { id },
		});
		return published;
	}

	/** Delete a post and its full version history. */
	async delete(id: string): Promise<void> {
		if (!(await this.opts.repo.findById(id))) throw new PostNotFoundError(id);
		await this.opts.repo.delete(id, { topic: "post.deleted", payload: { id } });
	}

	/** Store an image for a post (delegated to the `PostAssetStore` port). */
	async uploadImage(postId: string, image: ImageUpload): Promise<PostAsset> {
		if (!this.opts.assets) {
			throw new InvalidInputError("No asset store configured");
		}
		const asset = await this.opts.assets.storeImage(postId, image);
		this.opts.bus?.publish("post.image_uploaded", { id: asset.id, postId });
		return asset;
	}
}
