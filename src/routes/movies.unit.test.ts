import { describe, expect, it } from "bun:test";
import type { Hono } from "hono";
import { createApp } from "../app";
import { type TableRepo, type Row, type Repos } from "../repo/repos";

/**
 * Unit tests for the /movies REST routes.
 *
 * These exercise the route handlers (validation, status codes, response shapes)
 * against a fake in-memory MoviesRepo — no database, no environment, no macros.
 * They run for every `bun run test` invocation regardless of DATABASE_TYPE.
 */

interface Movie {
	id: number;
	title: string;
	releaseYear: number | null;
}

/** In-memory MoviesRepo used to back the app in these tests. */
class FakeMoviesRepo implements TableRepo {
	private rows = new Map<number, any>();
	private nextId = 1;

	seed(...movies: Movie[]): void {
		for (const m of movies) this.rows.set(m.id, m);
		this.nextId = Math.max(this.nextId, ...movies.map((m) => m.id)) + 1;
	}

	async list(): Promise<Row[]> {
		return [...this.rows.values()];
	}

	async get(id: number): Promise<Row | null> {
		return this.rows.get(id) ?? null;
	}

	async create(input: Row): Promise<Row> {
		// Mirror a real DB-backed insert: an omitted releaseYear reads back as
		// null (the column is nullable), not undefined.
		const movie = {
			id: this.nextId++,
			title: (input as any).title,
			releaseYear: (input as any).releaseYear ?? null,
		};
		this.rows.set(movie.id, movie);
		return movie as Row;
	}

	async update(id: number, updates: Row): Promise<Row | null> {
		const existing = this.rows.get(id);
		if (!existing) return null;
		const next = { ...existing, ...(updates as any) };
		this.rows.set(id, next);
		return next as Row;
	}

	async remove(id: number): Promise<boolean> {
		return this.rows.delete(id);
	}
}

function makeApp(): { app: Hono; repo: FakeMoviesRepo } {
	const repo = new FakeMoviesRepo();
	const repos: Repos = { movies: repo };
	return { app: createApp(repos), repo };
}

// JSON shape returned by the API for a single movie.
interface JsonMovie {
	id: number;
	title: string;
	releaseYear: number | null;
}

describe("GET /movies", () => {
	it("returns an empty array when no movies exist", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	it("lists seeded movies", async () => {
		const { app, repo } = makeApp();
		repo.seed(
			{ id: 1, title: "Inception", releaseYear: 2010 },
			{ id: 2, title: "Interstellar", releaseYear: 2014 },
		);
		const res = await app.request("/movies");
		expect(res.status).toBe(200);
		const data = (await res.json()) as JsonMovie[];
		expect(data).toHaveLength(2);
		expect(data[0]).toEqual({ id: 1, title: "Inception", releaseYear: 2010 });
	});
});

describe("POST /movies", () => {
	it("creates a movie with valid data", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Inception", releaseYear: 2010 }),
		});
		expect(res.status).toBe(201);
		const data = (await res.json()) as JsonMovie;
		expect(data.title).toBe("Inception");
		expect(data.releaseYear).toBe(2010);
		expect(typeof data.id).toBe("number");
	});

	it("creates a movie without releaseYear", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Interstellar" }),
		});
		expect(res.status).toBe(201);
		const data = (await res.json()) as JsonMovie;
		expect(data.title).toBe("Interstellar");
		expect(data.releaseYear).toBeNull();
	});

	it("trims surrounding whitespace from the title", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "  Inception  ", releaseYear: 2010 }),
		});
		expect(res.status).toBe(201);
		const data = (await res.json()) as JsonMovie;
		expect(data.title).toBe("Inception");
	});

	it("returns 400 when title is missing", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ releaseYear: 2020 }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when title is whitespace-only", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "   ", releaseYear: 2020 }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when releaseYear is not an integer", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Inception", releaseYear: 2010.5 }),
		});
		expect(res.status).toBe(400);
	});
});

describe("GET /movies/:id", () => {
	it("returns a movie by id", async () => {
		const { app, repo } = makeApp();
		repo.seed({ id: 1, title: "The Matrix", releaseYear: 1999 });
		const res = await app.request("/movies/1");
		expect(res.status).toBe(200);
		const data = (await res.json()) as JsonMovie;
		expect(data).toEqual({ id: 1, title: "The Matrix", releaseYear: 1999 });
	});

	it("returns 400 for a non-numeric id", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies/not-a-number");
		expect(res.status).toBe(400);
	});

	it("returns 400 for a non-positive id", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies/0");
		expect(res.status).toBe(400);
	});

	it("returns 404 for a missing movie", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies/999999");
		expect(res.status).toBe(404);
	});
});

describe("PUT /movies/:id", () => {
	it("updates a movie", async () => {
		const { app, repo } = makeApp();
		repo.seed({ id: 1, title: "Old Title", releaseYear: 2000 });
		const res = await app.request("/movies/1", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "New Title", releaseYear: 2001 }),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as JsonMovie;
		expect(data).toEqual({ id: 1, title: "New Title", releaseYear: 2001 });
	});

	it("updates only the provided fields", async () => {
		const { app, repo } = makeApp();
		repo.seed({ id: 1, title: "Old Title", releaseYear: 2000 });
		const res = await app.request("/movies/1", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ releaseYear: 2020 }),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as JsonMovie;
		expect(data).toEqual({ id: 1, title: "Old Title", releaseYear: 2020 });
	});

	it("returns 404 for a missing movie", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies/999999", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Nope" }),
		});
		expect(res.status).toBe(404);
	});

	it("returns 400 for a whitespace-only title", async () => {
		const { app, repo } = makeApp();
		repo.seed({ id: 1, title: "Old Title", releaseYear: 2000 });
		const res = await app.request("/movies/1", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "   " }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when the body has no updatable fields", async () => {
		const { app, repo } = makeApp();
		repo.seed({ id: 1, title: "Old Title", releaseYear: 2000 });
		const res = await app.request("/movies/1", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});
});

describe("DELETE /movies/:id", () => {
	it("deletes a movie", async () => {
		const { app, repo } = makeApp();
		repo.seed({ id: 1, title: "To Be Deleted", releaseYear: 2000 });
		const res = await app.request("/movies/1", { method: "DELETE" });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: "Deleted" });

		const getRes = await app.request("/movies/1");
		expect(getRes.status).toBe(404);
	});

	it("returns 404 for a missing movie", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies/999999", { method: "DELETE" });
		expect(res.status).toBe(404);
	});

	it("returns 400 for a non-numeric id", async () => {
		const { app } = makeApp();
		const res = await app.request("/movies/not-a-number", {
			method: "DELETE",
		});
		expect(res.status).toBe(400);
	});
});
