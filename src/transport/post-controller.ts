import { Hono } from "hono";
import {
	InvalidInputError,
	PostAlreadyExistsError,
	PostNotFoundError,
	type PostService,
} from "../application/post-service";
import { InvalidStateError } from "../models/post";
import type { PostRepository } from "../ports/post-repository";

/**
 * `postServiceApp` — the REST TRANSPORT ADAPTER for `PostService`.
 *
 * Pure translation of HTTP requests into application commands:
 *
 *   POST   /:id/publish    → postService.publish(id)
 *   POST   /:id/image      → postService.uploadImage(id, image)
 *   GET    /               → postService.list()
 *   POST   /               → postService.create(command)
 *   GET    /:id            → postService.get(id)
 *   GET    /:id/history    → postService.getHistory(id)
 *   PATCH  /:id            → postService.edit(id, patch)
 *   DELETE /:id            → postService.delete(id)
 *
 * Nothing about HTTP leaks INTO the service, and nothing about business logic
 * lives here: the controller maps domain errors (404 / 409 / 400) onto HTTP
 * statuses and shapes the JSON response.
 */
export function postServiceApp(
	postService: PostService,
	queries?: PostRepository,
): Hono {
	const app = new Hono();

	// GET / — list the latest version of every post. Prefer the read-side
	// port (CQRS projection) when wired; fall back to the service otherwise.
	app.get("/", async (c) => {
		if (queries) return c.json(await queries.listLatest());
		const list = await postService.list();
		return c.json(
			list.map(
				({ id, title, published, author, created_at, updated_at, hash }) => ({
					id,
					title,
					published,
					author,
					created_at,
					updated_at,
					hash,
				}),
			),
		);
	});

	// POST / — create a post (translates the request body into a command).
	app.post("/", async (c) => {
		try {
			const data = await c.req.json();
			const post = await postService.create(data);
			return c.json(post, 201);
		} catch (e) {
			if (e instanceof PostAlreadyExistsError) {
				return c.json({ status: "error", message: e.message }, 409);
			}
			if (e instanceof InvalidInputError) {
				return c.json({ status: "error", message: e.message }, 400);
			}
			return c.json({ status: "error", message: (e as Error).message }, 400);
		}
	});

	// GET /:id — fetch the latest version of a post (read-side port when wired).
	app.get("/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const post = queries
				? await queries.findById(id)
				: await postService.get(id);
			if (!post) throw new PostNotFoundError(id);
			return c.json(post);
		} catch (e) {
			if (e instanceof PostNotFoundError) {
				return c.json({ status: "error", message: e.message }, 404);
			}
			throw e;
		}
	});

	// GET /:id/history — every version of a post (immutable audit log).
	app.get("/:id/history", async (c) => {
		try {
			const history = await postService.getHistory(c.req.param("id"));
			return c.json(history);
		} catch (e) {
			if (e instanceof PostNotFoundError) {
				return c.json({ status: "error", message: e.message }, 404);
			}
			throw e;
		}
	});

	// PATCH /:id — partial update → a new immutable version, version + 1.
	app.patch("/:id", async (c) => {
		try {
			const patch = await c.req.json();
			const post = await postService.edit(c.req.param("id"), patch);
			return c.json(post);
		} catch (e) {
			if (e instanceof PostNotFoundError) {
				return c.json({ status: "error", message: e.message }, 404);
			}
			if (e instanceof InvalidInputError) {
				return c.json({ status: "error", message: e.message }, 400);
			}
			return c.json({ status: "error", message: (e as Error).message }, 400);
		}
	});

	// POST /:id/publish — the publish use case (RPC-style action on the resource).
	app.post("/:id/publish", async (c) => {
		try {
			const post = await postService.publish(c.req.param("id"));
			return c.json(post);
		} catch (e) {
			if (e instanceof PostNotFoundError) {
				return c.json({ status: "error", message: e.message }, 404);
			}
			if (e instanceof InvalidStateError) {
				return c.json({ status: "error", message: e.message }, 409);
			}
			throw e;
		}
	});

	// DELETE /:id — remove a post and its full version history.
	app.delete("/:id", async (c) => {
		try {
			await postService.delete(c.req.param("id"));
			return c.body(null, 204);
		} catch (e) {
			if (e instanceof PostNotFoundError) {
				return c.json({ status: "error", message: e.message }, 404);
			}
			throw e;
		}
	});

	app.onError((err, c) => {
		console.error(err);
		return c.json({ status: "error", message: (err as Error).message }, 500);
	});

	return app;
}
