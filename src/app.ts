import { Hono } from "hono";
import type { MoviesRepo } from "./repo/movies-repo";
import { createMoviesRoutes } from "./routes/movies";

/**
 * Build the Hono app, bound to a storage-agnostic movies repository.
 * Pure factory — no database, no environment, no macros. Imported by the local
 * Bun entry (`src/main.ts`), the Worker entry (`src/worker.ts`), and tests.
 */
export function createApp(repo: MoviesRepo) {
	const app = new Hono();

	app.get("/", (c) => {
		return c.text("Hello Hono!");
	});

	app.route("/movies", createMoviesRoutes(repo));

	return app;
}
