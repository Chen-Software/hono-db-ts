import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { db } from "../db";
import { movies } from "../schema";

const app = new Hono();

// GET /movies — list all movies
app.get("/", (c: Context) => {
	const result = db.select().from(movies).all();
	return c.json(result);
});

// GET /movies/:id — get a single movie
app.get("/:id", (c: Context) => {
	const id = Number(c.req.param("id"));
	if (Number.isNaN(id)) {
		return c.json({ error: "Invalid id" }, 400);
	}

	const movie = db.select().from(movies).where(eq(movies.id, id)).get();
	if (!movie) {
		return c.json({ error: "Movie not found" }, 404);
	}

	return c.json(movie);
});

// POST /movies — create a movie
app.post("/", async (c: Context) => {
	const body = await c.req.json<{ title?: string; releaseYear?: number }>();

	if (typeof body.title !== "string" || body.title.trim().length === 0) {
		return c.json({ error: "title is required" }, 400);
	}
	if (
		body.releaseYear !== undefined &&
		(typeof body.releaseYear !== "number" ||
			!Number.isInteger(body.releaseYear))
	) {
		return c.json({ error: "releaseYear must be an integer" }, 400);
	}

	const result = db
		.insert(movies)
		.values({
			title: body.title.trim(),
			releaseYear: body.releaseYear ?? null,
		})
		.run();

	const movie = db
		.select()
		.from(movies)
		.where(eq(movies.id, Number(result.lastInsertRowid)))
		.get();

	return c.json(movie, 201);
});

// PUT /movies/:id — update a movie
app.put("/:id", async (c: Context) => {
	const id = Number(c.req.param("id"));
	if (Number.isNaN(id)) {
		return c.json({ error: "Invalid id" }, 400);
	}

	const existing = db.select().from(movies).where(eq(movies.id, id)).get();
	if (!existing) {
		return c.json({ error: "Movie not found" }, 404);
	}

	const body = await c.req.json<{
		title?: string;
		releaseYear?: number | null;
	}>();
	const updates: { title?: string; releaseYear?: number | null } = {};

	if (body.title !== undefined) {
		if (typeof body.title !== "string" || body.title.trim().length === 0) {
			return c.json({ error: "title must be a non-empty string" }, 400);
		}
		updates.title = body.title.trim();
	}

	if (body.releaseYear !== undefined) {
		if (body.releaseYear !== null) {
			if (
				typeof body.releaseYear !== "number" ||
				!Number.isInteger(body.releaseYear)
			) {
				return c.json({ error: "releaseYear must be an integer or null" }, 400);
			}
		}
		updates.releaseYear = body.releaseYear;
	}

	if (Object.keys(updates).length === 0) {
		return c.json({ error: "No fields to update" }, 400);
	}

	db.update(movies).set(updates).where(eq(movies.id, id)).run();

	const movie = db.select().from(movies).where(eq(movies.id, id)).get();

	return c.json(movie);
});

// DELETE /movies/:id — delete a movie
app.delete("/:id", (c: Context) => {
	const id = Number(c.req.param("id"));
	if (Number.isNaN(id)) {
		return c.json({ error: "Invalid id" }, 400);
	}

	const existing = db.select().from(movies).where(eq(movies.id, id)).get();
	if (!existing) {
		return c.json({ error: "Movie not found" }, 404);
	}

	db.delete(movies).where(eq(movies.id, id)).run();

	return c.json({ message: "Deleted" });
});

export { app as moviesRoutes };
