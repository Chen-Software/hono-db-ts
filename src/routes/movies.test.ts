import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Hono } from "hono";
import { sqliteDb as db } from "../db";
import { createApp } from "../main";
import { createSqliteMoviesRepo } from "../repo/movies-repo-sqlite";
import { movies } from "../schema";

let app: Hono;

// Minimal JSON response shape returned by the API
interface JsonMovie {
	id: number;
	title: string;
	releaseYear: number | null;
}

beforeAll(() => {
	app = createApp(createSqliteMoviesRepo());
});

// Reset the table between tests so runs are deterministic
afterAll(() => {
	db.delete(movies).run();
});

// ——— GET /movies ———

describe("GET /movies", () => {
	it("returns an empty array when no movies exist", async () => {
		const res = await app.request("/movies");
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
	});
});

// ——— POST /movies ———

describe("POST /movies", () => {
	it("creates a movie with valid data", async () => {
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

	it("returns 400 when title is missing", async () => {
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ releaseYear: 2020 }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when title is empty", async () => {
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "   ", releaseYear: 2020 }),
		});
		expect(res.status).toBe(400);
	});

	it("creates a movie without releaseYear", async () => {
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
});

// ——— GET /movies/:id ———

describe("GET /movies/:id", () => {
	let movieId: number;

	beforeAll(async () => {
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "The Matrix", releaseYear: 1999 }),
		});
		const data = (await res.json()) as JsonMovie;
		movieId = data.id;
	});

	it("returns a movie by id", async () => {
		const res = await app.request(`/movies/${movieId}`);
		expect(res.status).toBe(200);
		const data = (await res.json()) as JsonMovie;
		expect(data.id).toBe(movieId);
		expect(data.title).toBe("The Matrix");
	});

	it("returns 400 for invalid id", async () => {
		const res = await app.request("/movies/not-a-number");
		expect(res.status).toBe(400);
	});

	it("returns 404 for a missing movie", async () => {
		const res = await app.request("/movies/999999");
		expect(res.status).toBe(404);
	});
});

// ——— PUT /movies/:id ———

describe("PUT /movies/:id", () => {
	let movieId: number;

	beforeAll(async () => {
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Old Title", releaseYear: 2000 }),
		});
		const data = (await res.json()) as JsonMovie;
		movieId = data.id;
	});

	it("updates a movie", async () => {
		const res = await app.request(`/movies/${movieId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "New Title", releaseYear: 2001 }),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as JsonMovie;
		expect(data.title).toBe("New Title");
		expect(data.releaseYear).toBe(2001);
	});

	it("returns 404 for a missing movie", async () => {
		const res = await app.request("/movies/999999", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Nope" }),
		});
		expect(res.status).toBe(404);
	});

	it("returns 400 for an empty title", async () => {
		const res = await app.request(`/movies/${movieId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "   " }),
		});
		expect(res.status).toBe(400);
	});
});

// ——— DELETE /movies/:id ———

describe("DELETE /movies/:id", () => {
	let movieId: number;

	beforeAll(async () => {
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "To Be Deleted" }),
		});
		const data = (await res.json()) as JsonMovie;
		movieId = data.id;
	});

	it("deletes a movie", async () => {
		const res = await app.request(`/movies/${movieId}`, { method: "DELETE" });
		expect(res.status).toBe(200);

		const getRes = await app.request(`/movies/${movieId}`);
		expect(getRes.status).toBe(404);
	});

	it("returns 404 for a missing movie", async () => {
		const res = await app.request("/movies/999999", { method: "DELETE" });
		expect(res.status).toBe(404);
	});
});
