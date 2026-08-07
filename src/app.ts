import { Hono } from "hono";
import type { Repos } from "./repo/repos";
import { createAllRoutes } from "./routes";

/**
 * Build the Hono app, bound to a storage-agnostic movies repository.
 * Pure factory — no database, no environment, no macros. Imported by the local
 * Bun entry (`src/main.ts`), the Worker entry (`src/worker.ts`), and tests.
 */
export function createApp(repos: Repos) {
	const app = new Hono();

	app.get("/", (c) => {
		return c.text("Hello Hono!");
	});

	createAllRoutes(app, repos);

	return app;
}
