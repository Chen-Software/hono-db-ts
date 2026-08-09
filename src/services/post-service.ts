import { typiaValidator } from "@hono/typia-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { User } from "../models/user";
import { Post, PostModel } from "../models/post";
import { createVersionHistoryStore } from "./version-history-store";

// In-memory append-only version history — SAME shared store shape as
// UserService. The `Post` model composes the identical `Versioned` capacity
// that `User` does, so every stored `Post` is immutable and carries the same
// `id` with a strictly-later `updated_at` (the version). The history mechanics
// (create / append / latest / history / remove) are reused verbatim from
// `version-history-store.ts` — no copy-paste of the Map or its helpers.
const store = createVersionHistoryStore<Post>();

const PostService = new Hono();

// GET / — list the latest version of every post
PostService.get("/", (c) => {
	const list = store.listLatest().map((p) => {
		const { id, title, published, author, created_at, updated_at } = p;
		return { id, title, published, author, created_at, updated_at };
	});
	return c.json(list);
});

// POST / — create a post with typia validation
PostService.post("/", typiaValidator("json", PostModel.validate), (c) => {
	const data = c.req.valid("json"); // typed as Post
	if (store.has(data.id)) {
		throw new HTTPException(409, { message: "Post already exists" });
	}
	// `author` is a nested `User` AGGREGATE. typia's `validate` does not fully
	// recurse into a class-typed property (it misses e.g. the author's email
	// format), so we validate the author explicitly at the API boundary.
	const authorResult = User.validate(data.author);
	if (!authorResult.success) {
		throw new HTTPException(400, { message: "Invalid author" });
	}
	// `updated_at` is authoritative: the first version is stamped with the
	// entity's birth time (`created_at`), regardless of what the client sent.
	const created = Post.from({ ...data, updated_at: data.created_at });
	store.create(created);
	return c.json(created, 201);
});

// GET /:id — fetch the latest version of a post
PostService.get("/:id", (c) => {
	const id = c.req.param("id");
	const post = store.latestOf(id);
	if (!post) {
		throw new HTTPException(404, { message: "Post not found" });
	}
	return c.json(post);
});

// GET /:id/history — fetch every version of a post (immutable audit log)
PostService.get("/:id/history", (c) => {
	const id = c.req.param("id");
	const history = store.historyOf(id);
	if (!history || history.length === 0) {
		throw new HTTPException(404, { message: "Post not found" });
	}
	return c.json(history);
});

// PATCH /:id — partial update: creates a NEW instance, same id, version + 1
PostService.patch(
	"/:id",
	typiaValidator("json", PostModel.validatePartial),
	(c) => {
		const id = c.req.param("id");
		const existing = store.latestOf(id);
		if (!existing) {
			throw new HTTPException(404, { message: "Post not found" });
		}
		const patch = c.req.valid("json"); // typed as Partial<Post>
		// Validate a nested author aggregate if the patch supplies one.
		if (patch.author) {
			const authorResult = User.validate(patch.author);
			if (!authorResult.success) {
				throw new HTTPException(400, { message: "Invalid author" });
			}
		}
		// `existing.update` builds a brand-new immutable instance: same `id`, a
		// strictly-later `updated_at` (the version), and any `id`/`updated_at`
		// in the patch is overridden.
		const updated = existing.update(patch);
		store.append(updated);
		return c.json(updated);
	},
);

// DELETE /:id — remove a post and its full version history
PostService.delete("/:id", (c) => {
	const id = c.req.param("id");
	if (!store.has(id)) {
		throw new HTTPException(404, { message: "Post not found" });
	}
	store.remove(id);
	return c.body(null, 204);
});

PostService.onError((err, c) => {
	console.error(err);
	if (err instanceof HTTPException) {
		return c.json({ status: "error", message: err.message }, err.status);
	}
	return c.json({ status: "error", message: err.message }, 500);
});

export { PostService };
