import { Hono } from "hono";
import type { MoviesRepo } from "./repo/movies-repo";
import { createD1MoviesRepo } from "./repo/movies-repo-d1";
import { createMoviesRoutes } from "./routes/movies";

/**
 * Build the Hono app, bound to a storage-agnostic movies repository.
 * Works with both the local bun:sqlite driver and Cloudflare D1.
 */
export function createApp(repo: MoviesRepo) {
	const app = new Hono();

	app.get("/", (c) => {
		return c.text("Hello Hono!");
	});

	app.route("/movies", createMoviesRoutes(repo));

	return app;
}

/**
 * Unified entry point for both local Bun development and Cloudflare Workers.
 *
 * - Under `bun run dev` / `bun run start`, Bun invokes `fetch(request)` with no
 *   `env`, so `env.DB` is undefined and we fall back to the local bun:sqlite
 *   repository. The repo is loaded via dynamic import so `bun:sqlite` never
 *   ends up in the Worker bundle.
 * - Under `wrangler dev` / `wrangler deploy`, `env.DB` is the D1 binding, so
 *   we use the D1-backed repository.
 */
export default {
	async fetch(
		request: Request,
		env: CloudflareBindings,
		ctx: ExecutionContext,
	) {
		const repo: MoviesRepo = env.DB
			? createD1MoviesRepo(env.DB)
			: (await import("./repo/movies-repo-sqlite")).createSqliteMoviesRepo();

		return createApp(repo).fetch(request, env, ctx);
	},
};
