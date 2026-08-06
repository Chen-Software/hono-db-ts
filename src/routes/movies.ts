import type { Context } from "hono";
import { Hono } from "hono";
import type { MoviesRepo } from "../repo/movies-repo";
import { movieIdSchema, movieInsertSchema, movieUpdateSchema } from "../schema";

/**
 * Create the /movies REST routes bound to a movies repository.
 * Storage-agnostic — works with both the local bun:sqlite driver and Cloudflare D1.
 * Request/response payloads are validated with zod schemas derived from the Drizzle table.
 */
export function createMoviesRoutes(repo: MoviesRepo) {
	const app = new Hono();

	// GET /movies — list all movies
	app.get("/", async (c: Context) => {
		const result = await repo.list();
		return c.json(result);
	});

	// GET /movies/:id — get a single movie
	app.get("/:id", async (c: Context) => {
		const id = movieIdSchema.safeParse(c.req.param("id"));
		if (!id.success) {
			return c.json({ error: "Invalid id" }, 400);
		}

		const movie = await repo.get(id.data);
		if (!movie) {
			return c.json({ error: "Movie not found" }, 404);
		}

		return c.json(movie);
	});

	// POST /movies — create a movie
	app.post("/", async (c: Context) => {
		const body = movieInsertSchema.safeParse(await c.req.json());
		if (!body.success) {
			return c.json({ error: body.error.flatten() }, 400);
		}

		const movie = await repo.create(body.data);
		return c.json(movie, 201);
	});

	// PUT /movies/:id — update a movie
	app.put("/:id", async (c: Context) => {
		const id = movieIdSchema.safeParse(c.req.param("id"));
		if (!id.success) {
			return c.json({ error: "Invalid id" }, 400);
		}

		const existing = await repo.get(id.data);
		if (!existing) {
			return c.json({ error: "Movie not found" }, 404);
		}

		const body = movieUpdateSchema.safeParse(await c.req.json());
		if (!body.success) {
			return c.json({ error: body.error.flatten() }, 400);
		}

		if (Object.keys(body.data).length === 0) {
			return c.json({ error: "No fields to update" }, 400);
		}

		const movie = await repo.update(id.data, body.data);
		return c.json(movie);
	});

	// DELETE /movies/:id — delete a movie
	app.delete("/:id", async (c: Context) => {
		const id = movieIdSchema.safeParse(c.req.param("id"));
		if (!id.success) {
			return c.json({ error: "Invalid id" }, 400);
		}

		const removed = await repo.remove(id.data);
		if (!removed) {
			return c.json({ error: "Movie not found" }, 404);
		}

		return c.json({ message: "Deleted" });
	});

	return app;
}
