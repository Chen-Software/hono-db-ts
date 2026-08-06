import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Hono } from "hono";
import { createApp } from "../app";
import { createTursoClient } from "../db/turso-client";
import { movies } from "../db/schema";
import { createTursoMoviesRepo } from "../repo/movies-repo-turso";

/**
 * Turso endpoint tests.
 *
 * Exercise the same `/movies` API surface against a Turso database.
 * `DATABASE_TYPE` is the unified `turso`; TURSO_URL decides local (`file://`)
 * vs cloud (`libsql://`). Runs via `bun run test` when the active dialect is turso.
 */

const url =
	process.env["TURSO_URL"] ??
	process.env["TURSO_DB_URL"] ??
	"file:tursodb.db"; // relative, single-colon form (relative to process CWD)
const authToken = process.env["TURSO_AUTH_TOKEN"] ?? process.env["TURSO_TOKEN"];

let app: Hono;

beforeAll(() => {
	const db = createTursoClient({ url, authToken });
	app = createApp(createTursoMoviesRepo(db));
});

afterAll(async () => {
	const db = createTursoClient({ url, authToken });
	await db.delete(movies);
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
		const data = (await res.json()) as {
			id: number;
			title: string;
			releaseYear: number | null;
		};
		expect(data.title).toBe("Inception");
		expect(data.releaseYear).toBe(2010);
		expect(typeof data.id).toBe("number");
	});

	it("creates a movie without releaseYear", async () => {
		const res = await app.request("/movies", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Interstellar" }),
		});
		expect(res.status).toBe(201);
		const data = (await res.json()) as {
			id: number;
			title: string;
			releaseYear: number | null;
		};
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
		movieId = ((await res.json()) as { id: number }).id;
	});

	it("returns a movie by id", async () => {
		const res = await app.request(`/movies/${movieId}`);
		expect(res.status).toBe(200);
		const data = (await res.json()) as { id: number; title: string };
		expect(data.id).toBe(movieId);
		expect(data.title).toBe("The Matrix");
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
		movieId = ((await res.json()) as { id: number }).id;
	});

	it("updates a movie", async () => {
		const res = await app.request(`/movies/${movieId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "New Title", releaseYear: 2001 }),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as { title: string; releaseYear: number };
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
		movieId = ((await res.json()) as { id: number }).id;
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
