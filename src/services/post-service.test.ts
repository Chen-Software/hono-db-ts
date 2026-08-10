import { beforeEach, describe, expect, it } from "bun:test";
import { hashContent } from "../capacities/content-addressable";
import { type User } from "../models/user";
import { type Post, PostModel } from "../models/post";
import { PostRepo } from "../repository/post-repo";
import { LocalPostAssetStore } from "../providers/local-post-asset-store";
import { InMemoryBus } from "./event-bus";
import { MemoryStore } from "../storage/store";
import { PostService } from "./post-service";
import { postServiceApp } from "../transport/post-controller";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
// A valid nested author (User). When sent over the API it is plain JSON; the
// model reconstructs it through Post.from -> assertClassify.
const author: User = {
	id: crypto.randomUUID(),
	name: "Alice",
	email: "alice@example.com",
	role: "member",
	age: 25,
	created_at: "2026-08-09T12:00:00.000Z",
	updated_at: "2026-08-09T12:00:00.000Z",
};

// Valid 64-hex placeholder. The model recomputes the REAL hash from `body`, so
// this only needs to pass the `Blake3` format check at the input boundary.
const HASH_PLACEHOLDER = "a".repeat(64);

const makePost = (overrides?: Partial<Post>): Post =>
	PostModel.from({
		id: crypto.randomUUID(),
		title: "Hello world",
		body: "This is the body of the post.",
		author,
		authorId: author.id,
		published: false,
		created_at: "2026-08-09T12:00:00.000Z",
		updated_at: "2026-08-09T12:00:00.000Z",
		hash: HASH_PLACEHOLDER,
		...overrides,
	});

/** Build a plain (unvalidated) payload for sending invalid data to the API */
const payload = (overrides?: Record<string, unknown>) => ({
	id: crypto.randomUUID(),
	title: "Hello world",
	body: "This is the body of the post.",
	author,
	authorId: author.id,
	published: false,
	created_at: "2026-08-09T12:00:00.000Z",
	updated_at: "2026-08-09T12:00:00.000Z",
	hash: HASH_PLACEHOLDER,
	...overrides,
});

// ---------------------------------------------------------------------------
// SUT wiring — the composition used by every test: application service over
// ports, wrapped in the REST transport adapter. Fresh adapters per test so
// cases never share state.
// ---------------------------------------------------------------------------
let bus: InMemoryBus;
let repo: PostRepo;
let assets: LocalPostAssetStore;
let service: PostService;
let app: ReturnType<typeof postServiceApp>;
let base: Post;

beforeEach(() => {
	bus = new InMemoryBus("post-test");
	repo = new PostRepo();
	assets = new LocalPostAssetStore(new MemoryStore());
	service = new PostService({ repo, bus, assets });
	app = postServiceApp(service);
	base = makePost();
});

function request(path: string, init?: RequestInit) {
	return app.request(path.startsWith("/") ? path : `/${path}`, init);
}

function jsonBody(body: unknown, method = "POST"): RequestInit {
	return {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	};
}

/** ISO-8601 timestamps of fixed length sort chronologically as text. */
const isLater = (a: string, b: string) => a > b;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("PostService", () => {
	// -----------------------------------------------------------------------
	// POST / — create
	// -----------------------------------------------------------------------
	describe("POST /", () => {
		it("creates a valid post and returns 201", async () => {
			const res = await request("/", jsonBody(base));
			expect(res.status).toBe(201);

			const body = await res.json<Post>();
			expect(body.id).toBe(base.id);
			expect(body.title).toBe(base.title);
			expect(body.author.id).toBe(author.id);
		});

		it("stamps a correct content hash from body on create", async () => {
			const res = await request("/", jsonBody(makePost()));
			expect(res.status).toBe(201);
			const body = await res.json<Post>();
			expect(body.hash).toBe(hashContent(body.body));
		});

		it("rejects duplicate id with 409", async () => {
			await request("/", jsonBody(base));
			const res = await request("/", jsonBody(base));
			expect(res.status).toBe(409);
		});

		it("rejects bad title (empty) with 400", async () => {
			const res = await request("/", jsonBody(payload({ title: "" })));
			expect(res.status).toBe(400);
		});

		it("rejects body over 10000 chars with 400", async () => {
			const res = await request(
				"/",
				jsonBody(payload({ body: "x".repeat(10001) })),
			);
			expect(res.status).toBe(400);
		});

		it("rejects an invalid author email with 400", async () => {
			const res = await request(
				"/",
				jsonBody(payload({ author: { ...author, email: "not-an-email" } })),
			);
			expect(res.status).toBe(400);
		});

		it("publishes post.created through the bus", async () => {
			let created: string | undefined;
			bus.subscribe("post.created", (e: { id: string }) => {
				created = e.id;
			});
			const post = makePost();
			await request("/", jsonBody(post));
			expect(created).toBe(post.id);
		});
	});

	// -----------------------------------------------------------------------
	// GET / — list
	// -----------------------------------------------------------------------
	describe("GET /", () => {
		it("returns a list containing the created post", async () => {
			await request("/", jsonBody(base));
			const res = await request("/");
			expect(res.status).toBe(200);

			const list = await res.json<Post[]>();
			expect(Array.isArray(list)).toBe(true);
			expect(list.some((p) => p.id === base.id)).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// GET /:id — read
	// -----------------------------------------------------------------------
	describe("GET /:id", () => {
		it("returns the post for a valid id", async () => {
			await request("/", jsonBody(base));
			const res = await request(`/${base.id}`);
			expect(res.status).toBe(200);
			expect((await res.json<Post>()).id).toBe(base.id);
		});

		it("returns 404 for a missing id", async () => {
			const res = await request("/11111111-1111-4111-8111-111111111111");
			expect(res.status).toBe(404);
		});
	});

	// -----------------------------------------------------------------------
	// PATCH /:id — update
	// -----------------------------------------------------------------------
	describe("PATCH /:id", () => {
		it("updates title and returns the updated post", async () => {
			await request("/", jsonBody(base));
			const res = await request(
				`/${base.id}`,
				jsonBody({ title: "Updated title" }, "PATCH"),
			);
			expect(res.status).toBe(200);

			const body = await res.json<Post>();
			expect(body.title).toBe("Updated title");
			expect(body.id).toBe(base.id);
			// update created a NEW instance with the same id and a strictly
			// later version timestamp (updated_at)
			expect(isLater(body.updated_at, base.updated_at)).toBe(true);
		});

		it("recomputes the content hash when body changes on update", async () => {
			await request("/", jsonBody(base));
			const res = await request(
				`/${base.id}`,
				jsonBody({ body: "rehashed body" }, "PATCH"),
			);
			expect(res.status).toBe(200);

			const body = await res.json<Post>();
			expect(body.body).toBe("rehashed body");
			expect(body.hash).toBe(hashContent("rehashed body"));
		});

		it("returns 404 when patching non-existent post", async () => {
			const res = await request(
				"/00000000-0000-4000-8000-000000000000",
				jsonBody({ title: "Ghost" }, "PATCH"),
			);
			expect(res.status).toBe(404);
		});
	});

	// -----------------------------------------------------------------------
	// POST /:id/publish — the publish use case
	// -----------------------------------------------------------------------
	describe("POST /:id/publish", () => {
		it("publishes a post and emits post.published", async () => {
			await request("/", jsonBody(base));
			let published: string | undefined;
			bus.subscribe("post.published", (e: { id: string }) => {
				published = e.id;
			});

			const res = await request(`/${base.id}/publish`, { method: "POST" });
			expect(res.status).toBe(200);
			const body = await res.json<Post>();
			expect(body.published).toBe(true);
			expect(published).toBe(base.id);
		});

		it("returns 404 when publishing a missing post", async () => {
			const res = await request("/11111111-1111-4111-8111-111111111111/publish", {
				method: "POST",
			});
			expect(res.status).toBe(404);
		});
	});

	// -----------------------------------------------------------------------
	// GET /:id/history — full version history (immutable audit log)
	// -----------------------------------------------------------------------
	describe("GET /:id/history", () => {
		it("returns every version, newest last, with a constant id", async () => {
			await request("/", jsonBody(base));
			await request(`/${base.id}`, jsonBody({ title: "P1" }, "PATCH"));
			await request(`/${base.id}`, jsonBody({ title: "P2" }, "PATCH"));

			const res = await request(`/${base.id}/history`);
			expect(res.status).toBe(200);

			const history = await res.json<Post[]>();
			expect(Array.isArray(history)).toBe(true);
			// v1 (POST) + 1 (PATCH above) + 1 (PATCH above) = 3
			expect(history.length).toBe(3);
			expect(history.every((h) => h.id === base.id)).toBe(true);

			// version timestamps must be strictly increasing
			const stamps = history.map((h) => h.updated_at);
			for (let i = 1; i < stamps.length; i++) {
				expect(isLater(stamps[i]!, stamps[i - 1]!)).toBe(true);
			}

			// the last entry equals the current latest
			const latest = await (await request(`/${base.id}`)).json<Post>();
			const last = history[history.length - 1]!;
			expect(last.id).toBe(latest.id);
			expect(last.updated_at).toBe(latest.updated_at);
			expect(last.title).toBe(latest.title);
		});

		it("returns 404 for an unknown id", async () => {
			const res = await request(
				"/11111111-1111-4111-8111-111111111111/history",
			);
			expect(res.status).toBe(404);
		});
	});

	// -----------------------------------------------------------------------
	// DELETE /:id
	// -----------------------------------------------------------------------
	describe("DELETE /:id", () => {
		it("deletes post, emits post.deleted and returns 204", async () => {
			await request("/", jsonBody(base));
			let deleted: string | undefined;
			bus.subscribe("post.deleted", (e: { id: string }) => {
				deleted = e.id;
			});

			const res = await request(`/${base.id}`, { method: "DELETE" });
			expect(res.status).toBe(204);
			expect(deleted).toBe(base.id);
		});

		it("returns 404 when deleting an already-deleted post", async () => {
			await request("/", jsonBody(base));
			await request(`/${base.id}`, { method: "DELETE" });
			const res = await request(`/${base.id}`, { method: "DELETE" });
			expect(res.status).toBe(404);
		});
	});

	// -----------------------------------------------------------------------
	// PostAssetStore port — the application sees a business capability only
	// -----------------------------------------------------------------------
	describe("uploadImage (PostAssetStore port)", () => {
		it("stores an image and returns a business-shaped asset", async () => {
			const store = new MemoryStore();
			const assetStore = new LocalPostAssetStore(store);
			const svc = new PostService({ repo, bus, assets: assetStore });

			const asset = await svc.uploadImage(base.id, {
				data: new TextEncoder().encode("png-bytes"),
				contentType: "image/png",
				name: "cover.png",
			});

			expect(asset.postId).toBe(base.id);
			expect(asset.contentType).toBe("image/png");
			expect(asset.size).toBe(9);
			// the bytes are actually persisted behind the backend-internal key
			const blob = await store.get(asset.key);
			expect(blob).toBeDefined();
			expect(new TextDecoder().decode(blob!.data)).toBe("png-bytes");

			// and removed through the business-shaped port
			await assetStore.deleteImage(asset.id);
			expect(await store.get(asset.key)).toBeUndefined();
		});

		it("surfaces an error when no asset store is configured", async () => {
			const bare = new PostService({ repo, bus });
			await expect(
				bare.uploadImage(base.id, {
					data: new Uint8Array(),
					contentType: "image/png",
				}),
			).rejects.toThrow(/asset store/i);
		});
	});
});
